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
# The token, first found: FLASHCARDS_BACKUP_TOKEN; the one stored in the GNOME keyring by
# backup-token.sh (so it runs without a prompt); else prompted, when someone is at the terminal.
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

# The token stored by backup-token.sh, read straight into the variable (never printed).
host="${base_url#*://}"
host="${host%%/*}"
if [ -z "${FLASHCARDS_BACKUP_TOKEN:-}" ] && command -v secret-tool > /dev/null; then
    FLASHCARDS_BACKUP_TOKEN="$(secret-tool lookup service flashcards-backup-token url "${host}" 2> /dev/null || true)"
    [ -z "${FLASHCARDS_BACKUP_TOKEN}" ] || echo "Using the stored backup token for ${host}"
fi
if [ -z "${FLASHCARDS_BACKUP_TOKEN:-}" ]; then
    [ -t 0 ] || { echo "backup: no stored backup token for ${host} and nobody to ask; run backup-token.sh first" >&2; exit 1; }
    read -r -s -p "Backup app token for ${host} (iamsa_…): " FLASHCARDS_BACKUP_TOKEN
    echo
fi
export FLASHCARDS_BACKUP_TOKEN

cd "${PROJECT_ROOT}"
exec node src/scripts/js/modules/tools/backup-cli.mjs download "${base_url}" "${2:-}"
