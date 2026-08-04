# AWS Infrastructure (CloudFormation)

AWS-native deployment for Maite Trading Strategy Analyzer. **No Docker Compose.**

## Layout

```
infra/aws/
  template.yaml              # Root nested stack
  nested/
    network.yaml             # VPC, subnets, security groups
    secrets.yaml             # Secrets Manager (DB + app/provider secrets)
    database.yaml            # RDS PostgreSQL
    api.yaml                 # ECR + App Runner
    frontend.yaml            # Amplify Hosting (Next.js)
  parameters/
    staging.example.json
  scripts/
    package-and-deploy.sh
    package-and-deploy.ps1
```

## Deploy

1. Create an S3 bucket for packaged templates.
2. Copy `parameters/staging.example.json` and set a strong `DbPassword`.
3. Build & push the API image to the ECR repo created by the stack (chicken/egg: deploy once with a placeholder image, or create ECR first).
4. Package and deploy:

```bash
cd infra/aws
chmod +x scripts/package-and-deploy.sh
./scripts/package-and-deploy.sh my-cfn-bucket maite-staging parameters/staging.example.json us-east-1
```

## After deploy

```bash
export DATABASE_URL=postgresql+psycopg2://maite:...@<rds-endpoint>:5432/maite
cd backend
python scripts/db_cli.py migrate-and-seed
```

Update the `maite/<env>/app` secret with Schwab / TradeAdvocate credentials and set `USE_MOCK_PROVIDERS=false` when ready.

## Notes

- App Runner serves the FastAPI container from ECR.
- Amplify builds the `frontend/` Next.js app; set `NEXT_PUBLIC_API_BASE_URL` to the App Runner URL (wired by the stack).
- Amplify may require a GitHub personal access token / connection in the console for private repos.
- RDS is private; connect via VPN/bastion or App Runner VPC connector (extend network stack as needed for production).
