#!/bin/bash

################################################################################
# Render build command for FlashCards:  bash src/scripts/sh/render-build.sh
#
# FlashCards installs the shared packages from GitHub (platform-db and
# request-queue are public; iam-service is private). npm records GitHub
# dependencies as git+ssh, and Render's build has no SSH key, so this script:
#   1. rewrites GitHub SSH URLs to HTTPS (for this build only, via the environment);
#   2. when GITHUB_TOKEN is set (Render environment variable: a fine-grained
#      token with read-only "Contents" access to trrmann/iam-service), answers
#      git's credential request with it. The token is never put into a URL,
#      written to the repository, or printed;
#   3. runs a clean install from package-lock.json.
################################################################################

set -euo pipefail

# Git settings are passed through the environment (GIT_CONFIG_COUNT / _KEY_n / _VALUE_n,
# git 2.31+), which npm hands to every git command it runs. Nothing is written to the
# global git config: Render keeps the home directory between builds, and repeated
# `git config --global` calls failed on the values a previous build left behind.
export GIT_CONFIG_COUNT=2
export GIT_CONFIG_KEY_0='url.https://github.com/.insteadOf' GIT_CONFIG_VALUE_0='ssh://git@github.com/'
export GIT_CONFIG_KEY_1='url.https://github.com/.insteadOf' GIT_CONFIG_VALUE_1='git@github.com:'

if [ -n "${GITHUB_TOKEN:-}" ]; then
    # The helper reads the variable when git asks; the token itself is never stored.
    # shellcheck disable=SC2016
    export GIT_CONFIG_KEY_2='credential.https://github.com.helper'
    export GIT_CONFIG_VALUE_2='!f() { [ "$1" = get ] && echo "username=x-access-token" && echo "password=${GITHUB_TOKEN}"; }; f'
    export GIT_CONFIG_COUNT=3
else
    echo "render-build: GITHUB_TOKEN is not set; installing the private iam-service package will fail" >&2
fi

npm ci
