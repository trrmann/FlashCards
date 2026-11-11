#!/bin/bash

################################################################################
# FlashCards restore (also the recovery procedure for a new, empty database)
#
# Usage: restore.sh <base-url> <backup.json> [media.zip]
#
# Imports a backup made with backup.sh (or the Profile page) into the server at
# <base-url>, as the backup service account (an app token; never a person, so no
# password and no MFA: iam-service MIGRATION.md L12). Two steps, each all-or-nothing:
# users, then FlashCards' data. If the second fails, the users stay restored; run
# this again to complete it (a rerun changes nothing that is right).
#
# The token: as backup.sh (backup-token-lib.sh). For production the script provides its
# own, also for a new, empty database (for example after the monthly Render reset): it
# first creates the first admin through initial setup (use the backup's admin username so
# the accounts merge), then issues a token on that database with the database admin login
# in .env (point .env at the new database first). Elsewhere: the stored token, or asked.
# After the restore the backup's own tokens are back as well.
# Set FLASHCARDS_ASSUME_YES=1 to skip the confirmation.
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

base_url="${1:-}"
json_file="${2:-}"
zip_file="${3:-}"
if [ -z "${base_url}" ] || [ -z "${json_file}" ]; then
    sed -n '3,21p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
fi
json_file="$(readlink -f "${json_file}")"
[ -f "${json_file}" ] || { echo "restore: ${json_file} not found" >&2; exit 1; }
if [ -n "${zip_file}" ]; then
    zip_file="$(readlink -f "${zip_file}")"
    [ -f "${zip_file}" ] || { echo "restore: ${zip_file} not found" >&2; exit 1; }
else
    echo "restore: no media ZIP given; media files will be skipped" >&2
fi

if [ "${FLASHCARDS_ASSUME_YES:-}" != "1" ]; then
    read -r -p "Restore ${json_file##*/} into ${base_url}? Existing records are overwritten by the backup. [y/N] " answer
    [ "${answer}" = "y" ] || [ "${answer}" = "Y" ] || { echo "cancelled"; exit 1; }
fi

cd "${PROJECT_ROOT}"
status="$(curl -s -m 120 "${base_url}/api/system/setup-status" || true)"
if [[ "${status}" == *'"needsSetup":true'* ]]; then
    echo "Empty database: create its first admin (use the backup's admin username so the accounts merge)."
    read -r -p "Admin username: " FLASHCARDS_ADMIN_USER
    read -r -s -p "Password: " FLASHCARDS_ADMIN_PASSWORD
    echo
    read -r -p "Admin email: " FLASHCARDS_ADMIN_EMAIL
    read -r -p "Admin full name: " FLASHCARDS_ADMIN_NAME
    export FLASHCARDS_ADMIN_USER FLASHCARDS_ADMIN_PASSWORD FLASHCARDS_ADMIN_EMAIL FLASHCARDS_ADMIN_NAME
    node src/scripts/js/modules/tools/backup-cli.mjs setup "${base_url}"
    unset FLASHCARDS_ADMIN_PASSWORD
    # The stored token belongs to the old database: get one for this one.
    unset FLASHCARDS_BACKUP_TOKEN
fi

# shellcheck source=backup-token-lib.sh
source "${SCRIPT_DIR}/backup-token-lib.sh"
ensure_backup_token "${base_url}" || exit 1
exec node src/scripts/js/modules/tools/backup-cli.mjs restore "${base_url}" "${json_file}" ${zip_file:+"${zip_file}"}
