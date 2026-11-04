#!/bin/bash

################################################################################
# Refresh the local dev database from production.
#
# Usage: pull-prod.sh [-y]      (on PATH; runnable from any directory)
#
# Replaces flashcards_dev_local (the database deploy.sh -dev / -preview use) with a
# copy of production:
#   1. dumps production read-only (pg_dump); if that fails, nothing local changes;
#   2. drops and recreates flashcards_dev_local, so nothing old is left;
#   3. restores the dump (stops on the first error) and deletes the dump file.
# The test database (flashcards_local) is never touched. The copy holds real user data
# and password hashes: it stays on this machine, in the local cluster only.
# -y skips the confirmation prompt.
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DEV_DB_NAME=flashcards_dev_local

cd "${PROJECT_ROOT}"
[ -f .env ] || { echo "pull-prod: no .env with the production DB_PG_* settings" >&2; exit 1; }

case "${1:-}" in
    -y) assume_yes=true ;;
    "") assume_yes=false ;;
    *) echo "usage: pull-prod.sh [-y]" >&2; exit 2 ;;
esac

echo "This REPLACES the local database ${DEV_DB_NAME} with a copy of PRODUCTION (real user data)."
echo "Production is only read. ${DEV_DB_NAME} is dropped and recreated before the restore."
if [ "${assume_yes}" != true ]; then
    read -r -p "Continue? [y/N] " answer
    [[ "${answer}" =~ ^[Yy]$ ]] || { echo "Cancelled; nothing changed."; exit 1; }
fi

"${SCRIPT_DIR}/local-db.sh" start
LOCAL_DB_NAME="${DEV_DB_NAME}" "${SCRIPT_DIR}/local-db.sh" load-prod
echo "Done: deploy.sh -dev and -preview now use this copy of production."
