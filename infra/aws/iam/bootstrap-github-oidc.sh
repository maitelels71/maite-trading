#!/usr/bin/env bash
set -euo pipefail

ACCOUNT_ID="${1:-289981265319}"
ROLE_NAME="${2:-maite-trading-github-actions}"
POLICY_NAME="${3:-MaiteTradingGitHubActionsDeploy}"
REGION="${4:-us-east-1}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

echo "Caller identity:"
aws sts get-caller-identity

OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
EXISTING="$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?Arn=='${OIDC_ARN}'].Arn" --output text || true)"

if [[ -z "${EXISTING}" || "${EXISTING}" == "None" ]]; then
  echo "Creating GitHub OIDC provider..."
  aws iam create-open-id-connect-provider \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "ffffffffffffffffffffffffffffffffffffffff" \
    --tags Key=Project,Value=maite-trading
else
  echo "OIDC provider already exists: ${OIDC_ARN}"
fi

if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  echo "Updating trust policy on existing role..."
  aws iam update-assume-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-document file://github-oidc-trust-policy.json
else
  echo "Creating role ${ROLE_NAME}..."
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document file://github-oidc-trust-policy.json \
    --description "GitHub Actions deploy role for maite-trading" \
    --tags Key=Project,Value=maite-trading
fi

echo "Putting inline deploy policy ${POLICY_NAME}..."
aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name "${POLICY_NAME}" \
  --policy-document file://github-actions-deploy-policy.json

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo
echo "DONE. Add this GitHub Actions secret:"
echo "  AWS_ROLE_ARN = ${ROLE_ARN}"
echo
echo "Also set variables:"
echo "  AWS_REGION = ${REGION}"
echo "  PROJECT_NAME = maite-trading"
echo "  CFN_TEMPLATE_BUCKET = maite-trading-cfn-${ACCOUNT_ID}"
echo "  FRONTEND_REPOSITORY = https://github.com/maitelels71/maite-trading"
echo "  FRONTEND_BRANCH = main"
echo
echo "Secret DB_PASSWORD = (choose a 16+ character password)"
