# Source this file in the same Bash session; do not run separately.
vercel rollback "$(cat "$receipt_dir/daily-rollback-$sha.txt")" --scope "$scope"
vercel inspect "$public" --scope "$scope"
