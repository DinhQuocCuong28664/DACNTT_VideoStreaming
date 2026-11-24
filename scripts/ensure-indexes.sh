#!/usr/bin/env bash
# Creates the MongoDB and Atlas Search indexes of one environment by invoking its API function
# directly (api/src/maintenance.ts). Run after every terraform apply that ships API code; cold
# starts no longer create indexes. Needs lambda:InvokeFunction (the CLI user of account B).
# Usage: scripts/ensure-indexes.sh [staging|prod]
set -euo pipefail
export MSYS_NO_PATHCONV=1

ENVIRONMENT="${1:-staging}"
case "$ENVIRONMENT" in
  staging|prod) ;;
  *) echo "Unknown environment: $ENVIRONMENT" >&2; exit 1 ;;
esac

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT
# aws is a Windows program in Git Bash: give it the Windows form of the path.
OUT_NATIVE="$(cygpath -w "$OUT" 2>/dev/null || echo "$OUT")"
STATUS=$(aws lambda invoke --function-name "zelos-$ENVIRONMENT-api" \
  --cli-binary-format raw-in-base64-out --payload '{"action":"ensure-indexes"}' \
  --query FunctionError --output text "$OUT_NATIVE")
cat "$OUT"; echo
if [ "$STATUS" != "None" ]; then
  echo "Index setup failed ($STATUS)" >&2
  exit 1
fi
