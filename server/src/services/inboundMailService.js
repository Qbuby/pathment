const emailService = require('./emailService');
const logger = require('../utils/logger');

/**
 * Mail sent TO us, forwarded to somewhere a person actually reads.
 *
 * Resend receives mail for the domain and posts an `email.received` webhook.
 * That is a transport, not a mailbox: on its own the message lands in a
 * dashboard tab and nobody finds out. This is the missing half — it collects
 * the message and re-sends it to one address, so `hello@` and `support@`
 * behave like real addresses without hosting a mailbox for them.
 *
 * Two things the webhook deliberately does not carry: the BODY and the
 * ATTACHMENTS. Only metadata arrives, so the content is fetched with a second
 * call before anything can be forwarded.
 *
 * Reply-To is set to whoever wrote in, which is what makes this useful rather
 * than merely informative: hitting reply in your own client answers them, from
 * the address they wrote to.
 */

const RECEIVING_ENDPOINT = 'https://api.resend.com/emails/receiving';

/** Where forwarded mail goes. Unset means the feature is off. */
function destination() {
  return (process.env.INBOUND_FORWARD_TO || '').trim() || null;
}

function domainOf(address) {
  return String(address || '').split('@')[1]?.toLowerCase() || '';
}

const escapeHtml = (value) => String(value ?? '').replace(/[<>&"]/g, (c) => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]
));

/**
 * The full message behind a received-email id.
 *
 * Returns null rather than throwing: a forward that cannot be built must not
 * fail the webhook, because Resend would then retry it and we would forward
 * the same message several times.
 */
async function fetchReceived(emailId) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !emailId) return null;
  try {
    const response = await fetch(`${RECEIVING_ENDPOINT}/${encodeURIComponent(emailId)}`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      logger.warn(`[inbound] could not read received email ${emailId}: ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    logger.warn(`[inbound] could not read received email ${emailId}: ${error.message}`);
    return null;
  }
}

/**
 * Who it was addressed to, for the subject tag.
 *
 * One mailbox stands in for several addresses, so "which of mine did they
 * write to" is the first thing you need and the last thing a plain forward
 * tells you.
 */
function addressedTo(data, full) {
  const candidates = [
    ...(Array.isArray(data?.to) ? data.to : []),
    ...(Array.isArray(data?.received_for) ? data.received_for : []),
  ];
  return candidates.find(Boolean) || full?.headers?.to || 'us';
}

/** A short note above the original message saying where it came from. */
function banner({ from, to, subject, attachments, rawUrl }) {
  const rows = [
    ['From', from],
    ['To', to],
    ['Subject', subject],
  ].map(([label, value]) => `<tr><th align="left" style="padding:2px 10px 2px 0;color:#64748b;font-weight:500">${label}</th><td>${escapeHtml(value)}</td></tr>`).join('');

  // Attachments are listed rather than re-sent. The signed link Resend gives
  // us is the original message with everything in it, which is both lossless
  // and far cheaper than round-tripping every file through our own queue.
  const files = attachments?.length
    ? `<p style="margin:8px 0 0;color:#64748b">${attachments.length} attachment${attachments.length === 1 ? '' : 's'}: ${attachments.map((a) => escapeHtml(a.filename || 'file')).join(', ')}${rawUrl ? ` — <a href="${escapeHtml(rawUrl)}">download the original message</a>` : ''}</p>`
    : '';

  return `<div style="border-left:3px solid #cbd5e1;padding:8px 0 8px 12px;margin-bottom:16px;font:13px/1.5 system-ui,sans-serif">
<table style="border-collapse:collapse">${rows}</table>${files}
<p style="margin:8px 0 0;color:#64748b">Forwarded by Pathment. Reply to answer the sender.</p>
</div>`;
}

/**
 * Forward one received message. Never throws.
 *
 * Returns what happened, so the webhook can log a reason rather than a silence.
 */
async function forward(data) {
  const to = destination();
  if (!to) return { forwarded: false, reason: 'not_configured' };

  const sender = data?.from || '';
  const recipient = addressedTo(data, null);

  /**
   * Refuse to forward into the domain we receive for.
   *
   * Everything addressed to that domain comes straight back here, so a
   * destination inside it is an endless loop that would burn the sending quota
   * in minutes. Worth refusing loudly rather than discovering it at 3am.
   */
  if (domainOf(to) && domainOf(to) === domainOf(recipient)) {
    logger.error(`[inbound] refusing to forward to ${to}: same domain as the recipient, which would loop`);
    return { forwarded: false, reason: 'would_loop' };
  }

  const full = await fetchReceived(data?.email_id || data?.id);
  const subject = data?.subject || full?.subject || '(no subject)';
  const attachments = full?.attachments || data?.attachments || [];
  const rawUrl = full?.raw?.download_url || null;

  const head = banner({ from: sender, to: recipient, subject, attachments, rawUrl });
  const html = full?.html ? `${head}${full.html}` : `${head}<pre style="white-space:pre-wrap;font:13px/1.5 system-ui,sans-serif">${escapeHtml(full?.text || '(the body could not be retrieved)')}</pre>`;
  const text = [
    `From: ${sender}`,
    `To: ${recipient}`,
    '',
    full?.text || '(the body could not be retrieved; open the HTML version)',
    rawUrl ? `\nOriginal message: ${rawUrl}` : '',
  ].join('\n');

  try {
    await emailService.enqueue({
      to,
      // Tagged with the address they wrote to, so filing by alias works.
      subject: `[${recipient}] ${subject}`,
      text,
      html,
      emailType: 'system',
      // Resend's id is stable per received message, so a retried webhook
      // cannot produce a second copy in the inbox.
      idempotencyKey: `inbound:${data?.email_id || data?.id}`,
      priority: 2,
      metadata: { replyTo: sender, inboundFrom: sender, inboundTo: recipient },
    });
    return { forwarded: true, to };
  } catch (error) {
    logger.error(`[inbound] could not forward ${data?.email_id}: ${error.message}`);
    return { forwarded: false, reason: 'enqueue_failed' };
  }
}

module.exports = { forward, destination, domainOf, banner, addressedTo, fetchReceived };
