#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${1:?stack name required}"
REGION="${2:?region required}"
TEMPLATE_BUCKET="${3:?template bucket required}"
DB_PASSWORD="${4:?db password required}"
PROJECT_NAME="${5:-maite-trading}"
ENVIRONMENT_NAME="${6:-staging}"
API_IMAGE_URI="${7:-}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PACKAGED="$ROOT/packaged.yaml"

echo "Packaging nested templates to s3://$TEMPLATE_BUCKET ..."
aws cloudformation package \
  --template-file template.yaml \
  --s3-bucket "$TEMPLATE_BUCKET" \
  --output-template-file "$PACKAGED" \
  --region "$REGION"

echo "Deploying stack $STACK_NAME ..."
aws cloudformation deploy \
  --template-file "$PACKAGED" \
  --stack-name "$STACK_NAME" \
  --parameter-overrides \
    "ProjectName=$PROJECT_NAME" \
    "EnvironmentName=$ENVIRONMENT_NAME" \
    "DBPassword=$DB_PASSWORD" \
    "ApiImageUri=$API_IMAGE_URI" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION"

echo "Done. Stack outputs:"
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs" \
  --output table
