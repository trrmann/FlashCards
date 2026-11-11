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
# The token: FLASHCARDS_BACKUP_TOKEN, else asked for (a restore changes the target,
# so the token stored for backup.sh is not used without asking).
#
# A new, empty database (for example after the monthly Render reset) has no service
# account yet: this script first creates the first admin through initial setup (use
# the backup's admin username so the accounts merge), then shows the command that
# issues a token on the new database, and asks for it. After the restore the old
# stored token works again (tokens are part of the backup).
# Set FLASHCARDS_ASSUME_YES=1 to skip the confirmation.
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

base_url="${1:-}"
json_file="${2:-}"
zip_file="${3:-}"
if [ -z "${base_url}" ] || [ -z "${json_file}" ]; then
    sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'
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
    cat << EOT

Now issue a backup token on the new database (database admin login; prints the token once):
    npx iam-service-account --env-file <that database's .env> setup-backup flashcards --as ${FLASHCARDS_ADMIN_USER}

EOT
    unset FLASHCARDS_BACKUP_TOKEN
fi

if [ -z "${FLASHCARDS_BACKUP_TOKEN:-}" ]; then
    read -r -s -p "Backup app token for ${base_url} (iamsa_…): " FLASHCARDS_BACKUP_TOKEN
    echo
fi
export FLASHCARDS_BACKUP_TOKEN
exec node src/scripts/js/modules/tools/backup-cli.mjs restore "${base_url}" "${json_file}" ${zip_file:+"${zip_file}"}
