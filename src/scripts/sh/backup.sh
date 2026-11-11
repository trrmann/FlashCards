#!/bin/bash

################################################################################
# FlashCards backup download
#
# Usage: backup.sh [base-url] [backup-dir]
#
# Downloads the full two-file backup (data JSON + media ZIP) into
# <backup-dir>/<timestamp>_<host>/ (default ~/FlashCardsBackups), as the backup
# service account: an app token, never a person, so no password and no MFA
# (iam-service MIGRATION.md L12). The base URL defaults to RENDER_URL from .env (production).
#
# The token: backup-token-lib.sh (ensure_backup_token). For production the script provides
# its own: it checks the stored one and, when there is none, it is not valid or it expires
# within 30 days, issues a new one with the database admin login in .env and stores it.
# Backups contain user data and password hashes: never put them in the repo.
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

base_url="${1:-}"
if [ -z "${base_url}" ] && [ -f "${PROJECT_ROOT}/.env" ]; then
    base_url="$(grep '^RENDER_URL=' "${PROJECT_ROOT}/.env" | cut -d= -f2- || true)"
fi
[ -n "${base_url}" ] || { echo "backup: no base URL given and no RENDER_URL in .env" >&2; exit 1; }

# shellcheck source=backup-token-lib.sh
source "${SCRIPT_DIR}/backup-token-lib.sh"
ensure_backup_token "${base_url}" || exit 1

cd "${PROJECT_ROOT}"
exec node src/scripts/js/modules/tools/backup-cli.mjs download "${base_url}" "${2:-}"
