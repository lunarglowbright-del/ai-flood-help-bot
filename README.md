# AI Chatbot - Flood Help LINE Bot

Next.js 16 App Router webhook that answers Thai flood-relief questions using a
verified FAQ CSV and Gemini (`gemini-3.5-flash`).

## Requirements

- Node.js 22 or newer
- A LINE Messaging API channel
- A Gemini API key
- A Google Sheet published as CSV with the columns `category`, `question`,
  `answer`, and `updated_at`

Only put information verified by the response team in the FAQ sheet. The bot
does not invent answers; when the sheet or model cannot provide a reliable
answer, it returns the fixed emergency fallback.

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

The FAQ CSV is cached in memory for 60 seconds. A failed refresh uses the last
cached CSV; if no cached FAQ exists, the bot replies with the emergency
fallback without calling Gemini.

## Deploy to Vercel

Import this repository into Vercel. The included `vercel.json` explicitly
selects the Next.js framework. Add the four environment variables above to the
Production environment, deploy, and set the LINE webhook URL to
`https://<production-url>/api/line-webhook`.

In the LINE Developers Console, verify the webhook, enable **Use webhook**, and
disable the LINE Official Account auto-reply. Test a known FAQ question, an
unknown question, and a non-text event. Gemini request logs include finish
reason, token counts, question length, and duration; the full user message is
not logged.
