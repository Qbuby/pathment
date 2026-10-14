'use strict';

/**
 * Forwarding mail that arrives at the domain.
 *
 * No database and no network: the two things worth pinning here are the loop
 * guard and the Reply-To, and both are decided before anything is sent.
 */

const inbound = require('../../src/services/inboundMailService');
const emailService = require('../../src/services/emailService');

describe('forwarding inbound mail', () => {
  const ORIGINAL = { ...process.env };
  let enqueued;
  // emailService exports a class INSTANCE, so its methods live on the
  // prototype and are not own properties of the object jest is handed.
  const emailProto = Object.getPrototypeOf(emailService);

  beforeEach(() => {
    enqueued = [];
    jest.spyOn(emailProto, 'enqueue').mockImplementation(async (payload) => {
      enqueued.push(payload);
      return { id: 'queued' };
    });
    // The body is fetched over the network; stub it so these stay offline.
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        text: 'Hello, can we talk about pricing?',
        html: '<p>Hello, can we talk about pricing?</p>',
        attachments: [],
        raw: { download_url: 'https://example.test/raw.eml' },
      }),
    }));
    process.env.RESEND_API_KEY = 're_test';
    process.env.INBOUND_FORWARD_TO = 'someone@gmail.com';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ORIGINAL };
  });

  const message = (overrides = {}) => ({
    email_id: 'rcv_1',
    from: 'buyer@acme.test',
    to: ['hello@pathment.me'],
    subject: 'Pricing question',
    ...overrides,
  });

  it('does nothing at all when no destination is set', async () => {
    delete process.env.INBOUND_FORWARD_TO;
    expect(await inbound.forward(message())).toEqual({ forwarded: false, reason: 'not_configured' });
    expect(enqueued).toHaveLength(0);
  });

  /**
   * The one that matters. Everything addressed to the receiving domain comes
   * straight back, so a destination inside it would forward forever.
   */
  it('refuses a destination on the domain it receives for', async () => {
    process.env.INBOUND_FORWARD_TO = 'archive@pathment.me';
    expect(await inbound.forward(message())).toEqual({ forwarded: false, reason: 'would_loop' });
    expect(enqueued).toHaveLength(0);
  });

  it('answers the sender, not ourselves', async () => {
    await inbound.forward(message());
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].metadata.replyTo).toBe('buyer@acme.test');
    expect(enqueued[0].to).toBe('someone@gmail.com');
  });

  it('says which of our addresses they wrote to', async () => {
    await inbound.forward(message({ to: ['support@pathment.me'] }));
    expect(enqueued[0].subject).toBe('[support@pathment.me] Pricing question');
  });

  it('falls back to received_for when the To header is not one of ours', async () => {
    await inbound.forward(message({ to: [], received_for: ['hello@pathment.me'] }));
    expect(enqueued[0].subject).toBe('[hello@pathment.me] Pricing question');
  });

  /** A retried webhook must not put the same message in the inbox twice. */
  it('keys on the received id so a retry cannot duplicate it', async () => {
    await inbound.forward(message());
    await inbound.forward(message());
    expect(enqueued[0].idempotencyKey).toBe('inbound:rcv_1');
    expect(enqueued[1].idempotencyKey).toBe('inbound:rcv_1');
  });

  it('still forwards when the body cannot be fetched', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }));
    const result = await inbound.forward(message());
    expect(result.forwarded).toBe(true);
    expect(enqueued[0].text).toMatch(/could not be retrieved/i);
  });

  it('carries the original subject and sender into the body', async () => {
    await inbound.forward(message());
    expect(enqueued[0].html).toContain('buyer@acme.test');
    expect(enqueued[0].html).toContain('Pricing question');
  });

  it('escapes a sender trying to inject markup', async () => {
    await inbound.forward(message({ from: '"<script>x</script>"@acme.test' }));
    expect(enqueued[0].html).not.toContain('<script>');
    expect(enqueued[0].html).toContain('&lt;script&gt;');
  });

  it('never throws when the queue refuses', async () => {
    emailProto.enqueue.mockRejectedValueOnce(new Error('queue down'));
    expect(await inbound.forward(message())).toEqual({ forwarded: false, reason: 'enqueue_failed' });
  });
});
