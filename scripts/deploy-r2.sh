#!/usr/bin/env bash
set -euo pipefail

# Uploads the GeoTIFF to a Cloudflare R2 bucket via the S3 API.
# Wrangler has a 300MB limit, so we use the AWS CLI with R2's S3 endpoint.
#
# Prerequisites:
#   1. Install AWS CLI: brew install awscli (or pip install awscli)
#   2. Create an R2 bucket (via dashboard or: wrangler r2 bucket create pop-squared-data)
#   3. Create an R2 API token in Cloudflare dashboard:
#      R2 > Manage R2 API Tokens > Create API token
#      - Permissions: Object Read & Write
#      - Scope: Apply to specific bucket > pop-squared-data
#      - Copy the Access Key ID and Secret Access Key
#   4. Enable public access on the bucket:
#      R2 > pop-squared-data > Settings > Public access > Enable r2.dev subdomain
#
# Credentials are read from .env.local (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_KEY).
# You can also set them as environment variables to override.
#
# After uploading, set GEOTIFF_URL in your hosting env vars to the public URL.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$PROJECT_DIR/data"
BUCKET_NAME="${R2_BUCKET:-pop-squared-data}"

# Pick which raster to upload based on first arg:
#   ./deploy-r2.sh        → GHS global raster (default)
#   ./deploy-r2.sh ghs    → GHS global raster
#   ./deploy-r2.sh uk     → UK (E&W + Scotland) ONS raster
TARGET="${1:-ghs}"
case "$TARGET" in
  ghs)
    TIF_FILE="GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif"
    ENV_VAR="GEOTIFF_URL"
    ;;
  uk)
    TIF_FILE="uk-pop-100m-4326.tif"
    ENV_VAR="GEOTIFF_UK_URL"
    ;;
  *)
    echo "Error: unknown target '$TARGET'. Use 'ghs' or 'uk'."
    exit 1
    ;;
esac

echo "=== deploy-r2.sh ($TARGET) ==="
echo "Script dir:  $SCRIPT_DIR"
echo "Project dir: $PROJECT_DIR"
echo "Data dir:    $DATA_DIR"
echo "Bucket:      $BUCKET_NAME"
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

if [ ! -f "$DATA_DIR/$TIF_FILE" ]; then
  if [ "$TARGET" = "uk" ]; then
    echo "Error: $TIF_FILE not found in data/. Run 'uv run scripts/build-uk-raster.py' first."
  else
    echo "Error: $TIF_FILE not found in data/. Run scripts/download-data.sh first."
  fi
  exit 1
fi

if [ -z "${R2_ACCOUNT_ID:-}" ] || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_KEY:-}" ]; then
  echo "Missing R2 credentials. Add these to .env.local:"
  echo ""
  echo "  R2_ACCOUNT_ID=<your cloudflare account id>"
  echo "  R2_ACCESS_KEY_ID=<from R2 API token>"
  echo "  R2_SECRET_KEY=<from R2 API token>"
  echo ""
  echo "Create an R2 API token at: Cloudflare Dashboard > R2 > Manage R2 API Tokens"
  exit 1
fi

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
SIZE_MB=$(du -m "$DATA_DIR/$TIF_FILE" | awk '{print $1}')

echo "Uploading $TIF_FILE (~${SIZE_MB}MB) to R2 bucket '$BUCKET_NAME'..."
echo "Endpoint: $ENDPOINT"
echo ""

AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
aws s3 cp "$DATA_DIR/$TIF_FILE" "s3://$BUCKET_NAME/$TIF_FILE" \
  --endpoint-url "$ENDPOINT" \
  --content-type "image/tiff"

echo ""
echo "Upload complete!"
echo ""
echo "Next steps:"
echo "  1. Ensure public access is enabled on the bucket in the Cloudflare dashboard"
echo "     R2 > $BUCKET_NAME > Settings > Public access > Enable r2.dev subdomain"
echo "  2. Set the $ENV_VAR environment variable in your hosting platform:"
echo "     $ENV_VAR=https://<your-subdomain>.r2.dev/$TIF_FILE"
echo "  3. Deploy your app (e.g. to Vercel, Fly.io, etc.)"
