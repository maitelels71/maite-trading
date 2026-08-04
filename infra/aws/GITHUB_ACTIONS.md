# GitHub Actions → AWS deploy (OIDC)

The **recommended** deploy workflow is:

[`.github/workflows/deploy-cheap.yml`](../../.github/workflows/deploy-cheap.yml) — **Deploy Cheap (SAM)**

That stack uses Lambda + DynamoDB + S3/CloudFront (no NAT / RDS / App Runner).

See [`../sam/README.md`](../sam/README.md).

## One-time IAM setup (OIDC)

Still required so GitHub can assume the AWS role. Files live in [`iam/`](iam/).

### Variables (repo)

| Variable | Example |
|----------|---------|
| `AWS_REGION` | `us-east-1` |
| `PROJECT_NAME` | `maite-trading` |

### Secrets (repo)

| Secret | Purpose |
|--------|---------|
| `AWS_ROLE_ARN` | `arn:aws:iam::289981265319:role/maite-trading-github-actions` |

`DB_PASSWORD` is **not** required for the cheap SAM stack.

## Run deploy

Actions → **Deploy Cheap (SAM)** → Run workflow → `staging`

## Legacy expensive templates

`infra/aws/template.yaml` (App Runner + RDS + NAT) remains only as reference.  
There is **no** GitHub workflow for it anymore.
