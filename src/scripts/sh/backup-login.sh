#!/bin/bash

################################################################################
# Store (or forget) the FlashCards admin login that backup.sh uses, so backups
# run without a password prompt (also when an assistant runs them for you).
#
# Usage: backup-login.sh [base-url]           store: asks, checks it works, stores
#        backup-login.sh [base-url] --forget  remove the stored login
#
# The login goes into the GNOME keyring (secret-tool; encrypted with your desktop
# login, unlocked while you are signed in), under service "flashcards-backup" and
# the site's host. It is never written to a file or printed. Only backup.sh reads
# it: restore.sh keeps asking, because a restore changes production.
# The base URL defaults to RENDER_URL from .env (production).
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
command -v secret-tool > /dev/null || { echo "backup-login: secret-tool not found (install libsecret)" >&2; exit 1; }

base_url="${1:-}"
action="${2:-}"
if [ "${base_url}" = "--forget" ]; then action="--forget"; base_url=""; fi
if [ -z "${base_url}" ] && [ -f "${PROJECT_ROOT}/.env" ]; then
    base_url="$(grep '^RENDER_URL=' "${PROJECT_ROOT}/.env" | cut -d= -f2- || true)"
fi
[ -n "${base_url}" ] || { echo "backup-login: no base URL given and no RENDER_URL in .env" >&2; exit 1; }
host="${base_url#*://}"
host="${host%%/*}"

if [ "${action}" = "--forget" ]; then
    secret-tool clear service flashcards-backup url "${host}"
    echo "Forgot the stored login for ${host}"
    exit 0
fi

read -r -p "FlashCards admin username for ${host}: " FLASHCARDS_ADMIN_USER
read -r -s -p "Password: " FLASHCARDS_ADMIN_PASSWORD
echo
export FLASHCARDS_ADMIN_USER FLASHCARDS_ADMIN_PASSWORD

echo "Checking the login (if the services were asleep, this can take up to a minute)…"
(cd "${PROJECT_ROOT}" && node src/scripts/js/modules/tools/backup-cli.mjs check "${base_url}")

secret-tool clear service flashcards-backup url "${host}" 2> /dev/null || true
printf '%s' "${FLASHCARDS_ADMIN_PASSWORD}" | secret-tool store \
    --label "FlashCards backup login (${host})" \
    service flashcards-backup url "${host}" user "${FLASHCARDS_ADMIN_USER}"
unset FLASHCARDS_ADMIN_PASSWORD
echo "Stored. backup.sh ${base_url} now runs without a prompt; remove it with: backup-login.sh --forget"
