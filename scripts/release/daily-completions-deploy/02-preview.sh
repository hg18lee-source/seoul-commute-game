# Source this file in the same Bash session; do not run separately.
bash tutorial/run-local.sh --test
node --test tutorial/tests/tutorial.test.mjs

# 아래 입력은 제공자에서 Vercel에 연결된 두 대상을 각각 확인한 다음 진행한다.
db_fingerprint() {
  node -e 'const {createHash}=require("node:crypto");
    try {
      const u=new URL(process.env.DATABASE_URL);
      if(!["postgres:","postgresql:"].includes(u.protocol)||!u.hostname||u.pathname.length<2||u.searchParams.has("host")) process.exit(1);
      const endpoint=u.hostname.toLowerCase().replace(/-pooler(?=\.)/,"");
      console.log(createHash("sha256").update(JSON.stringify([endpoint,u.port||"5432",decodeURIComponent(u.pathname)])).digest("hex"));
    } catch {process.exit(1);}'
}
capture_target() (
  set +x
  local target="$1"
  read -r -s -p "확인한 $target 런타임 DATABASE_URL: " DATABASE_URL </dev/tty
  printf '\n' >&2
  export DATABASE_URL
  db_fingerprint > "$work/$target.fingerprint"
)
capture_target Preview
capture_target Production
if cmp -s "$work/Preview.fingerprint" "$work/Production.fingerprint"; then
  printf 'Preview와 Production DB 대상이 같습니다. 중단합니다.\n' >&2
  exit 1
fi
# 이후 연결은 앞에서 확인한 각 환경의 대상과 일치해야 한다.
migrate_target() (
  set +x
  set -euo pipefail
  local target="$1"
  cd "$work/upload"
  unset DATABASE_URL DIRECT_DATABASE_URL VERCEL
  read -r -s -p "$target Vercel 런타임 DATABASE_URL: " DATABASE_URL </dev/tty
  printf '\n' >&2
  test -n "$DATABASE_URL"
  export DATABASE_URL
  test "$(db_fingerprint)" = "$(cat "$work/$target.fingerprint")"
  node --input-type=module <<'JS'
import {makePool} from './server/db.mjs';
const pool=makePool();
try {
  const {rows:[s]}=await pool.query(`SELECT
    to_regclass('public.commute_users') IS NOT NULL AS accounts,
    to_regclass('public.commute_records') IS NOT NULL AS records,
    to_regclass('public.commute_audit') IS NOT NULL AS audit,
    to_regclass('public.commute_daily_completion_runs') IS NOT NULL AS daily,
    to_regclass('public.commute_records_daily') IS NOT NULL AS daily_index`);
  console.log(s);
  if(process.env.RELEASE_DB_TARGET==='Production'&&(!s.accounts||!s.records||!s.audit))
    process.exitCode=1;
  if(s.records) {
    const {rows}=await pool.query(`SELECT column_name, udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='commute_records'
      AND column_name IN ('play_id','course','rules','tenths','finished_at')`);
    const actual=Object.fromEntries(rows.map(r=>[r.column_name,r.udt_name]));
    const expected={play_id:'uuid',course:'text',rules:'text',tenths:'int4',finished_at:'timestamptz'};
    if(Object.entries(expected).some(([name,type])=>actual[name]!==type)) process.exitCode=1;
  }
} catch {console.error('DB 스키마 확인 실패');process.exitCode=1;}
finally {await pool.end();}
JS
  node scripts/migrate.mjs
  node --input-type=module <<'JS'
import {makePool} from './server/db.mjs';
const pool=makePool();
try {
  const {rows:[s]}=await pool.query(`SELECT
    (SELECT count(*)::int FROM commute_migrations WHERE name='002_daily_completions.sql')=1 AS applied,
    to_regclass('public.commute_daily_completion_runs') IS NOT NULL AS daily,
    exists(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.commute_records_daily') AND indisvalid) AS valid_index`);
  console.log(s);
  if(!s.applied||!s.daily||!s.valid_index) process.exitCode=1;
} catch {console.error('마이그레이션 결과 확인 실패');process.exitCode=1;}
finally {await pool.end();}
JS
)
RELEASE_DB_TARGET=Preview migrate_target Preview
preview="$(vercel deploy "$work/upload" --scope "$scope" --environment preview --json \
  --meta "githubCommitRef=$branch" --meta "sourceCommit=$sha" | deployment)"
printf 'Preview %s @ %s\n' "$preview" "$sha"
vercel inspect "$preview" --scope "$scope"
