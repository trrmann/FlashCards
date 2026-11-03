#!/bin/bash

################################################################################
# FlashCards backup download
#
# Usage: backup.sh [base-url] [backup-dir]
#
# Signs in as an admin and downloads the full two-file backup (data JSON +
# media ZIP) into <backup-dir>/<timestamp>_<host>/ (default ~/FlashCardsBackups).
# The base URL defaults to RENDER_URL from .env (production).
#
# Credentials: FLASHCARDS_ADMIN_USER / FLASHCARDS_ADMIN_PASSWORD, or prompted.
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

if [ -z "${FLASHCARDS_ADMIN_USER:-}" ]; then
    read -r -p "Admin username for ${base_url}: " FLASHCARDS_ADMIN_USER
fi
if [ -z "${FLASHCARDS_ADMIN_PASSWORD:-}" ]; then
    read -r -s -p "Password: " FLASHCARDS_ADMIN_PASSWORD
    echo
fi
export FLASHCARDS_ADMIN_USER FLASHCARDS_ADMIN_PASSWORD

cd "${PROJECT_ROOT}"
exec node src/scripts/js/modules/tools/backup-cli.mjs download "${base_url}" "${2:-}"
