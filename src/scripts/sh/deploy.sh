#!/bin/bash

################################################################################
# FlashCards Deployment Script
# 
# Usage: deploy.sh -dev | -preview [--remote] | -prod | -all   (on PATH; any directory)
#
# Deploys to specified environment(s) with logging and browser testing.
# Databases: dev and preview use the local dev database (flashcards_dev_local; refresh it
# from production with pull-prod.sh). preview --remote opens production READ-ONLY.
# Only -prod (Render) writes to production.
################################################################################

set -o pipefail

# Script configuration - find project root.
# This script lives in <project>/src/scripts/sh/ and is on PATH, so resolve
# its real location (following symlinks) and walk up three levels.
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Change to project root directory (allows script to run from anywhere)
cd "${PROJECT_ROOT}" || { echo "Failed to change to project directory"; exit 1; }

LOG_DIR="${PROJECT_ROOT}/.deployment"
LOG_FILE="${LOG_DIR}/last-run.log"
RENDER_WAIT_TIME=45  # seconds to wait for initial Render deployment (last deploy: 34.6s)
RENDER_HEALTH_CHECKS=60  # max health check attempts (up to 2min if free tier is spinning up)
PORT_DEV=5000
PORT_PREVIEW=4000
PORT_PROD=3000
DEV_DB_NAME=flashcards_dev_local   # dev/preview data; the test suites use flashcards_local

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Initialize logging
mkdir -p "${LOG_DIR}"

# Clear previous log
> "${LOG_FILE}"

################################################################################
# Utility Functions
################################################################################

log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo "[${timestamp}] [${level}] ${message}" >> "${LOG_FILE}"
    
    case $level in
        INFO)
            echo -e "${BLUE}[INFO]${NC} ${message}"
            ;;
        SUCCESS)
            echo -e "${GREEN}[✓]${NC} ${message}"
            ;;
        WARN)
            echo -e "${YELLOW}[!]${NC} ${message}"
            ;;
        ERROR)
            echo -e "${RED}[✗]${NC} ${message}"
            ;;
    esac
}

error_exit() {
    local message=$1
    local exit_code=${2:-1}
    log ERROR "$message"
    echo "" >> "${LOG_FILE}"
    echo "DEPLOYMENT FAILED: ${message}" >> "${LOG_FILE}"
    echo "See full log: ${LOG_FILE}"
    exit $exit_code
}

check_prerequisite() {
    local cmd=$1
    local error_msg=$2
    
    if ! command -v "$cmd" &> /dev/null; then
        error_exit "$error_msg"
    fi
}

show_usage() {
    cat << 'EOF'

╔════════════════════════════════════════════════════════════════╗
║            FlashCards Deployment Script                        ║
╚════════════════════════════════════════════════════════════════╝

USAGE:
  deploy.sh [OPTION]        (or the 'deploy' alias; works from any directory)

OPTIONS:
  -dev      Deploy to local development environment
            • Starts server on localhost:5000
            • Uses the LOCAL dev database (flashcards_dev_local, read/write)
            • Refresh it from production first with: pull-prod.sh
            • Auto-opens browser when ready
            • Logs to .deployment/last-run.log

  -preview  Deploy to local preview environment (full quality gate)
            • Default: LOCAL dev database, read/write
            • --remote: PRODUCTION database, READ-ONLY (PostgreSQL refuses every
              write; no schema bootstrap; signed-out checks only)
            • Auto-opens browser when ready

  -prod     Deploy to production (Render)
            • Commits and pushes to GitHub main branch
            • Triggers Render auto-deploy webhook
            • Waits 30 seconds for Render to deploy
            • Logs to .deployment/last-run.log

  -all      Deploy to all environments sequentially
            • Runs: dev → preview → prod
            • Pauses between each for manual testing
            • Press Enter to continue to next environment

  -h, --help
            Show this help message

PRE-REQUISITES (automatically checked):
  ✓ Node.js and npm installed
  ✓ git installed and configured
  ✓ .env file exists in project root
  ✓ server.js exists in project root

EXAMPLES:
  deploy.sh -dev              # Start development server
  deploy.sh -preview          # Run preview deployment (local database)
  deploy.sh -preview --remote # Preview against production, read-only
  deploy.sh -prod             # Deploy to production
  deploy.sh -all              # Deploy all environments
  deploy.sh -h                # Show this help

LOGGING:
  All deployments are logged to: .deployment/last-run.log
  Only the last deployment run is kept (not version-controlled)
  Errors are captured and logged even if deployment continues

TROUBLESHOOTING:
  • Port 5000 in use? Script auto-kills existing process
  • Check .deployment/last-run.log for detailed error messages
  • Re-run the command to retry deployment
  • Use 'git status' to check if code is committed

EOF
}

# Handle help request
if [[ "$1" == "-h" || "$1" == "--help" || "$1" == "help" ]]; then
    show_usage
    exit 0
fi

# Validate argument provided
if [[ $# -eq 0 ]]; then
    show_usage
    error_exit "No environment specified. Use -dev, -preview, -prod, -all, or -h for help" 1
fi

################################################################################
# Prerequisites Check
################################################################################

check_prerequisites() {
    log INFO "Checking prerequisites..."
    
    check_prerequisite "node" "Node.js not found. Please install Node.js 18+"
    check_prerequisite "npm" "npm not found. Please install npm"
    check_prerequisite "git" "git not found. Please install git"
    
    # Check .env file exists
    if [ ! -f "${PROJECT_ROOT}/.env" ]; then
        error_exit ".env file not found in project root. Run setup first."
    fi
    
    # Check server.js exists
    if [ ! -f "${PROJECT_ROOT}/server.js" ]; then
        error_exit "server.js not found in project root."
    fi
    
    log SUCCESS "All prerequisites met"
}

################################################################################
# Git Status Check
################################################################################

check_git_status() {
    log INFO "Checking git status..."
    
    cd "${PROJECT_ROOT}"
    
    # Get current branch
    local branch=$(git rev-parse --abbrev-ref HEAD 2>&1)
    if [ $? -ne 0 ]; then
        error_exit "Not a git repository or git error: $branch"
    fi
    
    log INFO "Current branch: $branch"
    
    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        log WARN "Uncommitted changes detected"
        git diff --stat >> "${LOG_FILE}" 2>&1
    fi
}

################################################################################
# Dependency Check
################################################################################

check_dependencies() {
    log INFO "Checking npm dependencies..."
    
    cd "${PROJECT_ROOT}"
    
    if [ ! -d "node_modules" ]; then
        log WARN "node_modules not found. Running npm install..."
        npm install >> "${LOG_FILE}" 2>&1 || error_exit "npm install failed"
    fi
    
    log SUCCESS "Dependencies ready"
}

################################################################################
# Linting and Testing (Optional)
################################################################################

run_checks() {
    log INFO "Running code checks..."
    
    cd "${PROJECT_ROOT}"
    
    # Check if linter is configured
    if npm run lint &> /dev/null; then
        log INFO "Running linter..."
        if ! npm run lint >> "${LOG_FILE}" 2>&1; then
            log WARN "Linter found issues (non-blocking)"
            npm run lint >> "${LOG_FILE}" 2>&1
        fi
    fi
    
    # Check if tests are configured
    if npm run test &> /dev/null; then
        log INFO "Running tests..."
        if ! npm run test >> "${LOG_FILE}" 2>&1; then
            log WARN "Tests failed (non-blocking for dev/preview)"
        fi
    fi
}

run_checks_strict() {
    log INFO "Running strict code verification (format + lint)..."
    
    cd "${PROJECT_ROOT}"
    
    # Run format
    log INFO "Formatting code..."
    if ! npm run format >> "${LOG_FILE}" 2>&1; then
        error_exit "Code formatting failed. Check .deployment/last-run.log for details."
    fi
    log SUCCESS "Code formatted successfully"
    
    # Run lint with verification
    log INFO "Verifying code with linter..."
    if ! npm run lint >> "${LOG_FILE}" 2>&1; then
        error_exit "Linter verification failed. Code does not meet quality standards. Check .deployment/last-run.log for details."
    fi
    log SUCCESS "Code verification passed"
}

run_comprehensive_tests() {
    log INFO "Running comprehensive preview test suite..."
    log INFO "Tests: Lighthouse, HTML/CSS validation, Memory, Core Web Vitals"
    
    cd "${PROJECT_ROOT}"
    
    # Run preview tests against the preview server
    if TEST_BASE_URL="http://localhost:${PORT_PREVIEW}" npm run test:preview >> "${LOG_FILE}" 2>&1; then
        log SUCCESS "All preview tests passed"
        run_local_db_tests
        return 0
    else
        local test_output=$(TEST_BASE_URL="http://localhost:${PORT_PREVIEW}" npm run test:preview 2>&1)
        log ERROR "Preview tests failed"
        echo "" >> "${LOG_FILE}"
        echo "═════════════════════════════════════════════" >> "${LOG_FILE}"
        echo "PREVIEW TEST FAILURES:" >> "${LOG_FILE}"
        echo "═════════════════════════════════════════════" >> "${LOG_FILE}"
        echo "${test_output}" >> "${LOG_FILE}"
        echo "═════════════════════════════════════════════" >> "${LOG_FILE}"
        echo "" >> "${LOG_FILE}"
        error_exit "Preview tests failed. Check .deployment/last-run.log for detailed results."
    fi
}

################################################################################
# Database Targets
################################################################################

use_local_database() {
    # Dev/preview data lives in its own local database, apart from flashcards_local, which
    # the test suites drop and rebuild. Exported settings win over .env (dotenv never
    # overrides real environment variables).
    "${SCRIPT_DIR}/local-db.sh" start >> "${LOG_FILE}" 2>&1 \
        || error_exit "Local database cluster unavailable. Set it up once with: local-db.sh init"
    LOCAL_DB_NAME="${DEV_DB_NAME}" "${SCRIPT_DIR}/local-db.sh" init >> "${LOG_FILE}" 2>&1 \
        || error_exit "Could not create the local dev database ${DEV_DB_NAME}"
    eval "$(LOCAL_DB_NAME="${DEV_DB_NAME}" "${SCRIPT_DIR}/local-db.sh" env)"
    export DB_PG_READ_ONLY=false
    log INFO "Database: LOCAL ${DB_PG_DATABASE} on ${DB_PG_EXTERNAL_HOSTNAME}:${DB_PG_PORT} (read/write)"
    log INFO "Refresh it from production with: pull-prod.sh"
}

use_remote_read_only() {
    # Production from .env, opened read-only: PostgreSQL refuses every write and the server
    # skips the schema bootstrap.
    export DB_PG_READ_ONLY=true
    log WARN "Database: PRODUCTION (from .env), READ-ONLY. Signing in is not possible in this mode."
}

wait_until_healthy() {
    # /api/health answers 503 until the server's database is ready, so -f waits for 200.
    local port=$1
    local max_attempts=${2:-90}
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "http://localhost:${port}/api/health" > /dev/null 2>&1; then
            return 0
        fi
        sleep 1
        ((attempt++))
    done
    return 1
}

run_local_db_tests() {
    # CODING_STANDARDS 0.6/0.7 tests that need a disposable database: they drop and
    # rebuild the schema, so they run only on the local scratch database.
    log INFO "Running local-database tests (backup round trip, IAM API, start-up, schema clean-up)..."
    if ! "${SCRIPT_DIR}/local-db.sh" start >> "${LOG_FILE}" 2>&1; then
        error_exit "Local scratch database unavailable. Set it up once with: local-db.sh init"
    fi
    local test_name
    for test_name in test:roundtrip test:roundtrip:remote test:iam test:iam:remote test:identity test:deletion test:deletion:remote test:startup test:cleanup; do
        if npm run "${test_name}" >> "${LOG_FILE}" 2>&1; then
            log SUCCESS "${test_name} passed"
        else
            error_exit "${test_name} failed. Check .deployment/last-run.log for details."
        fi
    done
}

################################################################################
# Environment Deployment Functions
################################################################################

deploy_dev() {
    log INFO "=========================================="
    log INFO "DEPLOYING TO: Development (Local)"
    log INFO "=========================================="
    
    cd "${PROJECT_ROOT}"
    
    use_local_database
    log INFO "Starting development server on localhost:${PORT_DEV}..."
    
    # Kill any existing process on PORT_DEV
    if lsof -i :${PORT_DEV} &> /dev/null; then
        log WARN "Process already running on port ${PORT_DEV}. Killing..."
        kill -9 $(lsof -t -i :${PORT_DEV}) 2>/dev/null
        sleep 1
    fi
    
    # Start server in background
    NODE_ENV=development npm run dev >> "${LOG_FILE}" 2>&1 &
    local pid=$!
    
    log INFO "Server PID: $pid"
    log INFO "Waiting for server to start..."
    
    if wait_until_healthy "${PORT_DEV}"; then
        log SUCCESS "Development server is running"
        log SUCCESS "URL: http://localhost:${PORT_DEV}"
        echo "DEV_PID=$pid" >> "${LOG_FILE}"
        return 0
    fi

    error_exit "Development server did not become healthy (see .deployment/last-run.log)"
}

deploy_preview() {
    local mode=${1:-local}
    log INFO "=========================================="
    log INFO "DEPLOYING TO: Preview (local server, ${mode} database)"
    log INFO "=========================================="
    
    cd "${PROJECT_ROOT}"
    
    # Run strict code verification for preview
    run_checks_strict

    if [ "${mode}" = "remote" ]; then
        use_remote_read_only
    else
        use_local_database
    fi
    
    log INFO "Starting preview server on localhost:${PORT_PREVIEW}..."
    
    # Kill any existing process on PORT_PREVIEW
    if lsof -i :${PORT_PREVIEW} &> /dev/null; then
        log WARN "Process already running on port ${PORT_PREVIEW}. Killing..."
        kill -9 $(lsof -t -i :${PORT_PREVIEW}) 2>/dev/null
        sleep 1
    fi
    
    # Start server in background
    NODE_ENV=preview npm run dev >> "${LOG_FILE}" 2>&1 &
    local pid=$!
    
    log INFO "Server PID: $pid"
    log INFO "Waiting for server to start..."
    
    if wait_until_healthy "${PORT_PREVIEW}"; then
        log SUCCESS "Preview server is running"
        log SUCCESS "URL: http://localhost:${PORT_PREVIEW}"
        echo "PREVIEW_PID=$pid" >> "${LOG_FILE}"

        # Run comprehensive preview tests (the server keeps running afterwards)
        run_comprehensive_tests
        return 0
    fi

    error_exit "Preview server did not become healthy (see .deployment/last-run.log)"
}

deploy_prod() {
    log INFO "=========================================="
    log INFO "DEPLOYING TO: Production (Render)"
    log INFO "=========================================="
    
    cd "${PROJECT_ROOT}"
    
    # Load RENDER_URL from .env
    local render_url=""
    if [ -f ".env" ]; then
        render_url=$(grep "^RENDER_URL=" .env | cut -d'=' -f2)
    fi
    
    if [ -z "$render_url" ]; then
        log WARN "RENDER_URL not found in .env. Will show dashboard link instead."
    else
        log INFO "Production URL: $render_url"
    fi

    # CODING_STANDARDS 0.7: take a fresh full backup of production before every release.
    if [ -z "$render_url" ]; then
        error_exit "RENDER_URL is required in .env to back up production before deploying."
    fi
    log INFO "Backing up production before release (admin sign-in required)..."
    if ! "${SCRIPT_DIR}/backup.sh" "$render_url" 2>&1 | tee -a "${LOG_FILE}"; then
        error_exit "Pre-release backup failed; nothing was deployed. Check .deployment/last-run.log for details."
    fi
    log SUCCESS "Production backup saved (see ~/FlashCardsBackups)"
    
    # Auto-format any changes to documentation/config files
    log INFO "Running code format check..."
    if ! npm run format >> "${LOG_FILE}" 2>&1; then
        error_exit "Code formatting failed. Check .deployment/last-run.log for details."
    fi
    
    # Check if there are any formatting changes that need to be committed
    if ! git diff-index --quiet HEAD --; then
        log INFO "Auto-formatting found changes. Committing..."
        git add . >> "${LOG_FILE}" 2>&1
        git commit -m "build: Auto-format code before production deployment

Prettier formatting applied before production deployment to ensure
consistency. These changes were generated by the deploy script.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" >> "${LOG_FILE}" 2>&1
        if [ $? -ne 0 ]; then
            error_exit "Failed to commit formatting changes. Check git status."
        fi
        log SUCCESS "Formatting changes committed"
    fi
    
    log INFO "Pushing to GitHub (triggers Render auto-deploy)..."
    
    # Push to GitHub
    if ! git push origin main >> "${LOG_FILE}" 2>&1; then
        error_exit "git push failed. Check your branch and remote."
    fi
    
    log SUCCESS "Code pushed to GitHub"
    log INFO "Waiting ${RENDER_WAIT_TIME} seconds for Render auto-deploy to start..."
    log WARN "Note: Free tier may add 50+ seconds if instance is spinning up from inactivity"
    
    # Wait for Render to deploy
    for i in $(seq 1 $RENDER_WAIT_TIME); do
        echo -n "."
        sleep 1
    done
    echo ""
    
    log INFO "Render should be deploying now"
    
    # Now check if the site is actually responding
    if [ -n "$render_url" ]; then
        log INFO "Checking if Render deployment is complete..."
        local health_check_attempts=0
        local max_health_checks=$RENDER_HEALTH_CHECKS
        local site_ready=false
        
        while [ $health_check_attempts -lt $max_health_checks ]; do
            if curl -sf "${render_url}/" > /dev/null 2>&1; then
                log SUCCESS "Production site is responding!"
                site_ready=true
                break
            fi
            
            health_check_attempts=$((health_check_attempts + 1))
            if [ $((health_check_attempts % 10)) -eq 0 ]; then
                log INFO "Still waiting for Render... ($health_check_attempts/$max_health_checks attempts)"
            fi
            echo -n "."
            sleep 2
        done
        echo ""
        
        if [ "$site_ready" = false ]; then
            log WARN "Render may still be deploying. Site not responding after $((max_health_checks * 2)) seconds."
            log INFO "Check Render Dashboard: https://dashboard.render.com"
        fi
        
        log INFO "Opening $render_url"
        open_browser "$render_url" "Production"
    else
        log INFO "Check your Render dashboard for deployment status"
        log INFO "Render Dashboard: https://dashboard.render.com"
    fi
    
    log SUCCESS "Production deployment initiated"
    
    if [ -n "$render_url" ]; then
        log INFO "Production URL: $render_url"
        log INFO "Test endpoints:"
        log INFO "  GET $render_url/api/health"
        log INFO "  GET $render_url/api/system/setup-status"
    fi
    
    echo "PROD_DEPLOYED=$(date)" >> "${LOG_FILE}"
    echo "PROD_URL=$render_url" >> "${LOG_FILE}"
}

################################################################################
# Browser Opening
################################################################################

open_browser() {
    local url=$1
    local env=$2
    
    log INFO "Opening browser for $env testing at $url..."
    
    # Detect OS and open browser accordingly
    if command -v open &> /dev/null; then
        # macOS
        open "$url" 2>/dev/null
    elif command -v xdg-open &> /dev/null; then
        # Linux
        xdg-open "$url" 2>/dev/null
    elif command -v start &> /dev/null; then
        # Windows
        start "$url" 2>/dev/null
    else
        log WARN "Could not open browser automatically. Visit: $url"
    fi
}

################################################################################
# Main Deployment Flow
################################################################################

main() {
    local env=${1:-}
    local preview_mode=local
    case "${2:-}" in
        "") ;;
        --remote)
            [ "$env" = "-preview" ] || error_exit "--remote is only valid with -preview"
            preview_mode=remote
            ;;
        *) error_exit "Unknown option: $2 (only -preview --remote is supported)" ;;
    esac
    
    if [ -z "$env" ]; then
        echo "FlashCards Deployment Script"
        echo ""
        echo "Usage: $0 -dev | -preview | -prod | -all"
        echo ""
        echo "Options:"
        echo "  -dev       Deploy to development (local)"
        echo "  -preview   Deploy to preview (local database; --remote: production read-only)"
        echo "  -prod      Deploy to production (Render, auto-deploy via GitHub)"
        echo "  -all       Deploy to all environments in sequence"
        echo ""
        echo "Deployment log: ${LOG_FILE}"
        exit 1
    fi
    
    # Start logging
    {
        echo "╔════════════════════════════════════════════════════════════════╗"
        echo "║  FlashCards Deployment"
        echo "║  Environment: $env"
        echo "║  Started: $(date)"
        echo "╚════════════════════════════════════════════════════════════════╝"
        echo ""
    } >> "${LOG_FILE}"
    
    log INFO "FlashCards Deployment Starting"
    log INFO "Environment: $env"
    
    # Run pre-deployment checks
    check_prerequisites
    check_git_status
    check_dependencies
    run_checks
    
    echo "" >> "${LOG_FILE}"
    
    # Deploy based on environment
    case $env in
        -dev)
            deploy_dev
            open_browser "http://localhost:${PORT_DEV}" "Development"
            ;;
        -preview)
            deploy_preview "${preview_mode}"
            open_browser "http://localhost:${PORT_PREVIEW}" "Preview"
            ;;
        -prod)
            deploy_prod
            log WARN "Production deployment in progress on Render"
            log INFO "Check Render dashboard for status and URL"
            ;;
        -all)
            log INFO "Deploying to all environments..."
            
            # Dev
            deploy_dev
            open_browser "http://localhost:${PORT_DEV}" "Development"
            log INFO "Testing dev environment... Press Enter to continue to preview"
            read -p ""
            
            # Preview
            log INFO "Switching to preview..."
            if lsof -i :${PORT_DEV} &> /dev/null; then
                kill -9 $(lsof -t -i :${PORT_DEV}) 2>/dev/null
                sleep 2
            fi
            deploy_preview
            open_browser "http://localhost:${PORT_PREVIEW}" "Preview"
            log INFO "Testing preview environment... Press Enter to continue to production"
            read -p ""
            
            # Prod
            if lsof -i :${PORT_PREVIEW} &> /dev/null; then
                kill -9 $(lsof -t -i :${PORT_PREVIEW}) 2>/dev/null
                sleep 1
            fi
            deploy_prod
            ;;
        *)
            error_exit "Unknown environment: $env"
            ;;
    esac
    
    echo "" >> "${LOG_FILE}"
    {
        echo "╔════════════════════════════════════════════════════════════════╗"
        echo "║  Deployment Completed"
        echo "║  Completed: $(date)"
        echo "╚════════════════════════════════════════════════════════════════╝"
    } >> "${LOG_FILE}"
    
    log SUCCESS "Deployment completed successfully"
    log INFO "Full log available: ${LOG_FILE}"
}

# Run main function
main "$@"
