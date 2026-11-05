#!/bin/bash

################################################################################
# Release to production with every check enforced. Nothing is pushed unless all
# the steps before it pass. (On PATH; runs from any directory.)
#
# Usage:
#   release.sh flashcards <branch> ["merge message"]
#       1. clean working tree; <branch> exists
#       2. production backup (backup.sh, stored login)
#       3. merge <branch> into main locally (--no-ff), then on that exact result:
#          npm run verify (must change nothing) and every test suite, in-process
#          and over HTTP. On any failure the local merge is undone; nothing is pushed
#       4. push main: Render deploys
#       5. wait until /api/health reports the new commit, then the read-only
#          production check, compared with the numbers before
#   release.sh iam-service
#       Pushes iam-service's main (already committed, ahead of origin) after a
#       production backup and its full test suite; waits for the IAM service's
#       /v1/health to report the new commit; checks FlashCards still answers.
#   release.sh heros-companion
#       Pushes heros-companion's main (already committed, ahead of origin) after
#       its format/lint check, every test suite and a production backup
#       (heros-companion's heros-backup.sh, stored login; skipped while production is
#       older than PORT_PLAN H3 and has no Heros data); waits for its /api/health
#       to report the new commit; checks sign-in answers through the IAM (401 for
#       an unknown account).
#       Its URL: HEROS_PROD_URL, else RENDER_URL in heros-companion/.env.
#
# A failure stops the release at that step; nothing after it runs. Logs:
# .deployment/release-<time>.log
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
PROJECTS_DIR="$(dirname "${PROJECT_ROOT}")"
IAM_ROOT="${PROJECTS_DIR}/iam-service"
IAM_PROD_URL="${IAM_PROD_URL:-https://iam-service-9zsf.onrender.com}"
HEROS_ROOT="${PROJECTS_DIR}/heros-companion"
LIVE_WAIT_SECONDS="${LIVE_WAIT_SECONDS:-600}"
FLASHCARDS_TESTS=(
    test:identity
    test:startup
    test:cleanup
    test:roundtrip
    test:roundtrip:remote
    test:iam
    test:iam:remote
    test:deletion
    test:deletion:remote
    test:own-login
    test:admin-page
    test:admin-page:remote
)

LOG_DIR="${PROJECT_ROOT}/.deployment"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/release-$(date -u +%Y%m%dT%H%M%SZ).log"

step() { printf '\n==> %s\n' "$*" | tee -a "${LOG_FILE}"; }
fail() { printf 'release: STOPPED: %s\n' "$*" | tee -a "${LOG_FILE}" >&2; exit 1; }

prod_url() {
    grep '^RENDER_URL=' "${PROJECT_ROOT}/.env" | cut -d= -f2- || true
}

# The counts and checks of the read-only production check (no row contents).
production_counts() {
    (cd "${PROJECT_ROOT}" && src/scripts/sh/prod-readonly-check.sh) 2> /dev/null |
        sed -n '/ source /,/rows)/p' | grep '|' | grep -v -- '---' || true
}

require_clean() {
    local dir="$1"
    [ -z "$(git -C "${dir}" status --porcelain)" ] || fail "uncommitted changes in ${dir}"
}

# The version (short commit) a health endpoint reports, or empty.
reported_version() {
    curl -s -m 70 "$1" | node -e '
        let s = "";
        process.stdin.on("data", (c) => (s += c)).on("end", () => {
            try { process.stdout.write(JSON.parse(s).version || ""); } catch { /* not JSON yet */ }
        });'
}

# Wait until <health url> reports <commit> (short); stop after LIVE_WAIT_SECONDS.
wait_until_live() {
    local url="$1" commit="${2:0:7}" waited=0 seen
    while [ "${waited}" -lt "${LIVE_WAIT_SECONDS}" ]; do
        seen="$(reported_version "${url}")"
        if [ "${seen}" = "${commit}" ]; then
            echo "live: ${url} reports ${commit} after ${waited}s" | tee -a "${LOG_FILE}"
            return 0
        fi
        sleep 15
        waited=$((waited + 15))
    done
    fail "${url} did not report ${commit} within ${LIVE_WAIT_SECONDS}s (last: ${seen:-none}); check Render's deploy log"
}

backup_production() {
    step "Production backup"
    backup.sh "$(prod_url)" 2>&1 | tee -a "${LOG_FILE}"
    [ "${PIPESTATUS[0]}" -eq 0 ] || fail "backup failed"
}

run_flashcards_checks() {
    step "Format and lint (npm run verify); it must change nothing"
    (cd "${PROJECT_ROOT}" && npm run -s verify) >> "${LOG_FILE}" 2>&1 || fail "verify failed (see ${LOG_FILE})"
    require_clean "${PROJECT_ROOT}"
    for test_name in "${FLASHCARDS_TESTS[@]}"; do
        step "${test_name}"
        if ! (cd "${PROJECT_ROOT}" && src/scripts/sh/local-db.sh run npm run -s "${test_name}") >> "${LOG_FILE}" 2>&1; then
            grep -E '✗|checks passed' "${LOG_FILE}" | tail -5
            fail "${test_name} failed (see ${LOG_FILE})"
        fi
        grep -E 'checks passed' "${LOG_FILE}" | tail -1
    done
}

release_flashcards() {
    local branch="${1:-}" message="${2:-}"
    [ -n "${branch}" ] || fail "usage: release.sh flashcards <branch> [\"merge message\"]"
    cd "${PROJECT_ROOT}"
    require_clean "${PROJECT_ROOT}"
    git rev-parse --verify --quiet "${branch}" > /dev/null || fail "no branch ${branch}"
    [ "${branch}" != "main" ] || fail "release a branch, not main itself"

    backup_production
    step "Production before"
    local before
    before="$(production_counts)"
    echo "${before}" | tee -a "${LOG_FILE}"

    step "Merge ${branch} into main (locally) and check the result"
    git checkout -q main
    git pull -q --ff-only
    local base
    base="$(git rev-parse HEAD)"
    git merge -q --no-ff "${branch}" -m "${message:-Release ${branch}}

Released with release.sh: backup, npm run verify and every test suite
passed on this merge before it was pushed (log ${LOG_FILE##*/}).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" ||
        { git merge --abort 2> /dev/null || true; fail "${branch} does not merge cleanly into main"; }
    # Undo the local merge if any check fails (nothing has been pushed yet).
    trap 'git -C "${PROJECT_ROOT}" reset -q --hard "${base}"; echo "release: local merge undone" >&2' EXIT
    run_flashcards_checks
    trap - EXIT

    step "Push main"
    git push -q origin main
    local commit
    commit="$(git rev-parse HEAD)"
    echo "pushed ${commit:0:7}" | tee -a "${LOG_FILE}"

    step "Waiting for production to run ${commit:0:7}"
    wait_until_live "$(prod_url)/api/health" "${commit}"

    step "Production after"
    local after
    after="$(production_counts)"
    echo "${after}" | tee -a "${LOG_FILE}"
    if [ "${before}" != "${after}" ]; then
        echo "note: production numbers changed during the release (people may be using it):" | tee -a "${LOG_FILE}"
        diff <(echo "${before}") <(echo "${after}") | tee -a "${LOG_FILE}" || true
    fi
    step "Released ${branch} as ${commit:0:7}"
}

release_iam_service() {
    [ -d "${IAM_ROOT}/.git" ] || fail "iam-service not found at ${IAM_ROOT}"
    require_clean "${IAM_ROOT}"
    [ "$(git -C "${IAM_ROOT}" branch --show-current)" = "main" ] || fail "iam-service is not on main"
    git -C "${IAM_ROOT}" fetch -q origin
    [ -n "$(git -C "${IAM_ROOT}" log --oneline origin/main..main)" ] || fail "iam-service has nothing to release"

    backup_production
    step "iam-service: format, lint and every test suite"
    (cd "${IAM_ROOT}" && npm run -s verify) >> "${LOG_FILE}" 2>&1 || fail "iam-service verify failed"
    require_clean "${IAM_ROOT}"
    (cd "${IAM_ROOT}" && npm test) >> "${LOG_FILE}" 2>&1 || fail "iam-service tests failed (see ${LOG_FILE})"
    grep -E 'checks passed' "${LOG_FILE}" | tail -8

    step "Push iam-service main"
    git -C "${IAM_ROOT}" push -q origin main
    local commit
    commit="$(git -C "${IAM_ROOT}" rev-parse HEAD)"
    echo "pushed ${commit:0:7}" | tee -a "${LOG_FILE}"

    step "Waiting for the IAM service to run ${commit:0:7}"
    wait_until_live "${IAM_PROD_URL}/v1/health" "${commit}"

    step "FlashCards still answers through the IAM service"
    local code
    code="$(curl -s -o /dev/null -m 120 -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
        -d '{"username":"release_check_nobody","password":"Wrong#2026x"}' "$(prod_url)/api/auth/login")"
    [ "${code}" = "401" ] || fail "FlashCards login check answered ${code}, expected 401"
    echo "login check: 401 as expected" | tee -a "${LOG_FILE}"
    step "Released iam-service as ${commit:0:7}"
}

heros_url() {
    if [ -n "${HEROS_PROD_URL:-}" ]; then
        echo "${HEROS_PROD_URL}"
    else
        grep '^RENDER_URL=' "${HEROS_ROOT}/.env" 2> /dev/null | cut -d= -f2- || true
    fi
}

# Back up Heros production. A server older than PORT_PLAN H3 has no backup endpoint (404 when
# signed out; H3 and later answer 401) and no Heros data, so there is nothing to back up.
backup_heros() {
    local url="$1" code="" tries=0
    step "Heros production backup"
    while [ "${tries}" -lt 12 ]; do
        code="$(curl -s -o /dev/null -m 120 -w '%{http_code}' "${url}/api/heros/backup" || true)"
        [ "${code}" = "503" ] || [ "${code}" = "000" ] || break
        tries=$((tries + 1))
        echo "Heros is waking (${code}); trying again in 10 s" | tee -a "${LOG_FILE}"
        sleep 10
    done
    if [ "${code}" = "404" ]; then
        echo "production is older than H3: no Heros data, no backup needed" | tee -a "${LOG_FILE}"
        return
    fi
    [ "${code}" = "401" ] || fail "Heros backup endpoint answered ${code}, expected 401 signed out"
    "${HEROS_ROOT}/src/scripts/sh/heros-backup.sh" "${url}" < /dev/null 2>&1 | tee -a "${LOG_FILE}"
    [ "${PIPESTATUS[0]}" -eq 0 ] || fail "Heros backup failed (store the login once: heros-companion/src/scripts/sh/heros-backup-login.sh)"
}

release_heros_companion() {
    [ -d "${HEROS_ROOT}/.git" ] || fail "heros-companion not found at ${HEROS_ROOT}"
    local url
    url="$(heros_url)"
    [ -n "${url}" ] || fail "no Heros URL: set RENDER_URL in ${HEROS_ROOT}/.env"
    require_clean "${HEROS_ROOT}"
    [ "$(git -C "${HEROS_ROOT}" branch --show-current)" = "main" ] || fail "heros-companion is not on main"
    git -C "${HEROS_ROOT}" fetch -q origin
    [ -n "$(git -C "${HEROS_ROOT}" log --oneline origin/main..main)" ] || fail "heros-companion has nothing to release"

    step "heros-companion: format, lint and every test suite"
    (cd "${HEROS_ROOT}" && npm run -s verify) >> "${LOG_FILE}" 2>&1 || fail "heros-companion verify failed"
    require_clean "${HEROS_ROOT}"
    (cd "${HEROS_ROOT}" && npm test) >> "${LOG_FILE}" 2>&1 || fail "heros-companion tests failed (see ${LOG_FILE})"
    grep -E 'passed' "${LOG_FILE}" | tail -3

    backup_heros "${url}"

    step "Push heros-companion main"
    git -C "${HEROS_ROOT}" push -q origin main
    local commit
    commit="$(git -C "${HEROS_ROOT}" rev-parse HEAD)"
    echo "pushed ${commit:0:7}" | tee -a "${LOG_FILE}"

    step "Waiting for Heros Companion to run ${commit:0:7}"
    wait_until_live "${url}/api/health" "${commit}"

    step "Heros sign-in answers through the IAM service"
    local code
    code="$(curl -s -o /dev/null -m 120 -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
        -d '{"username":"release_check_nobody","password":"Wrong#2026x"}' "${url}/api/auth/login")"
    [ "${code}" = "401" ] || fail "Heros login check answered ${code}, expected 401"
    echo "login check: 401 as expected" | tee -a "${LOG_FILE}"
    step "Released heros-companion as ${commit:0:7}"
}

case "${1:-}" in
    flashcards) release_flashcards "${2:-}" "${3:-}" ;;
    iam-service) release_iam_service ;;
    heros-companion) release_heros_companion ;;
    *)
        sed -n '4,31p' "$0" | sed 's/^# \{0,1\}//'
        exit 2
        ;;
esac
