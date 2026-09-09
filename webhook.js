const { getRawBody, verifyLineSignature } = require('../lib/line-signature');
const { replyToLine, textMessage } = require('../lib/line-client');

// Disable Vercel's automatic body parsing so we can access the raw bytes
// needed for LINE signature verification.
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('Failed to read request body:', err);
    res.status(400).send('Bad Request');
    return;
  }

  const signature = req.headers['x-line-signature'];

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    console.warn('Invalid LINE signature — rejecting request.');
    res.status(401).send('Invalid signature');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('Failed to parse webhook body as JSON:', err);
    res.status(400).send('Bad Request');
    return;
  }

  const events = payload.events || [];

  // LINE's webhook verification (from the console "Verify" button) sends
  // an empty events array. Always return 200 quickly in that case.
  if (events.length === 0) {
    res.status(200).send('OK');
    return;
  }

  // Respond to LINE immediately, then process events.
  // (For step 1, processing is fast enough to do inline before responding,
  // but we keep this structure simple and sequential for now.)
  for (const event of events) {
    try {
      await handleEvent(event, channelAccessToken);
    } catch (err) {
      // Never let one bad event crash the whole webhook response.
      console.error('Error handling event:', err);
    }
  }

  res.status(200).send('OK');
};

async function handleEvent(event, channelAccessToken) {
  // Step 1 scope: only handle text messages, with a static acknowledgment.
  // Location messages and situation-analysis logic come in later steps.
  if (event.type === 'message' && event.message?.type === 'text') {
    const replyToken = event.replyToken;
    const ackText =
      "Got your message. We're setting up this assistant to help with flood emergencies — " +
      'more features (like sharing your location) are coming online soon.';

    await replyToLine(replyToken, textMessage(ackText), channelAccessToken);
    return;
  }

  // All other event types (location, follow, postback, etc.) are ignored
  // for now — intentionally, per the step-by-step build plan.
}
