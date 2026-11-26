# Source this file in the same Bash session; do not run separately.
set +x
set -euo pipefail
umask 077
cd -- "${RELEASE_SOURCE_REPO:-$(git rev-parse --show-toplevel)}"
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
test "$sha" = "3125232652aec32185a6cd6d91fa09024f72fb21"
printf '배포 소스 %s @ %s\n' "$branch" "$sha"
# 이 문서와 배포 후보 SHA를 배포 전 최종 보고의 값과 대조한다.
work="$(mktemp -d /tmp/commute-daily-release.XXXXXXXX)"
receipt_dir="${RELEASE_RECEIPT_DIR:-$PWD/.release}"
scope=htsq
project=seoul-commute-online
public=https://seoul-commute-online.vercel.app
link="${VERCEL_LINK_FILE:-$PWD/online-game/.vercel/project.json}"
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
