# AWS IAM setup for GitHub Actions (account 289981265319)

Repo: `maitelels71/maite-trading`  
Region default: `us-east-1`  
Template bucket: `maite-trading-cfn-289981265319`

## Option A — AWS CLI (fastest)

From a shell where `aws sts get-caller-identity` works as user `maite`:

```powershell
cd infra/aws/iam
.\bootstrap-github-oidc.ps1
```

Or bash:

```bash
cd infra/aws/iam
chmod +x bootstrap-github-oidc.sh
./bootstrap-github-oidc.sh
```

The script:

1. Creates the GitHub OIDC provider (if missing)  
2. Creates role `maite-trading-github-actions`  
3. Attaches the deploy policy  
4. Prints the role ARN for GitHub Secrets  

## Option B — AWS Console (step by step)

### 1) OIDC identity provider

1. IAM → **Identity providers** → **Add provider**  
2. Provider type: **OpenID Connect**  
3. Provider URL: `https://token.actions.githubusercontent.com`  
4. Click **Get thumbprint**  
5. Audience: `sts.amazonaws.com`  
6. Add provider  

### 2) Permission policy

1. IAM → **Policies** → **Create policy** → JSON  
2. Paste contents of `github-actions-deploy-policy.json`  
3. Name: `MaiteTradingGitHubActionsDeploy`  
4. Create  

### 3) Role

1. IAM → **Roles** → **Create role**  
2. Trusted entity: **Web identity**  
3. Identity provider: `token.actions.githubusercontent.com`  
4. Audience: `sts.amazonaws.com`  
5. Add condition (or edit trust after create) so `sub` is like:
   `repo:maitelels71/maite-trading:*`  
6. Attach policy `MaiteTradingGitHubActionsDeploy`  
7. Role name: `maite-trading-github-actions`  
8. Create  

Trust JSON reference: `github-oidc-trust-policy.json`

### 4) GitHub configuration

Repo → **Settings** → **Secrets and variables** → **Actions**

#### Variables

| Name | Value |
|------|-------|
| `AWS_REGION` | `us-east-1` |
| `PROJECT_NAME` | `maite-trading` |
| `CFN_TEMPLATE_BUCKET` | `maite-trading-cfn-289981265319` |
| `FRONTEND_REPOSITORY` | `https://github.com/maitelels71/maite-trading` |
| `FRONTEND_BRANCH` | `main` |

Leave `AWS_AUTH_MODE` empty (OIDC).

#### Secrets

| Name | Value |
|------|-------|
| `AWS_ROLE_ARN` | `arn:aws:iam::289981265319:role/maite-trading-github-actions` |

Put `AWS_ROLE_ARN` on **both**:
1. Repo → Settings → Secrets and variables → Actions → **Repository secrets**
2. Environments → **staging** (and **production** if used) → Environment secrets

The Deploy Cheap workflow uses `environment: staging` on push, so environment secrets are required if you only store them there.

`DB_PASSWORD` is **not** required for the cheap SAM stack.

### 5) First deploy

1. Push workflows to `main`
2. GitHub → **Actions** → **Deploy Cheap (SAM)** → **Run workflow** → `staging`

## Verify OIDC locally (optional)

```powershell
aws iam list-open-id-connect-providers
aws iam get-role --role-name maite-trading-github-actions
```

## Security note

The deploy policy is intentionally broad for first bring-up (CloudFormation creates many resources). After the stack is stable, tighten resources/actions.
