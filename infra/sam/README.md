# Cheap serverless stack (recommended)

**You do NOT configure CloudFormation manually in the console.**

`sam deploy` / GitHub Actions creates and updates the CloudFormation stack for you
(same model as [OceanView-API](https://github.com/mlsloynaz/OceanView-API)).

## What this stack uses

| Layer | Service | Idle cost |
|-------|---------|-----------|
| API | Lambda + HTTP API | ~$0 |
| Data | DynamoDB on-demand | ~$0 |
| UI | S3 + CloudFront | cents |
| Secrets | Secrets Manager | ~$0.40/secret |
| NAT / RDS / App Runner | **Not included** | $0 |

## Deploy

### GitHub Actions (preferred)

1. Repo secrets already set: `AWS_ROLE_ARN`  
2. Actions → **Deploy Cheap (SAM)** → Run workflow → `staging`  
3. Read the job summary for `ApiUrl` and `CloudFrontUrl`

### Local (optional)

```powershell
# Install SAM CLI once: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
cd infra/sam
sam build
sam deploy --guided --stack-name maite-trading-cheap-staging --capabilities CAPABILITY_IAM --resolve-s3
```

## After deploy

1. Fill Schwab/TradeAdvocate keys in Secrets Manager: `maite-trading/staging/app`  
2. Open CloudFront URL for the UI  
3. API health: `{ApiUrl}/health`

## Expensive stack

`infra/aws/` (App Runner + RDS + NAT) remains in the repo but is **optional / costly**.  
Prefer **Deploy Cheap (SAM)** for day-to-day use.
