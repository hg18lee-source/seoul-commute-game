import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { courses, officialRules } from './rules.mjs';

const zone = 'Asia/Seoul';
const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
const versions = Object.entries(officialRules).map(([course, rules]) => ({ course, rules }));
const filter = `WITH bounds AS (
  SELECT $1::date::timestamp AT TIME ZONE 'Asia/Seoul' AS start_at,
         ($1::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul' AS end_at
), eligible AS (
  SELECT r.play_id, r.course, r.rules, r.tenths, r.finished_at
  FROM commute_records r
  JOIN jsonb_to_recordset($2::jsonb) v(course text, rules text) USING (course, rules)
  CROSS JOIN bounds b
  WHERE r.finished_at >= b.start_at AND r.finished_at < b.end_at
)`;
const plan = date => [date, JSON.stringify(versions)];

export function seoulDate(at) {return formatter.format(at);}

const fastestByCourse = `
    SELECT course, play_id, tenths, count FROM (
      SELECT eligible.*, count(*) OVER (PARTITION BY course)::int AS count, row_number() OVER
      (PARTITION BY course ORDER BY tenths, finished_at, play_id) AS position FROM eligible) ranked
    WHERE position = 1`;

function summarize(rows) {
  const byCourse = versions.map(({ course, rules }) => {
    const first = rows.find(row => row.course === course);
    return { course, rules, count: first?.count ?? 0,
      fastest: first ? { playId: first.play_id, tenths: first.tenths } : null };
  });
  return { count: byCourse.reduce((sum, row) => sum + row.count, 0), byCourse };
}

export async function completionOverview(db, date) {
  const { rows: [{ totals, id, ended_at, summary: previous }] } = await db.query(filter + `
    SELECT totals, last.id, last.ended_at, last.summary
    FROM (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) AS totals FROM (${fastestByCourse}) t) a
    LEFT JOIN LATERAL (
      SELECT id, ended_at, summary FROM commute_daily_completion_runs
      WHERE target_date = $1 AND status IN ('success','unchanged')
      ORDER BY sequence DESC LIMIT 1
    ) last ON true`, plan(date));
  const summary = summarize(totals);
  const matchesLastRun = isDeepStrictEqual(previous,summary);
  return { date, zone, ...summary, lastSuccessAt: ended_at, runId: id, matchesLastRun, courses };
}

const size = 20;
function paginate(rows) {
  const nextCursor=rows.length>size ? rows[size-1].cursor : null;
  return { rows: rows.slice(0,size).map(({cursor,...row})=>row), nextCursor };
}

export async function completionEvidence(db, date, {at,playId}={}) {
  const { rows } = await db.query(filter + `
    , ranked AS (
      SELECT *, row_number() OVER (PARTITION BY course ORDER BY tenths, finished_at, play_id) = 1 AS fastest
      FROM eligible
    )
    SELECT *, to_char(finished_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || ',' || play_id AS cursor
    FROM ranked WHERE $3::timestamptz IS NULL OR (finished_at,play_id) < ($3::timestamptz,$4::uuid)
    ORDER BY finished_at DESC, play_id DESC LIMIT $5`,
  [...plan(date), at??null, playId??null, size+1]);
  return { date, zone, versions, ...paginate(rows) };
}

export async function completionRuns(db, date, before) {
  const { rows } = await db.query(`
    SELECT id, cause, request_id, play_id, to_char(target_date,'YYYY-MM-DD') AS target_date,
      started_at, ended_at, status, previous, summary, reason, sequence::text AS cursor
    FROM commute_daily_completion_runs WHERE target_date = $1 AND ($2::bigint IS NULL OR sequence < $2)
    ORDER BY sequence DESC LIMIT $3`, [date, before, size+1]);
  return { date, zone, ...paginate(rows) };
}

export function newCompletionRun({ cause, requestId, playId = null, date, start }) {
  return { id: randomUUID(), cause, requestId, playId, date, start };
}

async function logRun(db, run, end, status, previous, summary, reason = null) {
  await db.query(`
    INSERT INTO commute_daily_completion_runs
      (id, cause, request_id, play_id, target_date, started_at, ended_at, status, previous, summary, reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
  [run.id, run.cause, run.requestId, run.playId, run.date, run.start, end, status, previous, summary, reason]);
}

export async function logCompletionFailure(db, run, end) {
  await logRun(db, run, end, 'failed', null, null, 'aggregate_error');
}

export async function refreshCompletions(db, run, now) {
  // The row insert and calculation share this transaction. Each date has a separate lock.
  await db.query('SAVEPOINT daily_completion');
  try {
    await db.query("SET LOCAL statement_timeout = '2s'");
    await db.query("SELECT pg_advisory_xact_lock(624023082, $1::date - DATE '2000-01-01')", [run.date]);
    const {rows}=await db.query(filter+fastestByCourse,plan(run.date));
    const summary = summarize(rows);
    const { rows: [prior] } = await db.query(`
      SELECT summary, summary = $2::jsonb AS same FROM commute_daily_completion_runs
      WHERE target_date = $1 AND status IN ('success','unchanged')
      ORDER BY sequence DESC LIMIT 1`, [run.date, JSON.stringify(summary)]);
    const status = prior?.same ? 'unchanged' : 'success';
    await logRun(db, run, new Date(now()), status, prior?.summary ?? null, summary);
    await db.query("SET LOCAL statement_timeout = '18s'");
    await db.query('RELEASE SAVEPOINT daily_completion');
    return { runId: run.id, status };
  } catch {
    await db.query('ROLLBACK TO SAVEPOINT daily_completion');
    await logCompletionFailure(db, run, new Date(now()));
    await db.query('RELEASE SAVEPOINT daily_completion');
    return { runId: run.id, status: 'failed' };
  }
}
