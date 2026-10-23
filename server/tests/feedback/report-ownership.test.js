'use strict';

/**
 * Who owns a feedback report.
 *
 * `feedback_reports` is a product bug tracker wearing a workspace's clothes. It
 * collects the platform, the app version, the device, the page and a
 * screenshot, and its statuses are `planned`, `fixed`, `added`. Every row was
 * tenant-owned, so a report landed in the reporting organisation's own admin
 * board - where a mentoring organisation's admin could do precisely nothing
 * about a bug in Pathment except reply and close it. The reporter was then
 * emailed a resolution that resolved nothing, and whoever could actually fix it
 * never saw the report unless they happened to log into that workspace.
 *
 * "What's New" already went the other way for exactly this reason: ProductUpdate
 * is deliberately absent from config/tenantOwnership.js because an entry
 * describes the PRODUCT. This is the return path on the same channel.
 *
 * Two rules, and both are tested over HTTP because the UI is not the boundary:
 *   - a bug or suggestion belongs to the platform; a workspace admin READS it.
 *   - a question about a programme belongs to the workspace admin, as before.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { cleanDb, createAdmin, createMentee } = require('../helpers/seed');
const { generateAccessToken } = require('../../src/utils/jwt');
const feedbackService = require('../../src/services/feedbackReportService');
// Mail is stubbed globally (tests/setup.js). Asserting on the enqueue call is
// the honest assertion here: what matters is WHO gets told, not that a row
// reached a queue the suite does not run a worker for.
const emailService = require('../../src/services/emailService');
// Likewise stubbed globally: no row is written, so the assertion is on who the
// dispatch names rather than on a notifications table that stays empty.
const notificationOrchestrator = require('../../src/services/notificationOrchestrator');

const tokenFor = (user) => generateAccessToken({ id: user.id, email: user.email, role: user.role });
const authed = (token) => ({ Authorization: `Bearer ${token}` });

let seq = 0;
const email = (prefix) => `${prefix}-${Date.now()}-${seq++}@test.com`;

describe('feedback report ownership', () => {
  let operator;      // a platform admin (owner tier)
  let workspaceAdmin;
  let mentee;
  let tokens;

  const file = (token, body) => request(app)
    .post('/api/feedback')
    .set(authed(token))
    .send(body);

  beforeEach(async () => {
    await cleanDb();
    delete process.env.PLATFORM_ADMIN_EMAILS;
    operator = await createAdmin({ email: email('operator') });
    workspaceAdmin = await createAdmin({ email: email('ws-admin') });
    mentee = await createMentee({ email: email('mentee') });
    await models.PlatformAdmin.create({ userId: operator.id, role: 'owner' });
    tokens = {
      operator: tokenFor(operator),
      workspaceAdmin: tokenFor(workspaceAdmin),
      mentee: tokenFor(mentee),
    };
  });

  // ── the lane is decided from what the report is about ────────────────────

  it('files a bug in the product lane', async () => {
    const res = await file(tokens.mentee, { type: 'bug', title: 'The tick box shows an error' });
    expect(res.status).toBe(201);
    expect(res.body.data.report.lane).toBe('product');
  });

  it('files a suggestion in the product lane', async () => {
    const res = await file(tokens.mentee, { type: 'suggestion', title: 'Add a dark mode please' });
    expect(res.status).toBe(201);
    expect(res.body.data.report.lane).toBe('product');
  });

  it('files a programme question in the workspace lane', async () => {
    const res = await file(tokens.mentee, { type: 'other', title: 'I think I am in the wrong clan' });
    expect(res.status).toBe(201);
    expect(res.body.data.report.lane).toBe('workspace');
  });

  /**
   * The lane is derived on the server, never taken from the request. A client
   * that could name its own lane could route a product bug into a workspace
   * inbox, or somebody's question about their mentor out to the platform.
   */
  it('ignores a lane the client tries to choose', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .set(authed(tokens.mentee))
      .send({ type: 'bug', title: 'Routed by the client', lane: 'workspace' });
    expect(res.status).toBe(201);
    expect(res.body.data.report.lane).toBe('product');
  });

  // ── who may write ────────────────────────────────────────────────────────

  it('refuses a workspace admin the status of a product report', async () => {
    const filed = await file(tokens.mentee, { type: 'bug', title: 'Approvals page crashes' });
    const id = filed.body.data.report.id;

    const res = await request(app)
      .patch(`/api/feedback/${id}`)
      .set(authed(tokens.workspaceAdmin))
      .send({ status: 'fixed', resolutionNote: 'Closing this' });

    expect(res.status).toBe(403);
    // Unchanged, not merely refused: a 403 that still wrote would be worse.
    const row = await models.FeedbackReport.findByPk(id, { skipOrganizationScope: true });
    expect(row.status).toBe('open');
  });

  it('lets a workspace admin answer their own lane', async () => {
    const filed = await file(tokens.mentee, { type: 'other', title: 'Wrong clan' });
    const id = filed.body.data.report.id;

    const res = await request(app)
      .patch(`/api/feedback/${id}`)
      .set(authed(tokens.workspaceAdmin))
      .send({ status: 'declined', resolutionNote: 'Moved you across, sorry about that' });

    expect(res.status).toBe(200);
    expect(res.body.data.report.status).toBe('declined');
  });

  /**
   * Even on the lane they own, "planned" and "fixed" are claims about the
   * software. The board stops offering them; this is why it can.
   */
  it('refuses a workspace admin a platform-only status on their own lane', async () => {
    const filed = await file(tokens.mentee, { type: 'other', title: 'Wrong clan again' });
    const res = await request(app)
      .patch(`/api/feedback/${filed.body.data.report.id}`)
      .set(authed(tokens.workspaceAdmin))
      .send({ status: 'fixed' });
    expect(res.status).toBe(403);
  });

  it('still shows a workspace admin both lanes, because reading is not owning', async () => {
    await file(tokens.mentee, { type: 'bug', title: 'A bug of ours' });
    await file(tokens.mentee, { type: 'other', title: 'A question of ours' });

    const res = await request(app).get('/api/feedback').set(authed(tokens.workspaceAdmin));
    expect(res.status).toBe(200);
    const lanes = res.body.data.reports.map((r) => r.lane).sort();
    expect(lanes).toEqual(['product', 'workspace']);
  });

  // ── the platform inbox ───────────────────────────────────────────────────

  it('lets the platform set a status a workspace admin cannot', async () => {
    const filed = await file(tokens.mentee, { type: 'bug', title: 'Crash on submit' });
    const res = await request(app)
      .patch(`/api/platform/feedback/${filed.body.data.report.id}`)
      .set(authed(tokens.operator))
      .send({ status: 'fixed', resolutionNote: 'Fixed in v1.4.2' });

    expect(res.status).toBe(200);
    expect(res.body.data.report).toMatchObject({ status: 'fixed', resolutionNote: 'Fixed in v1.4.2' });
  });

  it('keeps a workspace admin out of the platform inbox entirely', async () => {
    // No workspace role, custom role or permission may reach the console.
    const res = await request(app).get('/api/platform/feedback').set(authed(tokens.workspaceAdmin));
    expect(res.status).toBe(403);
  });

  it('shows the platform the product lane by default', async () => {
    await file(tokens.mentee, { type: 'bug', title: 'A product bug' });
    await file(tokens.mentee, { type: 'other', title: 'A programme question' });

    const res = await request(app).get('/api/platform/feedback').set(authed(tokens.operator));
    expect(res.status).toBe(200);
    expect(res.body.data.reports.map((r) => r.title)).toEqual(['A product bug']);
  });

  it('includes the workspace lane only when asked', async () => {
    await file(tokens.mentee, { type: 'bug', title: 'A product bug' });
    await file(tokens.mentee, { type: 'other', title: 'A programme question' });

    const res = await request(app)
      .get('/api/platform/feedback')
      .query({ lane: 'all' })
      .set(authed(tokens.operator));
    expect(res.body.data.reports.map((r) => r.title).sort())
      .toEqual(['A product bug', 'A programme question']);
  });

  it('says which workspace each report came from', async () => {
    await file(tokens.mentee, { type: 'bug', title: 'Which customer is this?' });
    const res = await request(app).get('/api/platform/feedback').set(authed(tokens.operator));
    // The first question anyone triaging asks, and it was unanswerable from
    // inside a single workspace's board.
    expect(res.body.data.reports[0].organization).toEqual(
      expect.objectContaining({ name: expect.any(String), slug: expect.any(String) }),
    );
  });

  /**
   * A platform status change still has to reach the reporter.
   *
   * Which is why the write enters the REPORT'S workspace rather than running
   * with none: the row it saves and the notification it sends are both
   * tenant-owned, and a tenant-owned write with no tenant in context is a NOT
   * NULL violation rather than a global row. The status test above is the proof
   * that the crossing happens - the update would not persist otherwise. This
   * one is the proof that the reporter is told.
   */
  it('notifies the reporter from a platform status change', async () => {
    notificationOrchestrator.dispatch.mockClear();
    const filed = await file(tokens.mentee, { type: 'bug', title: 'Tell me when this is fixed' });
    await request(app)
      .patch(`/api/platform/feedback/${filed.body.data.report.id}`)
      .set(authed(tokens.operator))
      .send({ status: 'fixed', resolutionNote: 'Shipped' });

    const calls = notificationOrchestrator.dispatch.mock.calls.map(([payload]) => payload);
    const told = calls.find((c) => c.recipients?.some((r) => r.userId === mentee.id));
    expect(told).toBeDefined();
    expect(told.payload.title).toMatch(/fixed/i);
    expect(told.payload.message).toMatch(/Shipped/);
  });

  it('records a platform status change in the platform audit trail', async () => {
    const filed = await file(tokens.mentee, { type: 'bug', title: 'Audit me' });
    await request(app)
      .patch(`/api/platform/feedback/${filed.body.data.report.id}`)
      .set(authed(tokens.operator))
      .send({ status: 'in_review' });

    const entries = await models.PlatformAuditLog.findAll({
      skipOrganizationScope: true,
      where: { action: 'feedback.status_set' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].targetId).toBe(filed.body.data.report.id);
  });

  // ── the operator ping ────────────────────────────────────────────────────

  /**
   * Product reports mail the platform admins rather than ringing their bell.
   * A Notification row is workspace-owned and `dispatch` filters recipients to
   * active members of the workspace in context, so a platform admin who is not
   * a member of the reporting workspace would be dropped from the list -
   * silently, which is most of them most of the time.
   */
  it('mails the platform admins about a product report', async () => {
    emailService.enqueue.mockClear();
    await file(tokens.mentee, { type: 'bug', title: 'Mail the operators' });

    const sent = emailService.enqueue.mock.calls.map(([payload]) => payload);
    expect(sent.some((p) => p.to === operator.email && /Mail the operators/.test(p.subject))).toBe(true);
  });

  it('does not mail the platform about a workspace-lane report', async () => {
    emailService.enqueue.mockClear();
    await file(tokens.mentee, { type: 'other', title: 'Not their problem' });

    const sent = emailService.enqueue.mock.calls.map(([payload]) => payload);
    expect(sent.some((p) => /Not their problem/.test(p.subject))).toBe(false);
  });

  /**
   * Keyed per (report, admin), so a retried submit cannot mail an operator
   * twice about the same thing.
   */
  it('keys the operator mail so a retry cannot send it twice', async () => {
    emailService.enqueue.mockClear();
    await file(tokens.mentee, { type: 'bug', title: 'Idempotent' });

    const sent = emailService.enqueue.mock.calls.map(([payload]) => payload);
    const mine = sent.filter((p) => /Idempotent/.test(p.subject));
    expect(mine).toHaveLength(1);
    expect(mine[0].idempotencyKey).toMatch(/^feedback-product:[0-9a-f-]+:[0-9a-f-]+$/);
  });
});
