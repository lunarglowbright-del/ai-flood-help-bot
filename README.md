# Flood Emergency LINE Bot

Step-by-step build. **Current stage: Step 1 — LINE webhook + signature verification + text echo.**

Not yet implemented (coming in later steps, in this order):
location messages → Google Sheets lookup → Gemini analysis → combined emergency
response → full deployment/testing pass.

## What's in this step

```
/api/webhook.js        LINE webhook endpoint (POST /api/webhook)
/lib/line-signature.js Raw body reader + HMAC signature verification
/lib/line-client.js    Minimal LINE Reply API client
```

No external dependencies — uses Node's built-in `crypto` and global `fetch`
(available in Vercel's Node 18+ runtime).

## Environment variables (already set in Vercel per your setup)

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `SHEET_CSV_URL` (not used yet — later step)
- `GEMINI_API_KEY` (not used yet — later step)

Nothing in this codebase logs or prints these values.

## How signature verification works

LINE signs the **raw** request body with `LINE_CHANNEL_SECRET` and sends the
result in the `x-line-signature` header. To verify it, the backend must see
the exact original bytes — so `bodyParser` is disabled for this function and
the raw body is read manually before any JSON parsing happens.

Requests with a missing or invalid signature get a `401` and are not
processed further.

## Deploying

1. Push this repo to GitHub.
2. Import it into Vercel (or push to an already-linked project).
3. Confirm the four environment variables are set for the Production (and
   Preview, if you test there) environment in Vercel's project settings.
4. Deploy.
5. In the LINE Developers Console, set the webhook URL to:
   `https://<your-vercel-domain>/api/webhook`
6. Click **Verify** in the LINE console — it should succeed (this sends an
   empty `events` array, which the handler responds to with `200 OK`).
7. Turn on **Use webhook**.

## Testing step 1

1. Add the LINE Official Account as a friend (or open an existing chat with it).
2. Send any plain text message.
3. You should receive the fixed acknowledgment reply.
4. Check Vercel's function logs to confirm no errors and no secrets are logged.

At this point, **do not** send a location message expecting a smart
response yet — location handling is the next step and currently does
nothing.

## Next steps (in order, one at a time)

1. Handle LINE **location messages** and associate them with the sending
   user's ongoing conversation.
2. Collect the victim's reported situation across messages (people count,
   water level, rising/not, injuries, children/elderly, etc.) and store it
   per-user for the duration of the conversation.
3. Read and parse `SHEET_CSV_URL`, and implement nearest-service lookup by
   lat/lng.
4. Wire up the Gemini API call using the stored situation + nearby services,
   under the safety rules already defined for this project (no evacuation
   routes, no claims of real-time flood data, stay-in-place / move-higher
   guidance only, no invented emergency contacts).
5. Combine everything into the final LINE reply.
6. End-to-end testing on a real Vercel deployment via the LINE app.
