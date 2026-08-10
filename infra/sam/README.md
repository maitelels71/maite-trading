# Cheap serverless stack (recommended)

**You do NOT configure CloudFormation manually in the console.**

`sam deploy` / GitHub Actions creates and updates the CloudFormation stack for you.

## What this stack uses

| Layer | Service | Idle cost |
|-------|---------|-----------|
| API | Lambda + HTTP API | ~$0 |
| Data | DynamoDB on-demand | ~$0 |
| UI Options | S3 + CloudFront (public) | cents |
| UI Futures | S3 + CloudFront + Basic Auth | cents |
| Secrets | Secrets Manager | ~$0.40/secret |
| NAT / RDS / App Runner | **Not included** | $0 |

One API serves both frontends. Build mode is set with `NEXT_PUBLIC_APP_MODE=options|futures`.

## Deploy

### GitHub Actions (preferred)

1. Repo secrets: `AWS_ROLE_ARN`
2. Optional (recommended): `FUTURES_BASIC_AUTH_USER`, `FUTURES_BASIC_AUTH_PASSWORD`
   - Defaults if unset: user `maite` / password `maite-futures` — **change these**
3. Actions → **Deploy Cheap (SAM)** → Run workflow → `staging`
4. Job summary shows:
   - `ApiUrl`
   - Options `CloudFrontUrl` (public)
   - Futures `FuturesCloudFrontUrl` (browser prompts for Basic Auth)

### Local (optional)

```powershell
cd infra/sam
sam build
sam deploy --guided --stack-name maite-trading-cheap-staging --capabilities CAPABILITY_IAM --resolve-s3
```

Then build each frontend:

```powershell
cd frontend
$env:NEXT_PUBLIC_API_BASE_URL="<ApiUrl>"
$env:NEXT_PUBLIC_APP_MODE="options"
npm run build
aws s3 sync out/ s3://<WebBucketName>/ --delete

Remove-Item -Recurse -Force out, .next
$env:NEXT_PUBLIC_APP_MODE="futures"
npm run build
aws s3 sync out/ s3://<FuturesWebBucketName>/ --delete
```

## After deploy

1. Fill Schwab/TradeAdvocate keys in Secrets Manager: `maite-trading/staging/app`
2. Bookmark Options URL (public) and Futures URL (private password)
3. API health: `{ApiUrl}/health`

## Expensive stack

`infra/aws/` (App Runner + RDS + NAT) remains in the repo but is **optional / costly**.
Prefer **Deploy Cheap (SAM)** for day-to-day use.
