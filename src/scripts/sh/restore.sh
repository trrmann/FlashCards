#!/bin/bash

################################################################################
# FlashCards restore (also the recovery procedure for a new, empty database)
#
# Usage: restore.sh <base-url> <backup.json> [media.zip]
#
# Imports a backup made with backup.sh (or the Profile page) into the server at
# <base-url>. If that database has no users yet (for example after the monthly
# Render reset), it first creates the admin through initial setup, then imports.
# The import is all-or-nothing: on any error nothing is changed.
#
# Credentials: FLASHCARDS_ADMIN_USER / FLASHCARDS_ADMIN_PASSWORD, plus
# FLASHCARDS_ADMIN_EMAIL / FLASHCARDS_ADMIN_NAME for an empty database; any that
# are not set are prompted. Use the same admin username as in the backup so the
# accounts are merged. Set FLASHCARDS_ASSUME_YES=1 to skip the confirmation.
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

base_url="${1:-}"
json_file="${2:-}"
zip_file="${3:-}"
if [ -z "${base_url}" ] || [ -z "${json_file}" ]; then
    sed -n '3,18p' "$0" | sed 's/^# \{0,1\}//'
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

if [ -z "${FLASHCARDS_ADMIN_USER:-}" ]; then
    read -r -p "Admin username: " FLASHCARDS_ADMIN_USER
fi
if [ -z "${FLASHCARDS_ADMIN_PASSWORD:-}" ]; then
    read -r -s -p "Password: " FLASHCARDS_ADMIN_PASSWORD
    echo
fi
export FLASHCARDS_ADMIN_USER FLASHCARDS_ADMIN_PASSWORD
export FLASHCARDS_ADMIN_EMAIL="${FLASHCARDS_ADMIN_EMAIL:-}"
export FLASHCARDS_ADMIN_NAME="${FLASHCARDS_ADMIN_NAME:-}"

cd "${PROJECT_ROOT}"
# On an empty database the CLI reports that an email is needed; prompt and retry once.
if ! node src/scripts/js/modules/tools/backup-cli.mjs restore "${base_url}" "${json_file}" ${zip_file:+"${zip_file}"}; then
    if [ -z "${FLASHCARDS_ADMIN_EMAIL}" ]; then
        status="$(curl -s "${base_url}/api/system/setup-status" || true)"
        if [[ "${status}" == *'"needsSetup":true'* ]]; then
            read -r -p "Empty database. Admin email for initial setup: " FLASHCARDS_ADMIN_EMAIL
            read -r -p "Admin full name: " FLASHCARDS_ADMIN_NAME
            export FLASHCARDS_ADMIN_EMAIL FLASHCARDS_ADMIN_NAME
            exec node src/scripts/js/modules/tools/backup-cli.mjs restore "${base_url}" "${json_file}" ${zip_file:+"${zip_file}"}
        fi
    fi
    exit 1
fi
