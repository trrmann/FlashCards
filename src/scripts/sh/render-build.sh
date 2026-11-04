#!/bin/bash

################################################################################
# Render build command for FlashCards:  bash src/scripts/sh/render-build.sh
#
# FlashCards installs the shared packages from GitHub (platform-db and
# request-queue are public; iam-service is private). npm records GitHub
# dependencies as git+ssh, and Render's build has no SSH key, so this script:
#   1. rewrites GitHub SSH URLs to HTTPS;
#   2. when GITHUB_TOKEN is set (Render environment variable: a fine-grained
#      token with read-only "Contents" access to trrmann/iam-service), answers
#      git's credential request with it. The token is never put into a URL,
#      written to the repository, or printed;
#   3. runs a clean install from package-lock.json.
################################################################################

set -euo pipefail

git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
git config --global --add url."https://github.com/".insteadOf "git@github.com:"

if [ -n "${GITHUB_TOKEN:-}" ]; then
    # The helper reads the variable when git asks; the token itself is not stored in git config.
    # shellcheck disable=SC2016
    git config --global credential."https://github.com".helper \
        '!f() { [ "$1" = get ] && echo "username=x-access-token" && echo "password=${GITHUB_TOKEN}"; }; f'
else
    echo "render-build: GITHUB_TOKEN is not set; installing the private iam-service package will fail" >&2
fi

npm ci
