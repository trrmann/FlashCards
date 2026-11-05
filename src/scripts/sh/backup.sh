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
# Credentials, first found: FLASHCARDS_ADMIN_USER / FLASHCARDS_ADMIN_PASSWORD; the login stored
# in the GNOME keyring by backup-login.sh (so it runs without a prompt); else prompted, when
# someone is at the terminal.
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

# The login stored by backup-login.sh, read straight into the variables (never printed).
host="${base_url#*://}"
host="${host%%/*}"
if [ -z "${FLASHCARDS_ADMIN_USER:-}" ] && [ -z "${FLASHCARDS_ADMIN_PASSWORD:-}" ] && command -v secret-tool > /dev/null; then
    # secret-tool prints the attributes on stderr and the secret on stdout: keep only stderr.
    stored_user="$(secret-tool search --all service flashcards-backup url "${host}" 2>&1 > /dev/null \
        | sed -n 's/^attribute\.user = //p' | head -1 || true)"
    if [ -n "${stored_user}" ]; then
        stored_password="$(secret-tool lookup service flashcards-backup url "${host}" 2> /dev/null || true)"
        if [ -n "${stored_password}" ]; then
            FLASHCARDS_ADMIN_USER="${stored_user}"
            FLASHCARDS_ADMIN_PASSWORD="${stored_password}"
            echo "Using the stored login for ${host} (${stored_user})"
        fi
        unset stored_password
    fi
fi

if [ -z "${FLASHCARDS_ADMIN_USER:-}" ] || [ -z "${FLASHCARDS_ADMIN_PASSWORD:-}" ]; then
    [ -t 0 ] || { echo "backup: no stored login for ${host} and nobody to ask; run backup-login.sh first" >&2; exit 1; }
fi
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
