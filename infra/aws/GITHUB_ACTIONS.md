# GitHub Actions → AWS deploy

Deploy is automated by [`.github/workflows/deploy-aws.yml`](../../.github/workflows/deploy-aws.yml).

CI (tests/build) runs on every PR via [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

## What the deploy workflow does

1. Assumes an AWS role (OIDC recommended) or access keys  
2. Ensures the CloudFormation template S3 bucket exists  
3. `cloudformation package` + `deploy` for `infra/aws/template.yaml`  
4. Builds `backend/Dockerfile` and pushes to ECR  
5. Updates the stack with `ApiImageUri` so App Runner pulls the new image  

Amplify deploys the frontend when the repo is linked (stack parameter `FrontendRepository`).

## One-time setup

### 1. GitHub Environments

Create environments: **staging** (and later **production**).

### 2. Variables (repo or environment)

| Variable | Example | Purpose |
|----------|---------|---------|
| `AWS_REGION` | `us-east-1` | Deploy region |
| `PROJECT_NAME` | `maite-trading` | Stack/resource prefix |
| `CFN_TEMPLATE_BUCKET` | `maite-trading-cfn-123456789012` | S3 bucket for packaged templates (globally unique) |
| `AWS_AUTH_MODE` | _(empty)_ or `access-keys` | Default = OIDC via `AWS_ROLE_ARN` |
| `FRONTEND_REPOSITORY` | `https://github.com/YOU/maite-trading` | Optional Amplify repo URL |
| `FRONTEND_BRANCH` | `main` | Amplify branch |

### 3. Secrets (environment)

| Secret | Purpose |
|--------|---------|
| `AWS_ROLE_ARN` | IAM role for GitHub OIDC (recommended) |
| `DB_PASSWORD` | RDS master password (16+ chars) |
| `GITHUB_TOKEN_SECRET_ARN` | Optional Secrets Manager ARN with GitHub PAT for Amplify |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Only if `AWS_AUTH_MODE=access-keys` |

### 4. IAM role for GitHub OIDC (recommended)

In AWS IAM → Identity providers → add **GitHub** OIDC provider if missing:

- URL: `https://token.actions.githubusercontent.com`  
- Audience: `sts.amazonaws.com`

Trust policy example (replace `ACCOUNT`, `ORG`, `REPO`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:ORG/REPO:*"
        }
      }
    }
  ]
}
```

Attach permissions broad enough for first bring-up (CloudFormation, S3, ECR, EC2/VPC, RDS, App Runner, Amplify, IAM, Secrets Manager, Logs). Tighten later.

Put the role ARN in GitHub secret `AWS_ROLE_ARN`.

## Run a deploy

- **Automatic:** push to `main` when `backend/**` or `infra/aws/**` changes  
- **Manual:** Actions → **Deploy AWS** → Run workflow → choose `staging`

## After first successful deploy

1. Open stack outputs (`ApiServiceUrl`, `AmplifyDefaultDomain`, `AppSecretsArn`)  
2. Fill Schwab / TradeAdvocate values in Secrets Manager (`maite-trading/staging/app`)  
3. Run DB migrate against RDS (SSM port-forward or one-off task):

```bash
alembic upgrade head
python -m scripts.db_cli seed
```

## Local scripts still work

`infra/aws/scripts/package-and-deploy.*` remain for manual deploys without GitHub.
