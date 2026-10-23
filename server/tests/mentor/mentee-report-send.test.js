'use strict';

/**
 * Mailing a mentee's progress to somebody outside Pathment.
 *
 * This is the one place in the product that sends a stranger somebody else's
 * progress on a user's say-so. The organisations funding a fellowship need to
 * see that the people they pay for are getting somewhere, and they have no
 * accounts here — so the recipients are arbitrary addresses.
 *
 * Which makes two things load-bearing rather than nice to have:
 *
 *   the AUDIENCE is resolved from the caller's own access, never from the ids
 *   the browser sent, so naming a clan you do not mentor sends nothing; and
 *
 *   every send is auditable, because an export of somebody's progress leaving
 *   the system should be answerable for afterwards.
 */

const { models } = require('../../src/db');
const service = require('../../src/services/menteeReportService');
const clanService = require('../../src/services/clanService');
const emailService = require('../../src/services/emailService');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
} = require('../helpers/seed');

describe('sending mentee reports outward', () => {
  let admin, mentor, outsider, program, myClan, theirClan, mine, theirs;

  beforeEach(async () => {
    await cleanDb();
    emailService.enqueue.mockClear();

    admin = await createAdmin({ email: `snd-admin-${Date.now()}@test.com` });
    mentor = await createMentor({ email: `snd-mentor-${Date.now()}@test.com` });
    outsider = await createMentor({ email: `snd-outsider-${Date.now()}@test.com` });
    program = await createProgram({ createdBy: admin.id, name: 'Full Stack' });

    myClan = await models.Clan.create({
      programId: program.id, name: 'Mine', leadMentorId: mentor.id, createdBy: admin.id,
    });
    theirClan = await models.Clan.create({
      programId: program.id, name: 'Theirs', leadMentorId: outsider.id, createdBy: admin.id,
    });
    await clanService.addMember(myClan.id, { userId: mentor.id, role: 'lead_mentor' });
    await clanService.addMember(theirClan.id, { userId: outsider.id, role: 'lead_mentor' });

    mine = await createMentee({ email: `snd-mine-${Date.now()}@test.com` });
    theirs = await createMentee({ email: `snd-theirs-${Date.now()}@test.com` });
    await createEnrollment({ menteeId: mine.id, programId: program.id, status: 'active' });
    await createEnrollment({ menteeId: theirs.id, programId: program.id, status: 'active' });
    await clanService.addMember(myClan.id, { userId: mine.id, role: 'mentee' });
    await clanService.addMember(theirClan.id, { userId: theirs.id, role: 'mentee' });
  });

  // ── who you may report on ────────────────────────────────────────────────

  it('resolves a mentor to the mentees of the clan they actually mentor', async () => {
    const audience = await service.resolveAudience(mentor, { clanId: myClan.id });
    expect(audience.menteeIds).toEqual([mine.id]);
  });

  /** The important one: naming somebody else's clan gets you nothing. */
  it('gives a mentor nothing for a clan they do not mentor', async () => {
    const audience = await service.resolveAudience(mentor, { clanId: theirClan.id });
    expect(audience.menteeIds).toEqual([]);
    expect(audience.refused).toBe(1);
  });

  it('ignores mentee ids the caller cannot view, rather than trusting the list', async () => {
    const audience = await service.resolveAudience(mentor, { menteeIds: [mine.id, theirs.id] });
    expect(audience.menteeIds).toEqual([mine.id]);
    expect(audience.refused).toBe(1);
  });

  it('refuses a request that names no scope at all', async () => {
    await expect(service.resolveAudience(mentor, {})).rejects.toThrow(/clan, a programme or some mentees/i);
  });

  // ── sending ──────────────────────────────────────────────────────────────

  it('queues one email per recipient', async () => {
    const result = await service.sendReports(mentor, {
      recipients: ['funder@example.com', 'programme@example.com'],
      clanId: myClan.id,
    });
    expect(result.sent).toBe(2);
    expect(result.mentees).toBe(1);
    expect(emailService.enqueue).toHaveBeenCalledTimes(2);
  });

  it('puts the mentee and the period in the subject, for somebody with no account', async () => {
    await service.sendReports(mentor, { recipients: ['funder@example.com'], clanId: myClan.id });
    const [payload] = emailService.enqueue.mock.calls[0];
    expect(payload.subject).toMatch(/Progress report/i);
    expect(payload.to).toBe('funder@example.com');
    expect(payload.html).toContain('Progress');
  });

  it('carries the sender’s note through to the reader', async () => {
    await service.sendReports(mentor, {
      recipients: ['funder@example.com'], clanId: myClan.id, note: 'September stipend review',
    });
    const [payload] = emailService.enqueue.mock.calls[0];
    expect(payload.html).toContain('September stipend review');
  });

  it('sends nothing about a clan the caller does not mentor', async () => {
    await expect(service.sendReports(mentor, {
      recipients: ['funder@example.com'], clanId: theirClan.id,
    })).rejects.toThrow(/no mentees you can report on/i);
    expect(emailService.enqueue).not.toHaveBeenCalled();
  });

  // ── the guards on mailing strangers ──────────────────────────────────────

  it('refuses an address that is not one', async () => {
    await expect(service.sendReports(mentor, {
      recipients: ['not-an-email'], clanId: myClan.id,
    })).rejects.toThrow(/not a valid email/i);
    expect(emailService.enqueue).not.toHaveBeenCalled();
  });

  it('refuses an empty recipient list rather than silently doing nothing', async () => {
    await expect(service.sendReports(mentor, { recipients: [], clanId: myClan.id }))
      .rejects.toThrow(/at least one email/i);
  });

  /** An accidental bulk send outward is not undoable. */
  it('caps how many strangers one send can reach', async () => {
    const many = Array.from({ length: 11 }, (_, i) => `person${i}@example.com`);
    await expect(service.sendReports(mentor, { recipients: many, clanId: myClan.id }))
      .rejects.toThrow(/ten recipients/i);
    expect(emailService.enqueue).not.toHaveBeenCalled();
  });

  it('de-duplicates a recipient listed twice', async () => {
    const result = await service.sendReports(mentor, {
      recipients: ['funder@example.com', 'Funder@Example.com '], clanId: myClan.id,
    });
    expect(result.recipients).toBe(1);
    expect(emailService.enqueue).toHaveBeenCalledTimes(1);
  });

  it('records the send, because progress leaving the system must be answerable', async () => {
    await service.sendReports(mentor, { recipients: ['funder@example.com'], clanId: myClan.id });
    const logged = await models.AuditLog.findAll({ where: { action: 'MENTEE_REPORT_SENT' } });
    expect(logged.length).toBeGreaterThan(0);
  });

  it('lets an admin report across a whole programme', async () => {
    const audience = await service.resolveAudience(admin, { programId: program.id });
    expect(audience.menteeIds.sort()).toEqual([mine.id, theirs.id].sort());
  });
});
