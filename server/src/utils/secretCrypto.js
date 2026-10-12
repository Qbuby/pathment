const crypto = require('crypto');

/**
 * AES-256-GCM for third-party credentials stored at rest (external app keys).
 * Same scheme and key source as the AI connection keys: AI_ENCRYPTION_KEY,
 * falling back to JWT_SECRET. Payload format: `iv:tag:ciphertext` (hex).
 */
function encKey() {
  const secret = process.env.AI_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('AI_ENCRYPTION_KEY (or JWT_SECRET) is required to store credentials');
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(payload) {
  const [ivHex, tagHex, dataHex] = String(payload).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

const mask = (value) => (!value || value.length < 8 ? '••••' : `${value.slice(0, 4)}••••${value.slice(-4)}`);

module.exports = { encrypt, decrypt, mask };
