#!/bin/bash

################################################################################
# FlashCards Deployment Script
# 
# Usage: ./deploy.sh -dev | -preview | -prod | -all
#
# Deploys to specified environment(s) with logging and browser testing
# All environments use local server except prod which auto-deploys to Render
################################################################################

set -o pipefail

# Script configuration - find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}"

# Change to project root directory (allows script to run from anywhere)
cd "${PROJECT_ROOT}" || { echo "Failed to change to project directory"; exit 1; }

LOG_DIR="${PROJECT_ROOT}/.deployment"
LOG_FILE="${LOG_DIR}/last-run.log"
RENDER_WAIT_TIME=30  # seconds to wait for Render auto-deploy
PORT=5000

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
  ./deploy.sh [OPTION]

OPTIONS:
  -dev      Deploy to local development environment
            • Starts server on localhost:5000
            • Uses remote Render PostgreSQL
            • Auto-opens browser when ready
            • Logs to .deployment/last-run.log

  -preview  Deploy to local preview environment
            • Final test before production
            • Same setup as -dev but for final validation
            • Uses remote Render PostgreSQL
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
  ./deploy.sh -dev              # Start development server
  ./deploy.sh -preview          # Run preview deployment
  ./deploy.sh -prod             # Deploy to production
  ./deploy.sh -all              # Deploy all environments
  ./deploy.sh -h                # Show this help

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
    if npm run format &> /dev/null; then
        log INFO "Formatting code..."
        if ! npm run format >> "${LOG_FILE}" 2>&1; then
            error_exit "Code formatting failed. Check .deployment/last-run.log for details."
        fi
        log SUCCESS "Code formatted successfully"
    else
        log WARN "format script not configured (skipping)"
    fi
    
    # Run lint with verification
    if npm run lint &> /dev/null; then
        log INFO "Verifying code with linter..."
        if ! npm run lint >> "${LOG_FILE}" 2>&1; then
            error_exit "Linter verification failed. Code does not meet quality standards. Check .deployment/last-run.log for details."
        fi
        log SUCCESS "Code verification passed"
    else
        log WARN "lint script not configured (skipping)"
    fi
}

run_comprehensive_tests() {
    log INFO "Running comprehensive preview test suite..."
    log INFO "Tests: Lighthouse, HTML/CSS validation, Memory, Core Web Vitals"
    
    cd "${PROJECT_ROOT}"
    
    # Run preview tests
    if npm run test:preview >> "${LOG_FILE}" 2>&1; then
        log SUCCESS "All preview tests passed"
        return 0
    else
        local test_output=$(npm run test:preview 2>&1)
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
# Environment Deployment Functions
################################################################################

deploy_dev() {
    log INFO "=========================================="
    log INFO "DEPLOYING TO: Development (Local)"
    log INFO "=========================================="
    
    cd "${PROJECT_ROOT}"
    
    log INFO "Starting development server on localhost:${PORT}..."
    
    # Kill any existing process on PORT
    if lsof -i :${PORT} &> /dev/null; then
        log WARN "Process already running on port ${PORT}. Killing..."
        kill -9 $(lsof -t -i :${PORT}) 2>/dev/null
        sleep 1
    fi
    
    # Start server in background
    NODE_ENV=development npm run dev >> "${LOG_FILE}" 2>&1 &
    local pid=$!
    
    log INFO "Server PID: $pid"
    log INFO "Waiting for server to start..."
    
    # Wait for server to be ready
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:${PORT}/api/health > /dev/null 2>&1; then
            log SUCCESS "Development server is running"
            log SUCCESS "URL: http://localhost:${PORT}"
            echo "DEV_PID=$pid" >> "${LOG_FILE}"
            return 0
        fi
        sleep 1
        ((attempt++))
    done
    
    error_exit "Development server failed to start after ${max_attempts} seconds"
}

deploy_preview() {
    log INFO "=========================================="
    log INFO "DEPLOYING TO: Preview (Local)"
    log INFO "=========================================="
    
    cd "${PROJECT_ROOT}"
    
    # Run strict code verification for preview
    run_checks_strict
    
    log INFO "Starting preview server on localhost:${PORT}..."
    
    # Kill any existing process on PORT
    if lsof -i :${PORT} &> /dev/null; then
        log WARN "Process already running on port ${PORT}. Killing..."
        kill -9 $(lsof -t -i :${PORT}) 2>/dev/null
        sleep 1
    fi
    
    # Start server in background
    NODE_ENV=preview npm run dev >> "${LOG_FILE}" 2>&1 &
    local pid=$!
    
    log INFO "Server PID: $pid"
    log INFO "Waiting for server to start..."
    
    # Wait for server to be ready
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:${PORT}/ > /dev/null 2>&1; then
            log SUCCESS "Preview server is running"
            log SUCCESS "URL: http://localhost:${PORT}"
            echo "PREVIEW_PID=$pid" >> "${LOG_FILE}"
            
            # Give server time to fully initialize
            sleep 2
            
            # Run comprehensive preview tests
            run_comprehensive_tests
            
            # If tests pass, return (server continues running)
            return 0
        fi
        sleep 1
        ((attempt++))
    done
    
    error_exit "Preview server failed to start after ${max_attempts} seconds"
}

deploy_prod() {
    log INFO "=========================================="
    log INFO "DEPLOYING TO: Production (Render)"
    log INFO "=========================================="
    
    cd "${PROJECT_ROOT}"
    
    # Check if git is clean (warn but don't block)
    if ! git diff-index --quiet HEAD --; then
        log WARN "Uncommitted changes. Commit them first:"
        log INFO "  git add ."
        log INFO "  git commit -m 'Your message'"
        log INFO "  git push origin main"
        error_exit "Please commit and push changes before deploying to production"
    fi
    
    log INFO "Pushing to GitHub (triggers Render auto-deploy)..."
    
    # Push to GitHub
    if ! git push origin main >> "${LOG_FILE}" 2>&1; then
        error_exit "git push failed. Check your branch and remote."
    fi
    
    log SUCCESS "Code pushed to GitHub"
    log INFO "Waiting ${RENDER_WAIT_TIME} seconds for Render auto-deploy..."
    
    # Wait for Render to deploy
    for i in $(seq 1 $RENDER_WAIT_TIME); do
        echo -n "."
        sleep 1
    done
    echo ""
    
    log INFO "Render should be deploying now"
    log INFO "Check your Render dashboard for deployment status"
    
    # Try to get Render app URL from git remote
    local render_url=$(git config --get remote.origin.url | sed 's/.*github.com\/.*\/\(.*\)\.git/\1/' | tr '[:lower:]' '[:upper:]')
    
    log SUCCESS "Production deployment initiated"
    log INFO "Visit your Render dashboard to monitor deployment"
    
    echo "PROD_DEPLOYED=$(date)" >> "${LOG_FILE}"
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
    
    if [ -z "$env" ]; then
        echo "FlashCards Deployment Script"
        echo ""
        echo "Usage: $0 -dev | -preview | -prod | -all"
        echo ""
        echo "Options:"
        echo "  -dev       Deploy to development (local)"
        echo "  -preview   Deploy to preview (local)"
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
            open_browser "http://localhost:${PORT}" "Development"
            ;;
        -preview)
            deploy_preview
            open_browser "http://localhost:${PORT}" "Preview"
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
            open_browser "http://localhost:${PORT}" "Development"
            log INFO "Testing dev environment... Press Enter to continue to preview"
            read -p ""
            
            # Preview
            log INFO "Switching to preview..."
            if lsof -i :${PORT} &> /dev/null; then
                kill -9 $(lsof -t -i :${PORT}) 2>/dev/null
                sleep 2
            fi
            deploy_preview
            open_browser "http://localhost:${PORT}" "Preview"
            log INFO "Testing preview environment... Press Enter to continue to production"
            read -p ""
            
            # Prod
            if lsof -i :${PORT} &> /dev/null; then
                kill -9 $(lsof -t -i :${PORT}) 2>/dev/null
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
