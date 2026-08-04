# AWS infrastructure — Maite Trading

CloudFormation (YAML) defines each deployable service. **No Docker Compose.**

## Layout

```text
infra/aws/
  template.yaml              # Root stack (nests the services below)
  nested/
    network.yaml             # VPC, subnets, security groups
    secrets.yaml             # Secrets Manager (Schwab + TradeAdvocate)
    database.yaml            # RDS PostgreSQL
    api.yaml                 # ECR + App Runner (FastAPI)
    frontend.yaml            # Amplify Hosting (Next.js)
  parameters/
    staging.example.json
  scripts/
    package-and-deploy.ps1
    package-and-deploy.sh
```

## Target architecture

| Service | AWS resource |
|---------|----------------|
| Frontend | Amplify Hosting (`WEB_COMPUTE` / Next.js) |
| Backend API | App Runner (container from ECR) |
| Database | RDS PostgreSQL 16 (private subnets) |
| Secrets | Secrets Manager |
| Network | VPC + public/private subnets + NAT |
| Logs | CloudWatch Logs |

> **TimescaleDB note:** Managed RDS PostgreSQL does not include the Timescale extension. v1 uses RDS + time indexes; swap to Timescale Cloud or self-hosted Timescale later without changing app ports.

## Deploy via GitHub Actions (recommended)

See [`GITHUB_ACTIONS.md`](GITHUB_ACTIONS.md).

- Workflow: `.github/workflows/deploy-aws.yml`
- Trigger: push to `main` (backend/infra changes) or **Actions → Deploy AWS → Run workflow**
- Requires GitHub secrets/vars: `AWS_ROLE_ARN`, `DB_PASSWORD`, `CFN_TEMPLATE_BUCKET`

## Manual deploy flow (optional)

CloudFormation nested `TemplateURL` values must be on S3. Package first, then deploy.

### Prerequisites

- AWS CLI v2 configured (`aws configure`)
- An S3 bucket for packaged templates (same region as the stack)
- Docker **only** to build/push the API image to ECR (not Compose)

### 1) First deploy (creates VPC, RDS, ECR, secrets, Amplify app)

```powershell
# PowerShell
cd infra/aws
.\scripts\package-and-deploy.ps1 `
  -StackName maite-trading-staging `
  -Region us-east-1 `
  -TemplateBucket YOUR_CFN_BUCKET `
  -DbPassword "USE_A_LONG_RANDOM_PASSWORD"
```

```bash
# bash
cd infra/aws
./scripts/package-and-deploy.sh \
  maite-trading-staging \
  us-east-1 \
  YOUR_CFN_BUCKET
```

Leave `ApiImageUri` empty on the first pass.

### 2) Build & push API image, then update stack

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1
REPO=$(aws cloudformation describe-stacks \
  --stack-name maite-trading-staging \
  --query "Stacks[0].Outputs[?OutputKey=='EcrRepositoryUri'].OutputValue" \
  --output text)

aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com

docker build -t $REPO:latest ../../backend
docker push $REPO:latest
```

Re-run deploy with parameter `ApiImageUri=$REPO:latest`.

### 3) Fill broker secrets

Update the secret named `maite-trading/<env>/app` in Secrets Manager with Schwab + TradeAdvocate values.

## Local development (no Compose)

Run API and frontend on your machine; point `DATABASE_URL` at RDS (via VPN/SSM port-forward) or a local Postgres install:

```bash
# backend
cd backend && uvicorn app.main:app --reload --port 8000

# frontend
cd frontend && npm run dev
```

## Parameters

See `parameters/staging.example.json`. Never commit real passwords or tokens.
