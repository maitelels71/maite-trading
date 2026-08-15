# Signal alerts (email preferred)

Server-side poll (Lambda + EventBridge every 5 minutes). Prefer **Gmail**; SMS is optional fallback.

## Rules

| Desk | When you get notified |
|------|------------------------|
| Options | TOP 5 by confluence, **≥2** playbooks same CALL or PUT, and mid-OTM premium fits **10% equity** risk |
| Futures | Every ready ML01 match |

Example subject/body:

```
Maite alert · OPT SPY CALL · E01+E03 · 2 conf · 1ct
```

## Config (Secrets Manager `maite-trading/<env>/app`)

| Key | Value |
|-----|--------|
| `ALERT_EMAIL_TO` | `maitelels@gmail.com` |
| `ALERT_EMAIL_FROM` | same (or leave blank → uses GMAIL_USER) |
| `GMAIL_USER` | `maitelels@gmail.com` |
| `GMAIL_APP_PASSWORD` | Google App Password (16 chars) |
| `SMS_ALERTS_ENABLED` | `true` |
| `SMS_ALERT_PHONE` | leave empty to disable SMS |

One-shot:

```powershell
cd backend
.\.venv\Scripts\python.exe -m scripts.update_gmail_secret `
  --to maitelels@gmail.com `
  --app-password "xxxx xxxx xxxx xxxx"
```

## Create a Gmail App Password

1. Google Account → **Security** → turn on **2-Step Verification**
2. **App passwords** → Mail → generate
3. Copy the 16-character password (spaces optional)

## Leave Twilio (no more SMS fees)

1. [Twilio Console → Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming) → open `+14128716600` → **Delete** / Release number  
2. Do **not** submit A2P Campaign (skip the $15)  
3. Billing → ensure **auto-recharge is OFF**  
4. Optional: Account → close later; leftover balance stays as Twilio credit (rarely refunded as cash)

## Ops

- Function: `maite-trading-<env>-alerts`
- Dedup table: `maite-trading-<env>-alerts`
- Needs live Schwab token for Options capital + candle sync
