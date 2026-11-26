#!/usr/bin/env bash
set +x
set -Eeuo pipefail
shopt -s inherit_errexit
umask 077
trap 'printf "실패한 줄 %s. 명령과 환경 변수는 출력하지 않습니다.\n" "$LINENO" >&2' ERR

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
release="${RELEASE_RECEIPT_DIR:-$root/.release}"
repo="$release/remote"
remote=https://github.com/hg18lee-source/seoul-commute-game.git
project=seoul-commute-online
scope=htsq
public=https://seoul-commute-online.vercel.app
link="${VERCEL_LINK_FILE:-$root/online-game/.vercel/project.json}"
receipt="$release/preview.txt"

fail() { printf '%s\n' "$*" >&2; exit 1; }
require() { command -v "$1" >/dev/null || fail "필요한 명령: $1"; }
confirm() {
  local answer
  printf '%s\n' "$1" >&2
  read -r -p '계속하려면 YES를 입력하세요: ' answer </dev/tty
  [[ "$answer" == YES ]] || fail '중단했습니다.'
}

inventory() {
  local path
  for path in "$root" "$root"/seoul-commute-*; do
    [[ -d "$path" && -e "$path/.git" ]] || continue
    git -C "$path" rev-parse --is-inside-work-tree >/dev/null 2>&1 || continue
    printf '\n%s\n' "$path"
    git -C "$path" log -1 --format='%H %s'
    git --no-optional-locks -C "$path" status --short --branch --untracked-files=all
  done
}

fetch_heads() {
  [[ "$(git -C "$repo" remote get-url origin)" == "$remote" ]] || fail '조사용 clone의 origin이 다릅니다.'
  git -C "$repo" fetch --prune --no-tags origin '+refs/heads/*:refs/remotes/origin/*'
}

select_source() {
  branch="$1"
  revision="$2"
  git check-ref-format "refs/heads/$branch" >/dev/null
  [[ "$revision" =~ ^[a-f0-9]{40}$ ]] || fail '확인한 전체 커밋 SHA를 입력하세요.'
  if [[ -n "${RELEASE_SOURCE_REPO:-}" ]]; then
    repo="$(git -C "$RELEASE_SOURCE_REPO" rev-parse --show-toplevel)"
    [[ "$(git -C "$repo" remote get-url origin)" == "$remote" ]] || fail '로컬 배포 소스의 origin이 다릅니다.'
    [[ "$(git -C "$repo" symbolic-ref --short HEAD)" == "$branch" ]] || fail '현재 로컬 브랜치가 선택값과 다릅니다.'
    [[ "$(git -C "$repo" rev-parse HEAD)" == "$revision" ]] || fail '로컬 HEAD가 선택한 SHA와 다릅니다.'
    [[ -z "$(git --no-optional-locks -C "$repo" status --porcelain)" ]] || fail '로컬 배포 작업 트리에 미커밋 변경이 있습니다.'
  else
    fetch_heads
    [[ "$(git -C "$repo" rev-parse --verify "refs/remotes/origin/$branch^{commit}")" == "$revision" ]] ||
      fail '원격 브랜치 HEAD가 선택한 SHA와 다릅니다. scan부터 다시 확인하세요.'
  fi
  [[ "$(git -C "$repo" cat-file -t "$revision:online-game")" == tree ]] ||
    fail '선택한 커밋에 online-game/이 없습니다. 인수인계 문서에서 위치를 다시 확인하세요.'
  printf '선택: %s @ %s\n' "$branch" "$revision"
}

tmp=''
pg_started=''
cleanup() {
  if [[ -n "$pg_started" ]]; then
    "$pgbin/pg_ctl" -D "$pg_dir" -m fast -w stop >/dev/null 2>&1 || {
      printf '임시 PostgreSQL을 중지하지 못했습니다. 경로: %s\n' "$pg_dir" >&2
      return 1
    }
  fi
  if [[ -n "$tmp" ]]; then rm -rf -- "$tmp"; fi
}

export_source() {
  local destination="$1"
  mkdir -- "$destination"
  git -C "$repo" archive "$revision:online-game" | tar -xf - -C "$destination"
  local suspicious
  suspicious="$(find "$destination" \( -type l -o -name '.vercel' -o -name '.npmrc' -o -name '*.pem' -o -name '*.key' -o \( -name '.env*' ! -name '.env.example' \) \) -print -quit)"
  [[ -z "$suspicious" ]] || fail '추적된 자격 증명 관련 경로 또는 심볼릭 링크를 검토하세요.'
  [[ -f "$destination/package-lock.json" && -f "$destination/vercel.json" ]] ||
    fail '잠금 파일 또는 Vercel 설정 파일이 없습니다.'
}

vercel_check() {
  require vercel
  require node
  [[ -f "$link" ]] || fail '기존 온라인 프로젝트 연결 파일을 찾지 못했습니다.'
  unset VERCEL_ORG_ID VERCEL_PROJECT_ID VERCEL_TOKEN
  vercel whoami
  vercel project inspect "$project" --scope "$scope" --json > "$tmp/project.json"
  node - "$link" "$tmp/project.json" <<'JS'
const fs = require('node:fs');
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const local = read(process.argv[2]);
const remote = read(process.argv[3]);
if (local.projectName !== 'seoul-commute-online' || !local.orgId ||
    !local.projectId || local.projectId !== remote.id || local.projectName !== remote.name) {
  process.exitCode = 1;
  console.error('기존 Vercel 연결과 원격 프로젝트의 ID 또는 이름이 다릅니다.');
}
JS
}

test_and_build() {
  local source="$1"
  require npm
  require pg_config
  pgbin="$(pg_config --bindir)"
  for tool in initdb pg_ctl createdb; do
    [[ -x "$pgbin/$tool" ]] || fail "PostgreSQL 서버 도구가 필요합니다: $tool"
  done
  pg_dir="$tmp/pg"
  mkdir -- "$tmp/socket"
  "$pgbin/initdb" -D "$pg_dir" -U commute_test --auth=trust --no-locale --encoding=UTF8 > "$tmp/initdb.log" 2>&1
  "$pgbin/pg_ctl" -D "$pg_dir" -l "$tmp/postgres.log" -o "-h '' -k '$tmp/socket' -p 5432" -w start >/dev/null
  pg_started=yes
  "$pgbin/createdb" -h "$tmp/socket" -p 5432 -U commute_test commute_test_release
  (
    cd -- "$source"
    unset DATABASE_URL DIRECT_DATABASE_URL DATABASE_URL_UNPOOLED PASSWORD_PEPPER CRON_SECRET SEOUL_OPENAPI_KEY DATA_GO_KR_SERVICE_KEY VERCEL
    npm ci --engine-strict --no-audit --no-fund
    TEST_DATABASE_URL="postgresql://commute_test@localhost:5432/commute_test_release?host=$tmp/socket" npm test
    npm run build
  )
}

deploy() {
  local target="$1"
  local url
  mkdir -- "$tmp/upload/.vercel"
  cp -- "$link" "$tmp/upload/.vercel/project.json"
  url="$(vercel deploy --cwd "$tmp/upload" --scope "$scope" --environment "$target" \
    --meta "githubDeployment=1" --meta "githubCommitRef=$branch" \
    --meta "sourceCommit=$revision")"
  if [[ "$url" == \{* ]]; then
    url="$(printf '%s' "$url" | node -e '
      const result = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
      if (result.error) process.exit(1);
      process.stdout.write(result.deployment?.url ?? result.url ?? "");
    ')"
  fi
  [[ "$url" =~ ^https://[a-zA-Z0-9-]+\.vercel\.app/?$ ]] ||
    fail '배포 URL 응답 형식을 확인할 수 없습니다. Vercel Deployments를 확인하세요.'
  printf '%s\n' "$url"
}

case "${1:-}" in
  scan)
    [[ "$#" == 1 ]] || fail '사용법: bash vercel-release.sh scan'
    require git
    inventory
    mkdir -p -- "$release"
    if [[ ! -e "$repo" ]]; then git clone --no-checkout --no-tags "$remote" "$repo"; fi
    fetch_heads
    git -C "$repo" for-each-ref --sort=-committerdate \
      --format='%(refname:short) %(objectname) %(subject)' refs/remotes/origin
    git -C "$repo" log --remotes=origin -30 --oneline --decorate --graph
    printf '\n문서 및 변경 경로는 review <브랜치> <전체 SHA>로 확인하세요.\n'
    ;;
  review|preview|production)
    [[ "$#" == 3 ]] || fail '사용법: bash vercel-release.sh {review|preview|production} <브랜치> <전체 SHA>'
    action="$1"
    select_source "$2" "$3"
    tmp="$(mktemp -d /tmp/commute-release.XXXXXXXX)"
    trap cleanup EXIT
    export_source "$tmp/upload"
    if [[ "$action" == review ]]; then
      git -C "$repo" log -12 --format='%h %s' "$revision" -- online-game
      git -C "$repo" ls-tree -r --name-only "$revision" |
        awk -F/ '$NF ~ /^(AGENTS|HANDOFF(_COMPLETE)?|ONLINE|GAME_SPEC|ASSETS|ASSET_TRANSFER)\.md$/'
      for baseline in "$root/seoul-commute-graphics" "$root/seoul-commute-handoff-local/online-game"; do
        printf '\n비교 기준: %s\n' "$baseline"
        diff -qr --exclude=.git --exclude=.vercel --exclude=.openai --exclude='.env*' \
          --exclude=node_modules --exclude=public-online "$baseline" "$tmp/upload" ||
          [[ "$?" == 1 ]]
      done
      exit 0
    fi

    vercel_check
    printf '로컬 Node: '; node --version
    node -p '"소스 Node 요구사항: " + require(process.argv[1]).engines.node' "$tmp/upload/package.json"
    if [[ "$action" == preview ]]; then
      confirm '대시보드에서 기존 프로젝트의 Node 버전과 Root Directory를 확인했으며, 이 브랜치의 Preview 환경에 별도 DB와 전용 비밀값이 설정돼 있습니까?'
      export_source "$tmp/test"
      test_and_build "$tmp/test"
      require python3
      asset="$(python3 - "$tmp/test/public-online/index.html" <<'PY'
import re, sys
from pathlib import Path
html = Path(sys.argv[1]).read_text()
match = re.search(r'game-assets/[a-f0-9]+/game\.js', html)
if not match:
    sys.exit('정적 번들 위치가 바뀌었습니다. 공개 검증 방법을 업데이트하세요.')
print(match[0])
PY
)"
      digest="$(sha256sum "$tmp/test/public-online/$asset")"
      if [[ -f "$tmp/upload/tutorial/index.html" ]]; then
        local_output="$tmp/test/public-online"
        tutorial_prefix="${asset%/game.js}/tutorial"
        grep -Fq 'name="commute-tutorial"' "$local_output/index.html"
        grep -Fq "/$tutorial_prefix/app.mjs" "$local_output/tutorial/index.html"
        grep -Fq 'AI 연동 전 기능 시연' "$local_output/tutorial/index.html"
        for file in app.mjs state.mjs guidance.mjs dialogue.mjs input.mjs visual-guide.mjs style.css; do
          [[ -s "$local_output/$tutorial_prefix/$file" ]] || fail "튜토리얼 산출물 누락: $file"
        done
      fi
      url="$(deploy preview)"
      printf '%s\n' "$branch" "$revision" "$url" "$asset" "${digest%% *}" > "$tmp/preview.txt"
      mv -- "$tmp/preview.txt" "$receipt"
      printf 'Preview: %s\n검증 기록: %s\n' "$url" "$receipt"
    else
      require curl
      [[ -f "$receipt" ]] || fail '같은 커밋의 Preview 배포 기록이 필요합니다.'
      mapfile -t previous < "$receipt"
      [[ "${#previous[@]}" == 5 && "${previous[0]}" == "$branch" && "${previous[1]}" == "$revision" &&
         "${previous[2]}" =~ ^https://[a-zA-Z0-9-]+\.vercel\.app/?$ &&
         "${previous[3]}" =~ ^game-assets/[a-f0-9]+/game\.js$ &&
         "${previous[4]}" =~ ^[a-f0-9]{64}$ ]] || fail 'Preview 기록이 커밋·브랜치와 일치하지 않습니다.'
      vercel inspect "${previous[2]}" --scope "$scope"
      rollback="$(mktemp "$release/previous-production.XXXXXXXX")"
      vercel inspect "$public" --scope "$scope" > "$rollback" 2>&1
      cat -- "$rollback"
      printf '롤백 정보 파일: %s\n' "$rollback"
      confirm '위 Preview에서 로그인·게임·모델·공식 기록 저장/재조회를 통과했고, Production의 DB 설정과 스키마 호환성을 확인했습니까?'
      url="$(deploy production)"
      printf 'Production 배포: %s\n공개 주소: %s/\n커밋: %s\n' "$url" "$public" "$revision"
      curl --fail --silent --show-error --max-time 30 "$public/" -o "$tmp/index.html"
      grep -Fq -- "${previous[3]}" "$tmp/index.html" || fail '공개 첫 화면에 예상한 게임 번들이 없습니다.'
      curl --fail --silent --show-error --max-time 30 "$public/${previous[3]}" -o "$tmp/game.js"
      actual="$(sha256sum "$tmp/game.js")"
      [[ "${actual%% *}" == "${previous[4]}" ]] || fail '공개 게임 번들의 SHA-256이 Preview 전 빌드와 다릅니다.'
      printf '공개 첫 화면과 게임 번들 SHA-256 검증 통과\n'
      if [[ -f "$tmp/upload/tutorial/index.html" ]]; then
        tutorial_prefix="${previous[3]%/game.js}/tutorial"
        curl --fail --silent --show-error --location --proto-redir '=https' --max-time 30 "$public/tutorial/" -o "$tmp/tutorial.html"
        grep -Fq "/$tutorial_prefix/app.mjs" "$tmp/tutorial.html" || fail '공개 튜토리얼의 번들 버전이 다릅니다.'
        grep -Fq 'AI 연동 전 기능 시연' "$tmp/tutorial.html" || fail '공개 튜토리얼에 모의 기능 안내가 없습니다.'
        curl --fail --silent --show-error --max-time 30 "$public/$tutorial_prefix/app.mjs" -o "$tmp/tutorial.mjs"
        access="$(curl --fail --silent --show-error --max-time 30 -o /dev/null -w '%{http_code}' "$public/api/tutorial-access")"
        [[ "$access" == 204 ]] || fail '공개 비로그인 튜토리얼 세션 조회가 HTTP 204를 반환하지 않았습니다.'
        printf '공개 튜토리얼 HTML, 버전이 붙은 모듈, 비로그인 세션 경로 확인\n'
      fi
    fi
    ;;
  *) fail '사용법: bash vercel-release.sh {scan|review|preview|production} [브랜치 전체SHA]' ;;
esac
