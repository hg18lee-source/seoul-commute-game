import { randomUUID } from 'node:crypto';
import { courses, expiryMs, initialState, rules, ruleVersions, validateBatch } from './rules.mjs';

const recordPageSize = 6;

export const uuid = value => typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const knownCourse = value => typeof value==='string'&&Object.hasOwn(courses,value);
export const allow = (body,status=200,reason='ok') => ({body,status,outcome:'ALLOW',reason});
export const block = (status,reason) => ({body:{error:reason},status,outcome:'BLOCK',reason});
export const fail = (status,reason,body={error:reason}) => ({body,status,outcome:'FAIL',reason});

function date(ms) {return new Date(ms);}

export async function start(db, ctx, body, now) {
  if (!knownCourse(body.course)) return block(400,'course');
  const id=randomUUID();
  await db.query(
    "INSERT INTO commute_plays(id,user_id,session_hash,course,rules,status,started_at,seen_at,state) VALUES($1,$2,$3,$4,$5,'active',$6,$6,$7)",
    [id,ctx.user.id,ctx.tokenHash,body.course,rules,date(now),initialState(body.course)]);
  ctx.playId=id;
  return allow({id,course:body.course,rules},201,'play_started');
}

async function end(db,id,status,reason) {
  await db.query('UPDATE commute_plays SET status=$2,invalid_reason=$3 WHERE id=$1',[id,status,reason]);
}

export async function advance(db, ctx, body, action, now) {
  if (!uuid(body.id)) return block(400,'play_id');
  ctx.playId=body.id;
  const {rows:[p]}=await db.query(
    'SELECT *,EXTRACT(epoch FROM started_at)*1000 AS start_ms,EXTRACT(epoch FROM seen_at)*1000 AS seen_ms,'+
    'EXTRACT(epoch FROM paused_at)*1000 AS pause_ms FROM commute_plays WHERE id=$1 AND user_id=$2 AND session_hash=$3 FOR UPDATE',
    [body.id,ctx.user.id,ctx.tokenHash]);
  if (!p) return block(404,'play_not_found');
  if (p.status!=='active') return block(409,p.invalid_reason==='connection_lost'?'connection_lost':'play_closed');
  if (now-Number(p.seen_ms)>=expiryMs || now-Number(p.start_ms)>7200000 || !Object.hasOwn(ruleVersions,p.rules)) {
    await end(db,p.id,'invalid',Object.hasOwn(ruleVersions,p.rules)?'connection_lost':'rules_changed');
    return block(409,Object.hasOwn(ruleVersions,p.rules)?'connection_lost':'rules_changed');
  }
  if (action==='play-cancel') {
    await end(db,p.id,'cancelled','cancelled');
    return allow({},200,'play_cancelled');
  }
  if (action==='play-progress'&&Number.isInteger(body.seq)&&body.seq===p.seq&&p.seq>0) {
    return allow({seq:p.seq},200,'progress_retry');
  }
  if (!Number.isInteger(body.seq)||body.seq!==p.seq+1) return block(409,'sequence');
  const result=validateBatch(p,body,now);
  if (result.reason) {
    await end(db,p.id,'invalid',result.reason);
    return block(422,result.reason);
  }
  const {state,pausedMs,pausedAt,checked}=result;
  const ended=action==='play-finish';
  const requiredFinishStage=courses[p.course].transport==='train'?'exit-street':'office';
  const finishPoint=courses[p.course].finishPoint??{x:0,z:-26,radius:1.2};
  if (ended&&(state.paused||state.point.stage!==requiredFinishStage
      ||Math.hypot(state.point.x-finishPoint.x,state.point.z-finishPoint.z)>=finishPoint.radius+.015)) {
    await end(db,p.id,'invalid','portal_required');
    return block(422,'portal_required');
  }
  await db.query('UPDATE commute_plays SET seen_at=$2,paused_at=$3,paused_ms=$4,seq=$5,state=$6,status=$7 WHERE id=$1',
    [p.id,date(now),pausedAt===null?null:date(pausedAt),pausedMs,body.seq,state,ended?'success':'active']);
  await db.query('INSERT INTO commute_progress (play_id,seq,received_at,events) VALUES($1,$2,$3,$4)',
    [p.id,body.seq,date(now),JSON.stringify(checked)]);
  if (!ended) return allow({seq:body.seq},200,'progress_saved');

  await db.query('SELECT id FROM commute_users WHERE id=$1 FOR NO KEY UPDATE',[ctx.user.id]);
  const args=[ctx.user.id,p.course,p.rules];
  const {rows:[prior]}=await db.query(
    'SELECT min(tenths) AS best FROM commute_records WHERE user_id=$1 AND course=$2 AND rules=$3',args);
  const tenths=Math.round((now-Number(p.start_ms)-pausedMs)/100)+Math.round((state.point.penalty??0)*10);
  await db.query('INSERT INTO commute_records(play_id,user_id,course,rules,tenths,finished_at) VALUES($1,$2,$3,$4,$5,$6)',
    [p.id,...args,tenths,date(now)]);
  return allow({tenths,best:prior.best===null?null:Math.min(prior.best,tenths),course:p.course},201,'record_saved');
}

export async function records(db, ctx, url) {
  const page=pageNumber(url);
  const {rows}=await db.query(
    'SELECT play_id,course,rules,tenths,finished_at FROM commute_records WHERE user_id=$1 ORDER BY finished_at DESC,play_id LIMIT 7 OFFSET $2',
    [ctx.user.id,(page-1)*recordPageSize]);
  return allow({rows:rows.slice(0,recordPageSize),next:rows.length>recordPageSize,page,courses,ruleVersions});
}

export function pageNumber(url) {
  const page=Number(url.searchParams.get('page') ?? 1);
  return Number.isInteger(page)&&page>0&&page<=2000?page:1;
}

export async function ranking(db, ctx, url) {
  const course=url.searchParams.get('course'), page=pageNumber(url);
  if (!knownCourse(course)) return block(400,'course');
  const version=url.searchParams.get('rules')??rules;
  if(!Object.hasOwn(ruleVersions,version)) return block(400,'rules');
  const {rows}=await db.query(
    'WITH best AS (SELECT user_id,min(tenths) AS tenths FROM commute_records WHERE course=$1 AND rules=$2 GROUP BY user_id), '+
    'ranked AS (SELECT user_id,tenths,rank() OVER (ORDER BY tenths)::int AS rank FROM best) '+
    'SELECT u.nickname,r.tenths,r.rank,r.user_id=$3 AS mine FROM ranked r JOIN commute_users u ON r.user_id=u.id '+
    'ORDER BY r.rank,r.user_id LIMIT 7 OFFSET $4',[course,version,ctx.user.id,(page-1)*recordPageSize]);
  return allow({rows:rows.slice(0,recordPageSize),next:rows.length>recordPageSize,page,course,rules:version});
}
