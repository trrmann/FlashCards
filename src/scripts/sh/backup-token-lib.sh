#!/bin/bash
################################################################################
# Backup token helpers, sourced by backup.sh and restore.sh (they set PROJECT_ROOT).
#
# ensure_backup_token <base-url> sets and exports FLASHCARDS_BACKUP_TOKEN, the
# backup service account's app token (a service id, never a person: no password,
# no MFA; iam-service MIGRATION.md L12):
#
#  - FLASHCARDS_BACKUP_TOKEN already set: used as given.
#  - Production (<base-url> is RENDER_URL in .env): the script provides its own
#    token. The stored one (GNOME keyring) is checked with production; when there
#    is none, it is not valid, or it expires within 30 days, a new one is issued
#    with iam-service-account and the database admin login in .env (setup-backup
#    --replace: the account's other tokens are revoked), checked, and stored. The
#    token is never printed or written to a file; .env is read by the command
#    itself, never sourced.
#  - Anywhere else: the stored token for that host, else asked for at a terminal
#    (backup-token.sh stores one).
################################################################################

BACKUP_TOKEN_SERVICE="flashcards-backup-token"
# The .env whose RENDER_URL and database admin login the token comes from (another file only for testing the
# scripts against the local scratch database).
BACKUP_ENV_FILE="${FLASHCARDS_BACKUP_ENV_FILE:-${PROJECT_ROOT}/.env}"
BACKUP_TOKEN_PATTERN='^iamsa_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$'

backup_token_host() {
    local host="${1#*://}"
    printf '%s' "${host%%/*}"
}

# True when <base-url> is production (RENDER_URL in .env), whose database .env's admin login reaches.
backup_token_is_production() {
    local render_url=""
    [ -f "${BACKUP_ENV_FILE}" ] || return 1
    render_url="$(grep '^RENDER_URL=' "${BACKUP_ENV_FILE}" | cut -d= -f2- || true)"
    [ -n "${render_url}" ] && [ "${1%/}" = "${render_url%/}" ]
}

# One word for FLASHCARDS_BACKUP_TOKEN at <base-url>: ok | renew | invalid (fails if the services do not answer).
backup_token_state() {
    (cd "${PROJECT_ROOT}" && node src/scripts/js/modules/tools/backup-cli.mjs token-state "$1")
}

# Issue a new token (production database, as the owner) into FLASHCARDS_BACKUP_TOKEN; never printed.
backup_token_issue() {
    local cli="${PROJECT_ROOT}/node_modules/.bin/iam-service-account" fresh=""
    [ -x "${cli}" ] || { echo "backup: iam-service-account is not installed (npm install)" >&2; return 1; }
    fresh="$("${cli}" --env-file "${BACKUP_ENV_FILE}" setup-backup flashcards --replace --print-token --yes \
        | grep -E "${BACKUP_TOKEN_PATTERN}" || true)"
    [ -n "${fresh}" ] || { echo "backup: the IAM did not issue a token (see above)" >&2; return 1; }
    FLASHCARDS_BACKUP_TOKEN="${fresh}"
    unset fresh
}

# Store FLASHCARDS_BACKUP_TOKEN for <host>; also removes the admin password the old backup-login.sh kept.
backup_token_store() {
    secret-tool clear service "${BACKUP_TOKEN_SERVICE}" url "$1" 2> /dev/null || true
    printf '%s' "${FLASHCARDS_BACKUP_TOKEN}" | secret-tool store \
        --label "FlashCards backup token ($1)" service "${BACKUP_TOKEN_SERVICE}" url "$1" ||
        { echo "backup: could not store the token in the keyring" >&2; return 1; }
    secret-tool clear service flashcards-backup url "$1" 2> /dev/null || true
}

ensure_backup_token() {
    local base_url="$1" host state
    host="$(backup_token_host "${base_url}")"
    if [ -n "${FLASHCARDS_BACKUP_TOKEN:-}" ]; then
        export FLASHCARDS_BACKUP_TOKEN
        return 0
    fi
    if command -v secret-tool > /dev/null; then
        FLASHCARDS_BACKUP_TOKEN="$(secret-tool lookup service "${BACKUP_TOKEN_SERVICE}" url "${host}" 2> /dev/null || true)"
    fi
    export FLASHCARDS_BACKUP_TOKEN

    if backup_token_is_production "${base_url}" && command -v secret-tool > /dev/null; then
        echo "Checking the backup token (if the services were asleep, this can take up to a minute)…"
        state="$(backup_token_state "${base_url}")" || return 1
        if [ "${state}" = "ok" ]; then
            echo "Using the stored backup token for ${host}"
            return 0
        fi
        case "${state}" in
            renew) echo "The stored backup token expires within 30 days: getting a new one from the IAM…" ;;
            *) echo "No valid backup token stored for ${host}: getting one from the IAM…" ;;
        esac
        backup_token_issue || return 1
        export FLASHCARDS_BACKUP_TOKEN
        state="$(backup_token_state "${base_url}")" || return 1
        [ "${state}" = "ok" ] || { echo "backup: the new token does not work at ${base_url} (${state})" >&2; return 1; }
        backup_token_store "${host}" || return 1
        echo "New backup token stored in the keyring (valid 1 year; renewed automatically in its last 30 days)"
        return 0
    fi

    if [ -n "${FLASHCARDS_BACKUP_TOKEN}" ]; then
        echo "Using the stored backup token for ${host}"
        return 0
    fi
    [ -t 0 ] || { echo "backup: no stored backup token for ${host} and nobody to ask; run backup-token.sh first" >&2; return 1; }
    echo "No stored backup token for ${host}. Issue one on that server's database (prints it once):"
    echo "    node_modules/.bin/iam-service-account --env-file <its .env> setup-backup flashcards --replace"

    read -r -s -p "Backup app token for ${host} (iamsa_…): " FLASHCARDS_BACKUP_TOKEN
    echo
    export FLASHCARDS_BACKUP_TOKEN
}
