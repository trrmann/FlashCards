#!/bin/bash

################################################################################
# Store (or forget) the app token that backup.sh uses, so backups run without a
# prompt (also from release.sh, or when an assistant runs them for you).
#
# Usage: backup-token.sh [base-url]           store: asks, checks it works, stores
#        backup-token.sh [base-url] --forget  remove the stored token
#
# The token is the backup service account's (a service id, not a person: no
# password, no MFA). Issue one with iam-service's command, as a domain admin:
#   npm run service-account -- --env-file ../FlashCards/.env setup-backup flashcards --as <admin>
# It lasts 1 year; renew it within the last 30 days (iam-service-account token …,
# then revoke-token the old one) and store the new one here.
#
# The token goes into the GNOME keyring (secret-tool; encrypted with your desktop
# login, unlocked while you are signed in), under service "flashcards-backup-token"
# and the site's host. It is never written to a file or printed. Storing it also
# removes the admin password backup-login.sh used to keep (service "flashcards-backup").
# The base URL defaults to RENDER_URL from .env (production).
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
command -v secret-tool > /dev/null || { echo "backup-token: secret-tool not found (install libsecret)" >&2; exit 1; }

base_url="${1:-}"
action="${2:-}"
if [ "${base_url}" = "--forget" ]; then action="--forget"; base_url=""; fi
if [ -z "${base_url}" ] && [ -f "${PROJECT_ROOT}/.env" ]; then
    base_url="$(grep '^RENDER_URL=' "${PROJECT_ROOT}/.env" | cut -d= -f2- || true)"
fi
[ -n "${base_url}" ] || { echo "backup-token: no base URL given and no RENDER_URL in .env" >&2; exit 1; }
host="${base_url#*://}"
host="${host%%/*}"

if [ "${action}" = "--forget" ]; then
    secret-tool clear service flashcards-backup-token url "${host}"
    echo "Forgot the stored backup token for ${host}"
    exit 0
fi

read -r -s -p "Backup app token for ${host} (iamsa_…): " FLASHCARDS_BACKUP_TOKEN
echo
export FLASHCARDS_BACKUP_TOKEN

echo "Checking the token (if the services were asleep, this can take up to a minute)…"
(cd "${PROJECT_ROOT}" && node src/scripts/js/modules/tools/backup-cli.mjs check "${base_url}")

secret-tool clear service flashcards-backup-token url "${host}" 2> /dev/null || true
printf '%s' "${FLASHCARDS_BACKUP_TOKEN}" | secret-tool store \
    --label "FlashCards backup token (${host})" \
    service flashcards-backup-token url "${host}"
unset FLASHCARDS_BACKUP_TOKEN
# The old way stored an admin's password; it is no longer used.
secret-tool clear service flashcards-backup url "${host}" 2> /dev/null || true
echo "Stored. backup.sh ${base_url} now runs without a prompt; remove it with: backup-token.sh --forget"
