# Schwab OAuth (local + staging)

## One-time login (local)

1. Confirm callback in Schwab portal: `https://127.0.0.1:8182`
2. Client ID / Secret in root `.env` (and staging Secrets Manager)
3. From `backend/` (OpenSSL is used once for a local HTTPS cert; the script finds Git’s `openssl.exe` if it’s not on PATH):

```powershell
.\.venv\Scripts\python.exe -m scripts.schwab_login
```

4. Browser opens Schwab → log in → Approve  
5. Accept the local self-signed cert warning if Chrome/Edge shows it  
6. Token is written to `.secrets/schwab_token.json` (gitignored)

## Push token to staging (Lambda)

### From Admin tab (preferred)

1. API must have `APP_SECRETS_ARN` (staging Lambda does).
2. Open **Admin** → check countdown / expiry.
3. **Refresh token** if expired or near expiry.
4. **Publish to staging** → writes `SCHWAB_TOKEN_JSON` into Secrets Manager.

CloudFront UI rebuild is **not** required for token publish. Redeploy API only when backend Admin/OAuth code changed.

### From CLI

```powershell
.\.venv\Scripts\python.exe -m scripts.push_schwab_token
```

This merges `SCHWAB_TOKEN_JSON` into Secrets Manager `maite-trading/staging/app`.

Access tokens refresh automatically via `refresh_token` (file locally; Secrets Manager on Lambda when `APP_SECRETS_ARN` is set).

## After login

In the UI: **Analyzer** → Equities/Schwab → **Sync market data** for SPY/QQQ/etc.
