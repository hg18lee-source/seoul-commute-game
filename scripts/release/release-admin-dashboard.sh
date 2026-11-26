#!/usr/bin/env bash
set +x
set -Eeuo pipefail
umask 077

: "${RELEASE_SOURCE_REPO:?Set RELEASE_SOURCE_REPO to the seoul-commute-entrance-integrated checkout}"
repo=$(git -C "$RELEASE_SOURCE_REPO" rev-parse --show-toplevel)
cd -- "$repo"
branch=codex/admin-dashboard-review
sha=0511ea82dbb969357766a28828c528517e04f219
remote=https://github.com/hg18lee-source/seoul-commute-game.git
scope=htsq
project=seoul-commute-online
public=https://seoul-commute-online.vercel.app
link="${VERCEL_LINK_FILE:-$repo/online-game/.vercel/project.json}"
work=$(mktemp -d /tmp/commute-admin-release.XXXXXXXX)
receipt="${RELEASE_RECEIPT_DIR:-$repo/.release}/admin-$sha"
mkdir -p -- "$receipt" "$work/upload/.vercel"
trap 'rm -rf -- "$work"' EXIT

fail() { printf '%s\n' "$*" >&2; exit 1; }
confirm() {
  local answer
  printf '%s\n' "$1" >&2
  read -r -p '확인했으면 YES를 입력하세요: ' answer </dev/tty
  [[ "$answer" == YES ]] || fail '검증이 확인되지 않아 중단했습니다.'
}
deployment_api() {
  local host=${1#https://}
  host=${host%/}
  [[ "$host" =~ ^[a-zA-Z0-9-]+\.vercel\.app$ || "$host" =~ ^dpl_[[:alnum:]]+$ ]] ||
    fail 'Vercel 배포 주소 또는 ID 형식이 다릅니다.'
  vercel api "/v13/deployments/$host?withGitRepoInfo=true" --scope "$scope" --raw > "$2"
}
verify_deployment() {
  local url=$1 target=$2
  deployment_api "$url" "$work/deployment.json"
  node - "$work/deployment.json" "$link" "$sha" "$branch" "$target" <<'JS'
const fs = require('node:fs');
const [response, link, expected, branch, target] = process.argv.slice(2);
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const deployment = read(response);
const project = read(link);
const meta = deployment.meta ?? {};
const evidence = {
  sourceCommit: meta.sourceCommit ?? null,
  githubCommitSha: meta.githubCommitSha ?? null,
  gitSourceSha: deployment.gitSource?.sha ?? null,
};
console.log(JSON.stringify({
  id: deployment.id ?? null, projectId: deployment.projectId ?? null,
  target: deployment.target ?? null, readyState: deployment.readyState ?? null,
  expected, meta: {
    sourceCommit: evidence.sourceCommit, githubCommitSha: evidence.githubCommitSha,
    githubCommitRef: meta.githubCommitRef ?? null,
  },
  gitSource: {sha: evidence.gitSourceSha, ref: deployment.gitSource?.ref ?? null},
}, null, 2));
if (deployment.projectId !== project.projectId || deployment.readyState !== 'READY' ||
    (target === 'preview' ? ![null, 'preview'].includes(deployment.target) : deployment.target !== target)) {
  console.error('Vercel 프로젝트, 배포 환경 또는 Ready 상태가 예상과 다릅니다.');
  process.exit(1);
}
if (evidence.sourceCommit !== expected || Object.values(evidence).some(sha => sha !== null && sha !== expected) ||
    (meta.githubCommitRef != null && meta.githubCommitRef !== branch)) {
  console.error('배포 커밋 증거가 예상과 다릅니다. CLI 업로드에는 정확한 meta.sourceCommit이 필요합니다.');
  process.exit(1);
}
JS
}
json_field() {
  node - "$1" "$2" <<'JS'
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const deployment = data.deployment?.id || data.deployment?.url ? data.deployment : data;
const field = process.argv[3];
const metadata = deployment.meta ?? data.meta ?? {};
const value = field === 'commit'
  ? metadata.sourceCommit ?? metadata.githubCommitSha ?? deployment.gitSource?.sha
  : deployment[field];
if (typeof value === 'string') process.stdout.write(value);
JS
}
public_deployment() {
  local result=$1 id
  vercel inspect "$public" --scope "$scope" --json > "$work/alias.json"
  id=$(json_field "$work/alias.json" id)
  [[ "$id" =~ ^dpl_[[:alnum:]]+$ ]] || fail '공개 별칭의 배포 ID를 확인하지 못했습니다.'
  deployment_api "$id" "$result"
}
deploy() {
  local target=$1 result=$2 url
  vercel deploy "$work/upload" --scope "$scope" --environment "$target" --json \
    --meta "githubCommitRef=$branch" --meta "sourceCommit=$sha" > "$result"
  url=$(json_field "$result" url)
  [[ "$url" == https://* ]] || url="https://$url"
  [[ "$url" =~ ^https://[a-zA-Z0-9-]+\.vercel\.app/?$ ]] || fail 'Vercel 배포 URL을 읽지 못했습니다.'
  printf '%s\n' "${url%/}"
}

mode=${1:-}
preview_url=${2:-}
if [[ $# == 0 ]]; then mode=--deploy-new-preview; fi
case "$mode" in
  --check-preview|--resume-preview) [[ $# == 2 ]] || fail "$mode 뒤에 Preview URL이 필요합니다." ;;
  --preview-only|--deploy-new-preview) [[ $# == 0 || ( $# == 1 && "$mode" == --preview-only ) ]] || fail '인수를 확인하세요.' ;;
  *) fail '사용법: release-admin-dashboard.sh [--check-preview URL | --resume-preview URL | --preview-only]' ;;
esac
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || fail 'Node.js 22가 필요합니다.'
[[ "$(git branch --show-current)" == "$branch" ]] || fail '관리자 개선 브랜치로 전환하세요.'
[[ "$(git rev-parse HEAD)" == "$sha" ]] || fail '검토한 관리자 개선 커밋과 HEAD가 다릅니다.'
[[ -z "$(git status --porcelain)" ]] || fail '작업 트리에 미커밋 변경이 있습니다.'
git diff --exit-code 3125232 "$sha" -- online-game/migrations online-game/server/plays.mjs online-game/server/rules.mjs online-game/server/auth.mjs
git diff --check 3125232 "$sha"
if [[ "$mode" == --check-preview || "$mode" == --resume-preview ]]; then
  verify_deployment "$preview_url" preview
  if [[ "$mode" == --check-preview ]]; then exit 0; fi
fi

bash tutorial/run-local.sh --test
node --test tutorial/tests/tutorial.test.mjs

git archive "$sha:online-game" | tar -xf - -C "$work/upload"
cp -- "$link" "$work/upload/.vercel/project.json"
npm --prefix "$work/upload" ci --engine-strict --no-audit --no-fund
npm --prefix "$work/upload" run build

unset VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID
vercel whoami
vercel project inspect "$project" --scope "$scope" --json > "$work/project.json"
node - "$link" "$work/project.json" <<'JS'
const fs = require('node:fs');
const [local, remote] = process.argv.slice(2).map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
if (local.projectName !== 'seoul-commute-online' || local.projectId !== remote.id ||
    local.projectName !== remote.name || remote.rootDirectory) {
  throw new Error('Vercel 프로젝트 연결 또는 CLI 업로드 루트가 예상과 다릅니다.');
}
JS

public_deployment "$work/before.json"
before_id=$(json_field "$work/before.json" id)
before_sha=$(json_field "$work/before.json" commit)
[[ "$before_id" =~ ^dpl_[[:alnum:]]+$ ]] || fail '현재 Production 배포 ID를 확인하지 못했습니다.'
if [[ -z "$before_sha" ]]; then
  printf '현재 Production ID: %s\n' "$before_id"
  read -r -p 'Vercel 배포 또는 해당 릴리스 기록에서 확인한 현재 Production 소스 전체 SHA: ' before_sha </dev/tty
fi
[[ "$before_sha" =~ ^[a-f0-9]{40}$ ]] || fail '현재 Production 소스 커밋을 확인할 수 없습니다.'
git merge-base --is-ancestor "$before_sha" "$sha" || fail '현재 Production 소스가 개선 커밋의 이력에 포함되지 않습니다.'
git diff --exit-code "$before_sha" "$sha" -- online-game \
  ':(exclude)online-game/dist/admin-ui.js' ':(exclude)online-game/dist/admin-completions.js' \
  ':(exclude)online-game/dist/online.css' ':(exclude)online-game/server/admin-page.mjs' \
  ':(exclude)online-game/server/audit.mjs' ':(exclude)online-game/server/daily-completions.mjs' \
  ':(exclude)online-game/test/admin-dashboard.test.mjs' ':(exclude)online-game/test/integration.test.mjs' ||
  fail '현재 Production 소스와 비교했을 때 관리자 개선 범위 밖의 변경이 포함됩니다.'
if [[ "$mode" == --resume-preview ]]; then
  [[ -s "$receipt/previous-production-id" ]] || fail '원래 Production 배포 ID 기록이 없습니다.'
  [[ "$before_id" == "$(cat "$receipt/previous-production-id")" ]] ||
    fail '중단 이후 Production 배포가 바뀌었습니다.'
else
  printf '%s\n' "$before_id" > "$receipt/previous-production-id"
fi

printf '현재 Production에서 기존 관리자로 %s/?admin=1 로그인 후 /api/admin-completions를 확인하세요.\n' "$public"
confirm '현재 Production의 공식 완주 API가 정상 JSON으로 응답하고, Vercel에서 이 브랜치의 Preview DB가 운영 DB와 분리되어 있음을 확인했습니까?'

if [[ "$mode" != --resume-preview ]]; then
  git push "$remote" "$sha:refs/heads/$branch"
fi
pushed=$(git ls-remote --exit-code "$remote" "refs/heads/$branch")
[[ "${pushed%%$'\t'*}" == "$sha" ]] || fail 'GitHub 브랜치 커밋이 다릅니다.'

if [[ "$mode" == --resume-preview ]]; then
  preview=${preview_url%/}
else
  preview=$(deploy preview "$work/preview-deploy.json")
fi
vercel inspect "$preview" --scope "$scope" --wait --timeout 10m
verify_deployment "$preview" preview
for asset in admin-ui.js admin-completions.js online.css; do
  vercel curl "/$asset" --deployment "$preview" --scope "$scope" -- \
    --fail --silent --show-error --max-time 30 --output "$work/preview-$asset"
  cmp "$work/preview-$asset" "$work/upload/public-online/$asset"
done
printf '%s\n' "$preview" > "$receipt/preview-url"
cat <<CHECKS
Preview 검증
  로그인: $preview/?admin=1
  대시보드: $preview/administrator
  Preview 전용 관리자와 게임 계정으로 공식 완주 후 5초 조회와 자동 실행 표시를 확인하세요.
  지금 다시 집계, 실행 ID·플레이 ID 연결, 요청 ID 복사, 필터·커서와 좁은 화면을 확인하세요.
  일반 게임 계정의 /administrator 접근이 거부되는지 확인하세요.
CHECKS
if [[ "$mode" == --preview-only ]]; then exit 0; fi
confirm '동일 커밋의 Preview에서 위 검증을 모두 통과했습니까?'

public_deployment "$work/pre-promote.json"
[[ "$(json_field "$work/pre-promote.json" id)" == "$before_id" ]] || fail 'Preview 검증 중 Production 배포가 바뀌었습니다.'
production=$(deploy production "$work/production-deploy.json")
vercel inspect "$production" --scope "$scope" --wait --timeout 10m
deployment_api "$production" "$work/production-inspect.json"
public_deployment "$work/public-inspect.json"
deployed_id=$(json_field "$work/production-inspect.json" id)
[[ "$deployed_id" =~ ^dpl_[[:alnum:]]+$ && "$(json_field "$work/public-inspect.json" id)" == "$deployed_id" ]] ||
  fail '공개 별칭이 새 Production 배포를 가리키지 않습니다.'
verify_deployment "$deployed_id" production
printf '%s\n' "$production" > "$receipt/production-url"
printf '%s\n' "$deployed_id" > "$receipt/production-id"
for asset in admin-ui.js admin-completions.js online.css; do
  curl -fsS --max-time 30 "$public/$asset" -o "$work/$asset"
  cmp "$work/$asset" "$work/upload/public-online/$asset"
done
status=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' "$public/administrator")
[[ "$status" == 401 ]] || fail "비로그인 관리자 진입의 응답: HTTP $status"

printf '공개 관리자 로그인 %s/?admin=1\n공개 대시보드 %s/administrator\n' "$public" "$public"
confirm '기존 운영 관리자 계정으로 공개 /administrator에 로그인해 네 영역, 오늘 요약, 집계 실행 계기와 근거, 요청 상세가 표시되는 것을 확인했습니까?'
printf 'commit=%s\nproduction=%s\npublic=%s/administrator\nverified_at=%s\n' \
  "$sha" "$production" "$public" "$(date -u +%FT%TZ)" | tee "$receipt/verified.txt"
