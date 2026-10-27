'use strict';

/**
 * The record must survive a clan being selected.
 *
 * `canViewMentee` treats `opts.clanId` as a HARD GATE — with one given, access
 * must come through THAT clan. Every route neighbouring this one passes
 * `requestedClanId(req)`, so adding it to the record handler looks exactly like
 * tidying an inconsistency. It would silently collapse the record to the active
 * clan, which is the one thing it exists to escape, and no other test would
 * notice.
 *
 * This suite is that notice. The mentor portal always sends `X-Active-Clan`,
 * so this is also the real-world path, not a contrived one.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const { generateAccessToken } = require('../../src/utils/jwt');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram, createRoadmap, createRoadmapTask } = require('../helpers/seed');

describe('the mentee record with a clan selected', () => {
  let admin, mentorB, mentee, program, clanA, clanB, token;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'admin@test.com' });
    mentorB = await createMentor({ email: 'mentor-b@test.com' });
    mentee = await createMentee({ email: 'mover@test.com' });

    program = await createProgram({ createdBy: admin.id });
    const roadmap = await createRoadmap({ programId: program.id, createdBy: admin.id });
    // The mentor runs BOTH clans. That is what makes the selected-clan case
    // differ: with Clan A selected, the mentee is no longer a member THERE.
    clanA = await models.Clan.create({ programId: program.id, name: 'Clan A', kind: 'cohort', leadMentorId: mentorB.id, createdBy: admin.id });
    clanB = await models.Clan.create({ programId: program.id, name: 'Clan B', kind: 'cohort', leadMentorId: mentorB.id, createdBy: admin.id });
    await clanService.addMember(clanA.id, { userId: mentorB.id, role: 'lead_mentor' });
    await clanService.addMember(clanB.id, { userId: mentorB.id, role: 'lead_mentor' });

    await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });
    const roadmapTask = await createRoadmapTask({ roadmapId: roadmap.id, title: 'Work in A', taskOrder: 1 });
    await models.AssignedTask.create({
      organizationId: clanA.organizationId, clanId: clanA.id, menteeId: mentee.id,
      mentorId: admin.id, roadmapTaskId: roadmapTask.id, titleOverride: 'Work in A',
      status: 'in_progress', assignedAt: new Date(),
    });

    // They move: Clan A keeps a 'removed' row, Clan B becomes current.
    await models.ClanMembership.update(
      { status: 'removed', leftAt: new Date() },
      { where: { clanId: clanA.id, userId: mentee.id, role: 'mentee' } },
    );
    await clanService.addMember(clanB.id, { userId: mentee.id, role: 'mentee' });

    token = generateAccessToken({ id: mentorB.id, email: mentorB.email, role: mentorB.role });
  });

  const get = (path, clanHeader) => {
    const req = request(app).get(path).set('Authorization', `Bearer ${token}`).set('X-Portal-Role', 'mentor');
    return clanHeader ? req.set('X-Active-Clan', clanHeader) : req;
  };

  /**
   * THE regression guard.
   *
   * With Clan A selected, the mentee's only membership there is 'removed'. If a
   * clanId reaches `canViewMentee`, its hard-gate branch looks for a VISIBLE
   * membership in THAT clan, finds none, and 403s — even though this mentor
   * runs the clan and set the work. Verified by introducing the bug: without
   * this case the suite stayed green.
   */
  it('serves the record with the clan they LEFT selected', async () => {
    const res = await get(`/api/mentor/mentee/${mentee.id}/record`, clanA.id);

    expect(res.status).toBe(200);
    expect(res.body.data.record.clans.map((c) => c.clanName).sort()).toEqual(['Clan A', 'Clan B']);
  });

  it('returns the clan they LEFT with the current clan selected', async () => {
    const res = await get(`/api/mentor/mentee/${mentee.id}/record`, clanB.id);

    expect(res.status).toBe(200);
    expect(res.body.data.record.clans.map((c) => c.clanName).sort()).toEqual(['Clan A', 'Clan B']);
  });

  it('returns the same clans whether or not a clan is selected', async () => {
    const withClan = await get(`/api/mentor/mentee/${mentee.id}/record`, clanB.id);
    const without = await get(`/api/mentor/mentee/${mentee.id}/record`);

    const names = (res) => res.body.data.record.clans.map((c) => c.clanName).sort();
    expect(names(withClan)).toEqual(names(without));
  });

  it('tiers by what the viewer mentors, not by which clan is selected', async () => {
    const withB = await get(`/api/mentor/mentee/${mentee.id}/record`, clanB.id);
    const withA = await get(`/api/mentor/mentee/${mentee.id}/record`, clanA.id);
    const tiers = (res) => Object.fromEntries(
      res.body.data.record.clans.map((c) => [c.clanName, c.visibility]),
    );
    // This mentor runs both, so both are full — and the selected clan does not
    // change that. Tiering is a property of the viewer, not of the UI state.
    expect(tiers(withB)).toEqual({ 'Clan A': 'full', 'Clan B': 'full' });
    expect(tiers(withA)).toEqual(tiers(withB));
  });

  it('serves open work from elsewhere with the reviewed clan excluded', async () => {
    const res = await get(
      `/api/mentor/mentee/${mentee.id}/open-work-elsewhere?excludeClanId=${clanB.id}`, clanB.id,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.tasks.map((t) => t.title)).toEqual(['Work in A']);
  });

  it('refuses a mentor who shares no clan with the mentee', async () => {
    const stranger = await createMentor({ email: 'stranger@test.com' });
    const strangerToken = generateAccessToken({ id: stranger.id, email: stranger.email, role: stranger.role });
    const res = await request(app)
      .get(`/api/mentor/mentee/${mentee.id}/record`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .set('X-Portal-Role', 'mentor');
    expect(res.status).toBe(403);
  });

  it('404s for a mentee that does not exist', async () => {
    const res = await get('/api/mentor/mentee/00000000-0000-4000-8000-000000000000/record');
    expect([403, 404]).toContain(res.status);
  });
});
