# AI Chatbot - Flood Help LINE Bot

Next.js 16 App Router webhook that answers Thai flood-relief questions using a
service directory CSV and Gemini (`gemini-3.5-flash-lite`). When users share
their LINE location, the bot returns the nearest listed service in each
category.

## Requirements

- Node.js 22 or newer
- A LINE Messaging API channel
- A Gemini API key
- A Google Sheet published as CSV with the columns `Service Name`, `Type`,
  `Province`, `District/Area`, `Address`, `Latitude`, `Longitude`, and
  `Phone Number`

Only put information and coordinates verified by the response team in the
sheet. Latitude and longitude must be decimal degrees. Distances are straight
line estimates, not driving or walking directions. If the sheet or model
cannot provide a reliable answer, the bot returns the emergency fallback.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set all four values:
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `GEMINI_API_KEY`
   - `SHEET_CSV_URL`
3. Start Next.js with `npm run dev`.
4. Expose the local server with an HTTPS tunnel and set its webhook URL to
   `https://<tunnel-host>/api/line-webhook`.

The directory CSV is cached in memory for 60 seconds. A failed refresh uses
the last cached CSV; if no cached data exists, the bot replies with the
emergency fallback without calling Gemini. Ask for the nearest service by
mentioning "ใกล้" or share a LINE location directly. In an urgent message the
bot replies with emergency numbers and asks the user to share their location
if it is safe to do so.

## Deploy to Vercel

Import this repository into Vercel. The included `vercel.json` explicitly
selects the Next.js framework. Add the four environment variables above to the
Production environment, deploy, and set the LINE webhook URL to
`https://<production-url>/api/line-webhook`.

In the LINE Developers Console, verify the webhook, enable **Use webhook**, and
disable the LINE Official Account auto-reply. Test a directory question, share
a LINE location, and send an urgent message. Gemini request logs include finish
reason, token counts, question length, and duration; the full user message and
coordinates are not logged.
