#!/bin/bash
################################################################################
# Read-only production check: runs src/scripts/sql/pg/prod-readonly-checks.sql
# against the Render database from .env, in a read-only session (any write is
# refused by PostgreSQL). Prints table names and row counts only; no row contents.
# Takes no arguments, so it can only ever run that one file.
################################################################################
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../../.." && pwd)"
cd "${PROJECT_ROOT}"
[ $# -eq 0 ] || { echo "prod-readonly-check: takes no arguments" >&2; exit 2; }

# Read only the values needed (.env is not valid shell: some values contain spaces).
env_value() {
    grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}
DB_PG_EXTERNAL_HOSTNAME="$(env_value DB_PG_EXTERNAL_HOSTNAME)"
DB_PG_PORT="$(env_value DB_PG_PORT)"
DB_PG_DATABASE="$(env_value DB_PG_DATABASE)"
DB_PG_USER="$(env_value DB_PG_USER)"
DB_PG_PASSWORD="$(env_value DB_PG_PASSWORD)"

PGPASSWORD="${DB_PG_PASSWORD}" PGCONNECT_TIMEOUT=15 \
  PGOPTIONS='-c default_transaction_read_only=on' \
  psql "host=${DB_PG_EXTERNAL_HOSTNAME} port=${DB_PG_PORT:-5432} dbname=${DB_PG_DATABASE} user=${DB_PG_USER} sslmode=require" \
  -X -q -v ON_ERROR_STOP=1 -P pager=off -f src/scripts/sql/pg/prod-readonly-checks.sql
