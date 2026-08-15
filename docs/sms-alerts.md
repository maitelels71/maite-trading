Server-side poll (Lambda + EventBridge every 5 minutes) that texts setups you can act on — not browser notifications.

**Preferred channel is now Gmail.** See [signal-alerts.md](signal-alerts.md) and [twilio-cancel.md](twilio-cancel.md).

This file is kept for older SMS notes.

## Rules

| Desk | When you get a text |
|------|---------------------|
| Options | TOP 5 by confluence, **≥2** playbooks same CALL or PUT, and mid-OTM premium fits **10% equity** risk (Schwab capital) |
| Futures | Every ready ML01 match (all symbols) |

Quiet hours / filters can be added later. For now: every new fingerprint → one SMS.

Example messages:

```
OPT SPY CALL · E01+E03 · 2 conf · 1ct
FUT MNQ LONG · ML01
```

## Config

In Secrets Manager `maite-trading/<env>/app`:

| Key | Value |
|-----|--------|
| `SMS_ALERT_PHONE` | `+1XXXXXXXXXX` |
| `SMS_ALERTS_ENABLED` | `true` (or `false` to pause) |

AWS account must allow SNS SMS in the region (us-east-1) **or** set Twilio
(`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) in Secrets.
Twilio is preferred when configured (US A2P / no SNS origination required).

Local / one-shot:

```powershell
cd backend
.\.venv\Scripts\python.exe -m scripts.update_twilio_secret `
  --sid ACxxxx --token xxxx --from +1TWILIO --to +1YOURPHONE
```

Legacy phone-only (SNS):

```powershell
.\.venv\Scripts\python.exe -m scripts.update_sms_secret +1XXXXXXXXXX
```

## Ops

- Function: `maite-trading-<env>-alerts`
- Dedup table: `maite-trading-<env>-alerts` (TTL ~3 days)
- Needs live Schwab token in secrets for Options capital + candle sync
