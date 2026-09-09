const crypto = require('crypto');

/**
 * Reads the raw request body as a Buffer.
 * Required because LINE's signature is computed over the exact raw bytes
 * of the request body — parsing it as JSON first (and re-serializing)
 * would produce a different byte sequence and break verification.
 */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Verifies the LINE webhook signature.
 * LINE signs the raw body with HMAC-SHA256 using the channel secret,
 * base64-encodes it, and sends it in the `x-line-signature` header.
 *
 * @param {Buffer} rawBody - the raw request body bytes
 * @param {string} signatureHeader - value of the `x-line-signature` header
 * @param {string} channelSecret - LINE_CHANNEL_SECRET
 * @returns {boolean}
 */
function verifyLineSignature(rawBody, signatureHeader, channelSecret) {
  if (!signatureHeader || !channelSecret) return false;

  const expected = crypto
    .createHmac('sha256', channelSecret)
    .update(rawBody)
    .digest('base64');

  // Use timing-safe comparison to avoid leaking info via response timing.
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signatureHeader);

  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { getRawBody, verifyLineSignature };
