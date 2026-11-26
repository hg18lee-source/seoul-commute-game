# Source this file in the same Bash session; do not run separately.
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
