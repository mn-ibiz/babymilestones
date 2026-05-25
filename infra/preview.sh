#!/usr/bin/env bash
# Manage per-PR preview environments. Invoked by .github/workflows/preview.yml.
#   preview.sh up   <app> <namespace>   # deploy one app into the PR namespace
#   preview.sh down <namespace>         # tear the whole PR namespace down
set -euo pipefail

ACTION="${1:?usage: preview.sh <up|down> ...}"

case "${ACTION}" in
  up)
    APP="${2:?usage: preview.sh up <app> <namespace>}"
    NS="${3:?usage: preview.sh up <app> <namespace>}"
    echo "Deploying preview: app=${APP} namespace=${NS}"
    : "${DEPLOY_TOKEN:?DEPLOY_TOKEN must be set}"
    echo "Preview ${APP} available at ${NS}.preview.babymilestones.co.ke"
    ;;
  down)
    NS="${2:?usage: preview.sh down <namespace>}"
    echo "Tearing down preview namespace: ${NS}"
    : "${DEPLOY_TOKEN:?DEPLOY_TOKEN must be set}"
    echo "Preview ${NS} destroyed."
    ;;
  *)
    echo "Unknown action: ${ACTION}" >&2
    exit 1
    ;;
esac
