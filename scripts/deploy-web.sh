#!/usr/bin/env bash
# Builds web/ and publishes it to the hosting of one environment (infra/modules/web).
#   assets/*  hashed names: cached for a year, uploaded first so the new index.html never
#             points at files that are not there yet
#   the rest  revalidated by browsers; CloudFront keeps them at most 5 minutes and the
#             invalidation below refreshes them now
# Usage: scripts/deploy-web.sh [staging]
set -euo pipefail
export MSYS_NO_PATHCONV=1

ENVIRONMENT="${1:-staging}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TF_DIR="$ROOT/infra/envs/$ENVIRONMENT"

out() { terraform -chdir="$TF_DIR" output -raw "$1"; }
BUCKET="$(out web_bucket)"
DISTRIBUTION="$(out web_distribution_id)"
API_URL="https://api-v2-$ENVIRONMENT.zelostech.site"

echo "Building web for $API_URL"
(cd "$ROOT" && VITE_API_BASE_URL="$API_URL" npm run build -w @zelos/web)

DIST="$ROOT/web/dist"
# Old hashed files are kept, so tabs opened before the deploy keep loading their chunks.
# Source maps stay local.
aws s3 sync "$DIST/assets" "s3://$BUCKET/assets" --exclude "*.map" \
  --cache-control "public, max-age=31536000, immutable"
aws s3 sync "$DIST" "s3://$BUCKET" --exclude "assets/*" --exclude "*.map" \
  --cache-control "public, max-age=0, must-revalidate"

aws cloudfront create-invalidation --profile dacntt-a \
  --distribution-id "$DISTRIBUTION" --paths "/*" --query 'Invalidation.Id' --output text
echo "Published to $(out web_url)"
