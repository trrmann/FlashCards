#!/bin/bash

################################################################################
# FlashCards local scratch database
#
# Usage: local-db.sh <command>
#
# A private PostgreSQL cluster for migration and schema work, so changes are
# never tried first on the shared Render database (CODING_STANDARDS 0.5/0.7).
# It uses the installed PostgreSQL binaries, keeps its data outside the repo,
# listens on localhost only, and does not touch the system PostgreSQL service.
#
# Commands:
#   init       Create the cluster, app role, and empty database (once)
#   start      Start the local server
#   stop       Stop the local server
#   status     Show whether it is running and how to connect
#   psql       Open psql on the local database (extra args are passed through)
#   env        Print the DB_PG_* exports that point the app at the local DB
#   serve      Run the app (nodemon, port 5001) against the local DB
#   run CMD…   Run any command with the app pointed at the local DB
#              (e.g. local-db.sh run node src/scripts/js/modules/tests/backup-roundtrip.mjs)
#   load-prod  Replace the local DB with a read-only pg_dump of the Render DB
#   reset      Drop and recreate the local database (empty)
#   destroy    Stop the server and delete the whole local cluster
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

STATE_DIR="${FLASHCARDS_LOCAL_DB_DIR:-${HOME}/.local/share/flashcards}"
PGDATA_DIR="${STATE_DIR}/pgdata"
SOCKET_DIR="${STATE_DIR}/socket"
LOG_FILE="${STATE_DIR}/postgres.log"
CREDENTIALS_FILE="${STATE_DIR}/credentials.env"
DUMP_FILE="${STATE_DIR}/render-snapshot.dump"

PORT="${FLASHCARDS_LOCAL_DB_PORT:-5433}"
SUPERUSER="flashcards_super"
APP_USER="flashcards_app"
DB_NAME="flashcards_local"
SERVE_PORT="${FLASHCARDS_LOCAL_SERVE_PORT:-5001}"

die() {
    echo "local-db: $*" >&2
    exit 1
}

load_credentials() {
    [ -f "${CREDENTIALS_FILE}" ] || die "not initialized; run: local-db.sh init"
    # shellcheck disable=SC1090
    source "${CREDENTIALS_FILE}"
}

is_running() {
    pg_ctl -D "${PGDATA_DIR}" status > /dev/null 2>&1
}

super_psql() {
    PGPASSWORD="${SUPER_PASSWORD}" psql -h 127.0.0.1 -p "${PORT}" -U "${SUPERUSER}" -d postgres \
        -v ON_ERROR_STOP=1 -q "$@"
}

cmd_init() {
    [ -d "${PGDATA_DIR}" ] && die "already initialized at ${PGDATA_DIR}"
    command -v initdb > /dev/null || die "initdb not found (install postgresql-server)"

    mkdir -p "${STATE_DIR}" "${SOCKET_DIR}"
    chmod 700 "${STATE_DIR}" "${SOCKET_DIR}"

    local super_password app_password pwfile
    super_password="$(openssl rand -hex 24)"
    app_password="$(openssl rand -hex 24)"

    umask 077
    cat > "${CREDENTIALS_FILE}" <<EOF
SUPER_PASSWORD=${super_password}
APP_PASSWORD=${app_password}
EOF

    pwfile="$(mktemp)"
    printf '%s\n' "${super_password}" > "${pwfile}"
    initdb -D "${PGDATA_DIR}" -U "${SUPERUSER}" --pwfile="${pwfile}" \
        --auth-local=scram-sha-256 --auth-host=scram-sha-256 --encoding=UTF8 > /dev/null
    rm -f "${pwfile}"

    cat >> "${PGDATA_DIR}/postgresql.conf" <<EOF

# FlashCards local scratch cluster
listen_addresses = '127.0.0.1'
port = ${PORT}
unix_socket_directories = '${SOCKET_DIR}'
EOF

    cmd_start
    load_credentials
    super_psql -c "CREATE ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD}';"
    super_psql -c "CREATE DATABASE ${DB_NAME} OWNER ${APP_USER};"
    echo "Initialized local cluster at ${PGDATA_DIR} (port ${PORT}, database ${DB_NAME})"
}

cmd_start() {
    is_running && { echo "already running on port ${PORT}"; return 0; }
    pg_ctl -D "${PGDATA_DIR}" -l "${LOG_FILE}" -w start > /dev/null
    echo "started on 127.0.0.1:${PORT}"
}

cmd_stop() {
    is_running || { echo "not running"; return 0; }
    pg_ctl -D "${PGDATA_DIR}" -m fast -w stop > /dev/null
    echo "stopped"
}

cmd_status() {
    if is_running; then
        echo "running: 127.0.0.1:${PORT}, database ${DB_NAME}, user ${APP_USER}"
    else
        echo "stopped (data: ${PGDATA_DIR})"
    fi
}

cmd_psql() {
    load_credentials
    PGPASSWORD="${APP_PASSWORD}" exec psql -h 127.0.0.1 -p "${PORT}" -U "${APP_USER}" -d "${DB_NAME}" "$@"
}

cmd_env() {
    load_credentials
    cat <<EOF
export DB_PG_EXTERNAL_HOSTNAME=127.0.0.1
export DB_PG_INTERNAL_HOSTNAME=127.0.0.1
export DB_PG_PORT=${PORT}
export DB_PG_DATABASE=${DB_NAME}
export DB_PG_USER=${APP_USER}
export DB_PG_PASSWORD=${APP_PASSWORD}
export DB_PG_SSL=disable
export DB_PG_EXPIRE=
EOF
}

cmd_serve() {
    is_running || die "not running; run: local-db.sh start"
    eval "$(cmd_env)"
    cd "${PROJECT_ROOT}"
    # Real environment variables take precedence over .env (node --env-file and
    # dotenv never override them), so the app uses the local database.
    NODE_ENV=development PORT_DEV="${SERVE_PORT}" exec npm run dev
}

cmd_run() {
    [ $# -gt 0 ] || die "usage: local-db.sh run <command> [args…]"
    is_running || die "not running; run: local-db.sh start"
    eval "$(cmd_env)"
    cd "${PROJECT_ROOT}"
    NODE_ENV=development exec "$@"
}

cmd_reset() {
    load_credentials
    is_running || die "not running; run: local-db.sh start"
    super_psql -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);"
    super_psql -c "CREATE DATABASE ${DB_NAME} OWNER ${APP_USER};"
    echo "reset: ${DB_NAME} is empty"
}

cmd_load_prod() {
    load_credentials
    is_running || die "not running; run: local-db.sh start"
    [ -f "${PROJECT_ROOT}/.env" ] || die "no .env with the Render DB_PG_* settings"

    local host port db user password
    host="$(grep '^DB_PG_EXTERNAL_HOSTNAME=' "${PROJECT_ROOT}/.env" | cut -d= -f2-)"
    port="$(grep '^DB_PG_PORT=' "${PROJECT_ROOT}/.env" | cut -d= -f2-)"
    db="$(grep '^DB_PG_DATABASE=' "${PROJECT_ROOT}/.env" | cut -d= -f2-)"
    user="$(grep '^DB_PG_USER=' "${PROJECT_ROOT}/.env" | cut -d= -f2-)"
    password="$(grep '^DB_PG_PASSWORD=' "${PROJECT_ROOT}/.env" | cut -d= -f2-)"

    echo "Dumping the Render database (read-only)..."
    umask 077
    PGPASSWORD="${password}" PGSSLMODE=require pg_dump -h "${host}" -p "${port:-5432}" -U "${user}" \
        -d "${db}" --format=custom --no-owner --no-privileges -f "${DUMP_FILE}"

    cmd_reset
    echo "Restoring into ${DB_NAME}..."
    PGPASSWORD="${APP_PASSWORD}" pg_restore -h 127.0.0.1 -p "${PORT}" -U "${APP_USER}" \
        -d "${DB_NAME}" --no-owner --no-privileges --exit-on-error "${DUMP_FILE}"
    echo "Loaded Render snapshot into ${DB_NAME} (dump kept at ${DUMP_FILE})"
}

cmd_destroy() {
    cmd_stop || true
    rm -rf "${STATE_DIR}"
    echo "deleted ${STATE_DIR}"
}

case "${1:-}" in
    init) cmd_init ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    status) cmd_status ;;
    psql) shift; cmd_psql "$@" ;;
    env) cmd_env ;;
    serve) cmd_serve ;;
    run) shift; cmd_run "$@" ;;
    load-prod) cmd_load_prod ;;
    reset) cmd_reset ;;
    destroy) cmd_destroy ;;
    *) sed -n '3,27p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
