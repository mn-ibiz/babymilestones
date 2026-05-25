#!/usr/bin/env bash
# Release a single built app. Invoked per-app by .github/workflows/deploy.yml
# AFTER the gated `migrate` job has succeeded. The concrete platform target
# (container registry / host) is wired by the deploy story; this script is the
# stable seam the workflow calls.
set -euo pipefail

APP="${1:?usage: deploy.sh <app>}"

echo "Releasing app: ${APP}"
# Placeholder release step — replace with the real platform release command
# (e.g. push image + roll the service). Must exit non-zero on failure so the
# matrix job is marked failed.
: "${DEPLOY_TOKEN:?DEPLOY_TOKEN must be set for a real release}"
echo "Release of ${APP} complete."
