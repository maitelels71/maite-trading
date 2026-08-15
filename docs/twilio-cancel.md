# How to leave Twilio (after switching to Gmail alerts)

You already paid ~$20 into Twilio. That balance is **credit on Twilio**, not usually a cash refund. You can stop all future charges in a few minutes.

## 1) Release the phone number (stops ~$1–2/month)

1. Open [Phone Numbers → Manage → Active numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
2. Click `+14128716600`
3. Scroll to **Delete this number** / Release → confirm

## 2) Do not finish A2P (avoids the $15 campaign fee)

- Leave Brand in **DRAFT** or delete the draft under Trust Hub → A2P Brands  
- Do **not** click Get started / pay for Campaign vetting

## 3) Turn off auto-recharge

1. Twilio Console → **Billing** / Billing settings  
2. Disable **Auto-recharge**

## 4) Optional cleanup

- Messaging Services: delete empty services if any  
- You can leave the account open with leftover credit, or close it later under Account settings  

## After this

Alerts go by **Gmail** only. App secrets use `ALERT_EMAIL_TO` + `GMAIL_APP_PASSWORD` (see `docs/signal-alerts.md`).
