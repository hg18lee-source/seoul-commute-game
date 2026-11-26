# Source this file in the same Bash session; do not run separately.
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
