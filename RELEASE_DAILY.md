# 오늘의 공식 완주 현황 배포

대상은 Vercel 팀 `htsq`의 기존 `seoul-commute-online` 프로젝트다. 공개 주소는 https://seoul-commute-online.vercel.app/ 이고 관리자 화면은 같은 출처의 `/administrator`다. 아래 명령은 일반 Ubuntu/WSL의 **같은 Bash 터미널**에서 블록 순서대로 실행한다. 중간 검증이 실패하면 이후 블록을 실행하지 않는다.

## 1. 커밋·프로젝트·현재 Production 확인

```bash
set +x
set -euo pipefail
umask 077
cd '/mnt/c/Users/통신운용/Desktop/AWS프로젝트/seoul-commute-entrance-integrated'
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use 22
fi
test "$(node -p 'process.versions.node.split(".")[0]')" = 22
command -v vercel >/dev/null || npm install -g vercel@66.6.0
git status --short --branch
test -z "$(git status --porcelain)"
branch='codex/release-daily-completions'
test "$(git branch --show-current)" = "$branch"
sha="$(git rev-parse HEAD)"
printf '배포 소스 %s @ %s\n' "$branch" "$sha"
# 이 문서와 배포 후보 SHA를 배포 전 최종 보고의 값과 대조한다.
work="$(mktemp -d /tmp/commute-daily-release.XXXXXXXX)"
receipt_dir="$PWD/../seoul-commute-vercel-release"
scope=htsq
project=seoul-commute-online
public=https://seoul-commute-online.vercel.app
link="$PWD/../seoul-commute-online/.vercel/project.json"
mkdir -p "$receipt_dir" "$work/upload/.vercel"
unset VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID
vercel whoami
vercel project inspect "$project" --scope "$scope" --json > "$work/project.json"
node - "$link" "$work/project.json" <<'JS'
const fs=require('node:fs');
const [local,remote]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p,'utf8')));
if (local.projectName!=='seoul-commute-online'||local.projectId!==remote.id||remote.name!==local.projectName)
  throw new Error('Vercel project link mismatch');
JS
vercel inspect "$public" --scope "$scope" > "$work/previous-production.txt" 2>&1
cat "$work/previous-production.txt"
curl -fsS "$public/" -o "$work/previous-index.html"
git archive "$sha:online-game" | tar -xf - -C "$work/upload"
cp "$link" "$work/upload/.vercel/project.json"
test -f "$work/upload/migrations/002_daily_completions.sql"
npm --prefix "$work/upload" ci --engine-strict --no-audit --no-fund
npm --prefix "$work/upload" run build
asset="$(rg -o 'game-assets/[a-f0-9]+/game\.js' "$work/upload/public-online/index.html")"
test -n "$asset"
deployment() {
  node -e 'const x=JSON.parse(require("node:fs").readFileSync(0,"utf8"));
    const url=x.deployment?.url??x.url??"";
    if(!/^https:\/\/[a-z0-9-]+\.vercel\.app\/?$/i.test(url)) process.exit(1);
    console.log(url);'
}
```

Vercel 대시보드에서 기존 Production 배포의 `sourceCommit` 또는 연결된 Git SHA를 확인한다. SHA가 로컬에 존재할 때 `git merge-base --is-ancestor "$current_sha" "$sha"`를 실행해 현재 변경이 후보에 포함되는지 확인한다. 이전 CLI 배포에 Git 메타데이터가 없다면, 공개 번들 경로와 바이트를 확인된 로컬 후보에 대조하고 API 릴리스 기록도 확인한다. 확인된 최신 Preview 기준 `c2f7551`의 게임 번들은 `game-assets/a05cacc316ed9d8d/game.js`이고 SHA-256은 `ddf9dd9e1c96586a44c9e35ea40b1fbdc72998a1ba2f52d3d0999db3e894091c`이다. 현재 Production이 후보에 포함되지 않는 변경을 제공하거나 서버 기준을 확인할 수 없으면 먼저 실제 Production 소스를 확보한다. Vercel의 Node 버전은 22.x, 빌드 소스 경로는 아카이브 루트여야 한다.

## 2. 분리된 Preview DB와 배포

Vercel 프로젝트 설정에서 해당 브랜치가 받는 **Preview** DB와 전용 인증 시크릿을 확인한다. DB 제공자 화면에서 Production과 다른 프로젝트 또는 분리된 DB 브랜치인지 확인한다. 최초 Preview라면 DB를 분리하고 기존 Production 데이터를 복제하지 않은 깨끗한 DB를 연결한다. 실행 전 로컬 테스트를 통과시킨다.

```bash
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
```

Preview 전용 관리자 계정이 없으면 같은 Preview DB와 Preview 전용 pepper를 숨김 입력해 생성한다. 운영에는 이 명령을 실행하지 않는다.

```bash
(
  set +x
  cd "$work/upload"
  unset DIRECT_DATABASE_URL
  read -r -s -p 'Preview DB URL: ' DATABASE_URL; printf '\n'
  read -r -s -p 'Preview PASSWORD_PEPPER: ' PASSWORD_PEPPER; printf '\n'
  export DATABASE_URL PASSWORD_PEPPER
  test "$(db_fingerprint)" = "$(cat "$work/Preview.fingerprint")"
  node scripts/admin.mjs 검증관리자
)
```

Preview의 `/?admin=1`과 `/administrator`에서 관리자 세션을 확인한다. 별도 브라우저 프로필로 가입·튜토리얼·지하철·버스 플레이와 공식 완주를 확인한다. 화면이 자동 갱신되고 건수, 두 최단 시간, 원본 플레이 ID와 실행 ID, 재계산이 일치해야 한다. 격리 DB 통합 테스트에서 중복 제출과 이전 버전 필터를 확인하고, Preview에서는 일반 계정으로 관리자 API가 403을 반환하는지 확인한다. 공덕역 승강장에서 지상으로 나갔다가 새 계단으로 재진입하는 경로도 확인한다. 테스트 계정과 데이터는 Preview에만 둔다.

## 3. Production DB 마이그레이션과 같은 커밋 배포

Preview가 통과한 뒤 DB 제공자와 Vercel 양쪽에서 **Production 런타임 DB**를 다시 대조한다. 기존 Production 코드에는 새 테이블 의존성이 없다. 마이그레이션은 새 테이블과 인덱스를 추가하며, 기존 행을 수정하거나 삭제하지 않는다. 마이그레이션 이력과 advisory lock이 중복 적용을 막는다. 일반 인덱스 생성 중 기록 쓰기가 잠시 대기할 수 있어 트래픽이 낮을 때 적용한다. 락 대기와 SQL 실행에는 제한이 있으며 실패 시 전체 마이그레이션이 롤백된다. 기존 기록은 즉시 원본에서 조회하므로 별도 백필이 필요 없다. 첫 성공 시각은 이후 실제 완주 또는 관리자의 재계산으로 채워진다.

```bash
test "$(git rev-parse HEAD)" = "$sha"
test -z "$(git status --porcelain)"
vercel inspect "$public" --scope "$scope" > "$work/current-production.txt" 2>&1
# inspect 출력의 상대 시각은 변할 수 있어 배포 ID만 비교한다.
before_id="$(rg -o 'dpl_[[:alnum:]]+' "$work/previous-production.txt" | head -n 1)"
current_id="$(rg -o 'dpl_[[:alnum:]]+' "$work/current-production.txt" | head -n 1)"
test -n "$before_id"
test "$before_id" = "$current_id"
printf '%s\n' "$before_id" > "$receipt_dir/daily-rollback-$sha.txt"
RELEASE_DB_TARGET=Production migrate_target Production
vercel inspect "$public" --scope "$scope" > "$work/current-production.txt" 2>&1
current_id="$(rg -o 'dpl_[[:alnum:]]+' "$work/current-production.txt" | head -n 1)"
test "$before_id" = "$current_id"

production="$(vercel deploy "$work/upload" --scope "$scope" --prod --json \
  --meta "githubCommitRef=$branch" --meta "sourceCommit=$sha" | deployment)"
printf 'Production %s @ %s\n' "$production" "$sha"
vercel inspect "$production" --scope "$scope" > "$work/new-production.txt" 2>&1
vercel inspect "$public" --scope "$scope" 2>&1 | tee "$receipt_dir/daily-production-$sha.txt"
deployed_id="$(rg -o 'dpl_[[:alnum:]]+' "$work/new-production.txt" | head -n 1)"
alias_id="$(rg -o 'dpl_[[:alnum:]]+' "$receipt_dir/daily-production-$sha.txt" | head -n 1)"
test -n "$deployed_id"
test "$deployed_id" = "$alias_id"
curl -fsS "$public/" -o "$work/public-index.html"
rg -Fq "$asset" "$work/public-index.html"
for file in "$asset" admin-completions.js; do
  curl -fsS "$public/$file" -o "$work/public-asset"
  cmp "$work/public-asset" "$work/upload/public-online/$file"
done
```

마이그레이션 명령이 실패하면 Production 배포 명령을 실행하지 않는다. 공개 주소에서 기존 관리자 계정으로 로그인하고 현재 카드, 근거, 실행 이력 및 권한을 확인한다. 운영 검증에는 가짜 완주 데이터를 넣지 않는다. 첫 신규 실제 완주에서 자동 실행과 집계 변화가 관측될 때까지 공개 화면 확인과 운영 자동 갱신 확인을 구분한다. 작업이 끝나면 임시 아카이브를 삭제한다.

## 롤백

운영 코드를 이전 배포로 되돌린다. 새 테이블, 인덱스, 원본 기록, 기존 환경 설정은 보존한다. 이전 서버가 지하철 v6 규칙을 모르면 진행 중인 v6 플레이는 재개할 수 없다. 긴급 상황이 아니라면 진행이 적은 시간에 적용하고, 이미 저장된 v6 완주 기록은 DB에 남는다. 이전 서버의 랭킹은 자체 규칙 버전을 표시한다.

```bash
vercel rollback "$(cat "$receipt_dir/daily-rollback-$sha.txt")" --scope "$scope"
vercel inspect "$public" --scope "$scope"
```
