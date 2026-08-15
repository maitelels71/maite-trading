# Cheap serverless stack (recommended)

**You do NOT configure CloudFormation manually in the console.**

`sam deploy` / GitHub Actions creates and updates the CloudFormation stack for you.

## What this stack uses

| Layer | Service | Idle cost |
|-------|---------|-----------|
| API | Lambda + HTTP API | ~$0 |
| Data | DynamoDB on-demand | ~$0 |
| UI Options | S3 + CloudFront + Basic Auth | cents |
| UI Futures | S3 + CloudFront + Basic Auth | cents |
| Secrets | Secrets Manager | ~$0.40/secret |
| SMS alerts | Lambda + EventBridge + SNS | cents when sending |
| NAT / RDS / App Runner | **Not included** | $0 |

One API serves both frontends. Build mode is set with `NEXT_PUBLIC_APP_MODE=options|futures`.

## Deploy

### GitHub Actions (preferred)

1. Repo secrets: `AWS_ROLE_ARN`
2. Optional (recommended): `OPTIONS_BASIC_AUTH_*`, `FUTURES_BASIC_AUTH_*`
   - Defaults if unset: Options `maite` / `maite-options`, Futures `maite` / `maite-futures` — **change these**
3. Actions → **Deploy Cheap (SAM)** → Run workflow → `staging`
4. Job summary shows:
   - `ApiUrl`
   - Options `CloudFrontUrl` (Basic Auth)
   - Futures `FuturesCloudFrontUrl` (Basic Auth)

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
2. SMS alerts (optional): set `SMS_ALERT_PHONE` (+E.164) in that same secret, e.g.
   `python -m scripts.update_sms_secret +1XXXXXXXXXX` from `backend/`
3. Bookmark Options + Futures URLs (browser will prompt for Basic Auth)
4. API health: `{ApiUrl}/health`

### SMS ready-to-enter alerts

`AlertsFunction` runs every 5 minutes:

- **Options:** TOP 5 by confluence (≥2 playbooks same CALL/PUT) and 1 contract fits 10% equity risk
- **Futures:** every ready ML01 hit (no capital filter)
- Dedup in DynamoDB `*-alerts` so the same setup is not re-texted all day

## Expensive stack

`infra/aws/` (App Runner + RDS + NAT) remains in the repo but is **optional / costly**.
Prefer **Deploy Cheap (SAM)** for day-to-day use.
