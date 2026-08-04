#!/usr/bin/env bash
# Package nested CloudFormation templates to S3 and deploy the root stack.
# Usage:
#   ./scripts/package-and-deploy.sh <s3-bucket> <stack-name> [params-json] [region]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUCKET="${1:?S3 bucket required}"
STACK_NAME="${2:?Stack name required}"
PARAMS_FILE="${3:-${ROOT_DIR}/parameters/staging.example.json}"
REGION="${4:-${AWS_DEFAULT_REGION:-us-east-1}}"
PACKAGED="${ROOT_DIR}/packaged.yaml"

echo "Packaging templates to s3://${BUCKET} ..."
aws cloudformation package \
  --template-file "${ROOT_DIR}/template.yaml" \
  --s3-bucket "${BUCKET}" \
  --output-template-file "${PACKAGED}" \
  --region "${REGION}"

echo "Deploying stack ${STACK_NAME} ..."
aws cloudformation deploy \
  --template-file "${PACKAGED}" \
  --stack-name "${STACK_NAME}" \
  --parameter-overrides "file://${PARAMS_FILE}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "${REGION}"

echo "Done. Stack outputs:"
aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --query "Stacks[0].Outputs" \
  --output table
