#!/usr/bin/env bash
set +x
set -Eeuo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../online-game"
[[ "${1:-}" == '' || "$1" == '--test' ]] || { printf '사용법: bash tutorial/run-local.sh [--test]\n' >&2; exit 2; }
command -v node >/dev/null
command -v npm >/dev/null
pgbin="$(pg_config --bindir)"
for tool in initdb pg_ctl createdb; do
  [[ -x "$pgbin/$tool" ]] || { printf 'PostgreSQL 도구가 필요합니다: %s\n' "$tool" >&2; exit 1; }
done
node -e 'if(process.versions.node.split(".")[0]!=="22") process.exitCode=1' ||
  { printf 'Node.js 22.x가 필요합니다.\n' >&2; exit 1; }
if [[ ! -d node_modules ]]; then npm ci --engine-strict --no-audit --no-fund; fi
run="$(mktemp -d /tmp/commute-local.XXXXXXXX)"
pg_started=no
cleanup() {
  if [[ "$pg_started" == yes ]]; then
    "$pgbin/pg_ctl" -D "$run/db" -m fast -w stop >/dev/null 2>&1 ||
      { printf '로컬 PostgreSQL 정지 실패: %s\n' "$run" >&2; return 1; }
  fi
  rm -rf -- "$run"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -- "$run/socket"
"$pgbin/initdb" -D "$run/db" -U commute_local --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$pgbin/pg_ctl" -D "$run/db" -l "$run/postgres.log" -o "-h '' -k '$run/socket' -p 5432" -w start >/dev/null
pg_started=yes
db="postgresql://commute_local@localhost:5432/commute_test_tutorial?host=$run/socket"
"$pgbin/createdb" -h "$run/socket" -p 5432 -U commute_local commute_test_tutorial
pepper="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
if [[ "${1:-}" == --test ]]; then
  # Run directly to avoid loading an existing .env.local file.
  env -i PATH="$PATH" HOME="$HOME" TEST_DATABASE_URL="$db" node --test test/*.test.mjs
else
  env -i PATH="$PATH" HOME="$HOME" npm run build
  env -i PATH="$PATH" HOME="$HOME" DATABASE_URL="$db" PASSWORD_PEPPER="$pepper" node scripts/migrate.mjs
  env -i PATH="$PATH" HOME="$HOME" DATABASE_URL="$db" PASSWORD_PEPPER="$pepper" PORT=8034 node scripts/dev.mjs --tutorial
fi
