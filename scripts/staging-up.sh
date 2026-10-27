#!/usr/bin/env bash
#
# Bring staging up to date for a branch: terraform apply, then trigger the
# cd-staging.yml workflow for that branch (transcoder image, backend Lambda
# code, frontend).
#
# Staging runs the backend on Lambda like production
# (infrastructure/environments/staging/backend-lambda.tf), so there is no
# server to build or stop: nothing is billed by the hour while staging is idle,
# and there is no staging-down.sh any more.
#
# Usage:
#   bash scripts/staging-up.sh              # current branch
#   bash scripts/staging-up.sh develop      # given branch
#   bash scripts/staging-up.sh develop -y   # terraform apply without asking
#
# Needs: AWS CLI (default profile = account B, profile "dacntt-a" = account A),
# Terraform, git; gh CLI to trigger the workflow.
#
# First time only: the staging Lambda refuses to start while its secret
# dacntt-staging/origin-verify-secret has no value. Put one in Secrets Manager
# and into the staging Worker (infrastructure/cloudflare-worker, see
# wrangler.toml [env.staging]) before running the workflow.

set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-1}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TF_DIR="$REPO_ROOT/infrastructure/environments/staging"
API_HEALTH_URL="https://api-staging.zelostech.site/health"
FRONTEND_URL="https://staging.zelostech.site/"

REF="${1:-$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)}"
AUTO_APPROVE=""
[ "${2:-}" = "-y" ] && AUTO_APPROVE="-auto-approve"

echo "── Staging for branch: $REF ─────────────────"

# The workflow builds the branch from GitHub, not from this machine.
if ! git -C "$REPO_ROOT" ls-remote --exit-code --heads origin "$REF" >/dev/null 2>&1; then
  echo "ERROR: branch '$REF' is not on GitHub. Run: git push -u origin $REF" >&2
  exit 1
fi
LOCAL_SHA=$(git -C "$REPO_ROOT" rev-parse "$REF" 2>/dev/null || echo "")
REMOTE_SHA=$(git -C "$REPO_ROOT" ls-remote origin "refs/heads/$REF" | cut -f1)
if [ -n "$LOCAL_SHA" ] && [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "WARNING: '$REF' here ($LOCAL_SHA) differs from GitHub ($REMOTE_SHA); staging gets the GitHub one."
fi

# Terraform manages the staging DNS records on Cloudflare. The token only
# lives in this process's environment.
CLOUDFLARE_API_TOKEN=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id dacntt-dev/cloudflare-api-token --query SecretString --output text | tr -d '\r\n')
export CLOUDFLARE_API_TOKEN

# Same sender address as production (not a secret).
EMAIL_USER=$(sed -nE 's/^[[:space:]]*email_user[[:space:]]*=[[:space:]]*"([^"]*)".*/\1/p' \
  "$REPO_ROOT/infrastructure/environments/dev/terraform.tfvars" 2>/dev/null | head -1 || true)

terraform -chdir="$TF_DIR" init -input=false >/dev/null
terraform -chdir="$TF_DIR" apply -input=false $AUTO_APPROVE -var email_user="$EMAIL_USER"

# A secret without a value makes the function fail at start-up.
if ! aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id dacntt-staging/origin-verify-secret --query VersionId --output text >/dev/null 2>&1; then
  echo "ERROR: dacntt-staging/origin-verify-secret has no value yet (see the header of this script)." >&2
  exit 1
fi

if command -v gh >/dev/null 2>&1; then
  echo "  Triggering cd-staging.yml for $REF ..."
  gh workflow run cd-staging.yml --ref "$REF"
  echo "  Follow: gh run watch \$(gh run list --workflow cd-staging.yml --limit 1 --json databaseId -q '.[0].databaseId')"
else
  echo "  No gh CLI: GitHub → Actions → 'CD — Deploy to Staging' → Run workflow on $REF."
fi

echo ""
echo "  Staging: $FRONTEND_URL  (API health: $API_HEALTH_URL)"
