const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';

/**
 * Sends a reply to a LINE user via the Reply API.
 * Uses the replyToken from the incoming webhook event — this only works
 * once per event and must be used within LINE's short time window.
 *
 * @param {string} replyToken
 * @param {Array<object>} messages - array of LINE message objects (max 5)
 * @param {string} channelAccessToken - LINE_CHANNEL_ACCESS_TOKEN
 */
async function replyToLine(replyToken, messages, channelAccessToken) {
  const res = await fetch(LINE_REPLY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    // Log only status + LINE's error body — never log the access token.
    console.error('LINE reply API error:', res.status, errText);
  }

  return res.ok;
}

/**
 * Convenience helper for a single plain text reply.
 */
function textMessage(text) {
  return [{ type: 'text', text }];
}

module.exports = { replyToLine, textMessage };
