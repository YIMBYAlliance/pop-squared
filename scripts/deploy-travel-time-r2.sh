#!/usr/bin/env bash
set -euo pipefail

# Uploads precomputed travel-time JSON files to a Cloudflare R2 bucket.
# Also generates and uploads a manifest.json listing all computed origins.
#
# Usage:
#   bash scripts/deploy-travel-time-r2.sh          # incremental sync (default)
#   bash scripts/deploy-travel-time-r2.sh --force   # re-upload all files
#
# Prerequisites: same as deploy-r2.sh (AWS CLI + R2 credentials in .env.local)
#
# After uploading, set TRAVEL_TIME_URL in your hosting env vars:
#   TRAVEL_TIME_URL=https://<subdomain>.r2.dev/travel-time

FORCE=false
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$PROJECT_DIR/data/travel-time"
BUCKET_NAME="${R2_BUCKET:-pop-squared-data}"
R2_PREFIX="travel-time"

echo "=== deploy-travel-time-r2.sh ==="
echo "Data dir: $DATA_DIR"
echo "Bucket:   $BUCKET_NAME"
echo "Prefix:   $R2_PREFIX"
if [ "$FORCE" = true ]; then
  echo "Mode:     force (re-upload all files)"
else
  echo "Mode:     sync (only new/changed files)"
fi
echo ""

# Load credentials from .env.local if present
ENV_FILE="$PROJECT_DIR/.env.local"
if [ -f "$ENV_FILE" ]; then
  echo "Loading R2 credentials from $ENV_FILE"
  while IFS='=' read -r key value; do
    case "$key" in
      R2_*) export "$key=$value" ;;
    esac
  done < "$ENV_FILE"
fi

if [ ! -d "$DATA_DIR" ]; then
  echo "Error: $DATA_DIR not found. Compute some origins first."
  exit 1
fi

JSON_FILES=("$DATA_DIR"/*.json)
if [ ${#JSON_FILES[@]} -eq 0 ]; then
  echo "Error: No JSON files found in $DATA_DIR"
  exit 1
fi

if [ -z "${R2_ACCOUNT_ID:-}" ] || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_KEY:-}" ]; then
  echo "Missing R2 credentials. Add these to .env.local:"
  echo "  R2_ACCOUNT_ID=<your cloudflare account id>"
  echo "  R2_ACCESS_KEY_ID=<from R2 API token>"
  echo "  R2_SECRET_KEY=<from R2 API token>"
  exit 1
fi

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Generate manifest.json (cellCount + transitNearPct per origin) via Node script
echo "Generating manifest.json..."
node "$SCRIPT_DIR/build-manifest.mjs"
MANIFEST_FILE="$DATA_DIR/manifest.json"
echo ""

# Upload files
if [ "$FORCE" = true ]; then
  # Force mode: upload every file individually
  FILE_COUNT=$((${#JSON_FILES[@]} + 1))  # +1 for manifest
  echo "Uploading all $FILE_COUNT files to R2..."
  echo ""

  UPLOADED=0
  for f in "${JSON_FILES[@]}" "$MANIFEST_FILE"; do
    BASENAME="$(basename "$f")"
    UPLOADED=$((UPLOADED + 1))
    echo "[$UPLOADED/$FILE_COUNT] $BASENAME"
    AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
    aws s3 cp "$f" "s3://$BUCKET_NAME/$R2_PREFIX/$BASENAME" \
      --endpoint-url "$ENDPOINT" \
      --content-type "application/json" \
      --quiet
  done

  echo ""
  echo "Upload complete! $UPLOADED files uploaded."
else
  # Sync mode: only upload new/changed files (excludes manifest, uploaded separately)
  echo "Syncing origin files to R2 (only new/changed)..."
  echo ""

  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
  aws s3 sync "$DATA_DIR" "s3://$BUCKET_NAME/$R2_PREFIX/" \
    --endpoint-url "$ENDPOINT" \
    --content-type "application/json" \
    --exclude "*" --include "*.json" --exclude "manifest.json"

  # Always upload manifest (it changes whenever origins are added)
  echo ""
  echo "Uploading manifest.json..."
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
  aws s3 cp "$MANIFEST_FILE" "s3://$BUCKET_NAME/$R2_PREFIX/manifest.json" \
    --endpoint-url "$ENDPOINT" \
    --content-type "application/json" \
    --quiet

  echo ""
  echo "Sync complete!"
fi

echo ""
echo "Next steps:"
echo "  1. Ensure public access is enabled on the R2 bucket"
echo "  2. Set TRAVEL_TIME_URL in your hosting env vars:"
echo "     TRAVEL_TIME_URL=https://<subdomain>.r2.dev/$R2_PREFIX"
