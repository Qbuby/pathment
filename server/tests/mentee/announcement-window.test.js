'use strict';

/**
 * A new mentee should not inherit someone else's history.
 *
 * Announcement visibility was pure set membership - "are you in programme X
 * right now?" - with no sense of time anywhere in the query. So somebody who
 * enrolled this morning opened Announcements onto eight months of a previous
 * cohort's logistics, "Demo Day is complete, well done everyone" included.
 *
 * It fails the other way too: the enrolment lookup had no status filter at
 * all, so a mentee who dropped out kept receiving new posts for ever.
 *
 * The fix bounds every audience by the viewer's own window on it, and lets a
 * PINNED announcement escape the floor. The pin already exists, already sorts
 * first and already means "this outlives the moment", so it is what carries
 * the handbook posts - code of conduct, how to submit work - to everybody who
 * joins later. These run against the real database, because the clause nests
 * an AND inside each arm of an OR and has to produce valid SQL.
 */

const { models } = require('../../src/db');
const { runWithRequestContext } = require('../../src/utils/auditContext');
const announcementService = require('../../src/services/announcementService');
const clanService = require('../../src/services/clanService');
const {
  cleanDb, createAdmin, createMentee, createProgram, createEnrollment,
} = require('../helpers/seed');

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

describe('the window on a programme announcement', () => {
  let organization, admin, mentee, program, clan;

  const announce = async ({ audience, audienceId = null, title, at, pinned = false }) => {
    const row = await models.Announcement.create({
      organizationId: organization.id,
      authorId: admin.id,
      title,
      body: title,
      audience,
      audienceId,
      pinned,
    });
    // Backdated after the fact: `created_at` is what the window compares.
    await models.Announcement.update({ createdAt: at }, { where: { id: row.id }, silent: true });
    return row;
  };

  const titlesFor = (user, portalRole) => runWithRequestContext(
    { organizationId: organization.id, portalRole },
    async () => {
      const { items } = await announcementService.list(user, { portalRole, limit: 50 });
      return items.map((i) => i.title).sort();
    }
  );

  beforeEach(async () => {
    await cleanDb();
    organization = await models.Organization.findOne({
      where: { slug: process.env.TENANT_SLUG || 'devweekends' },
    });
    admin = await createAdmin({ email: 'window-admin@test.com' });
    mentee = await createMentee({ email: 'window-mentee@test.com' });

    program = await createProgram({ createdBy: admin.id, name: 'Fellowship 2026' });
    clan = await models.Clan.create({
      programId: program.id, name: 'Viral Loop', leadMentorId: admin.id, createdBy: admin.id,
    });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });

    // Enrolled sixty days ago, so there is a before and an after.
    const enrollment = await createEnrollment({
      menteeId: mentee.id, programId: program.id, status: 'active',
    });
    await enrollment.update({ enrolledAt: daysAgo(60) }, { silent: true });
    // The clan row is deliberately NEWER than the enrolment: a standing-clan
    // move writes a fresh membership, and the anchor must not follow it.
    await models.ClanMembership.update(
      { joinedAt: daysAgo(1) },
      { where: { clanId: clan.id, userId: mentee.id }, silent: true }
    );
  });

  it('hides a programme announcement posted before they enrolled', async () => {
    await announce({ audience: 'program', audienceId: program.id, title: 'Demo Day is complete', at: daysAgo(90) });
    await expect(titlesFor(mentee, 'mentee')).resolves.toEqual([]);
  });

  it('shows a programme announcement posted after they enrolled', async () => {
    await announce({ audience: 'program', audienceId: program.id, title: 'Week 3 brief', at: daysAgo(30) });
    await expect(titlesFor(mentee, 'mentee')).resolves.toEqual(['Week 3 brief']);
  });

  it('shows a PINNED announcement however old it is', async () => {
    await announce({ audience: 'program', audienceId: program.id, title: 'How to submit work', at: daysAgo(200), pinned: true });
    await expect(titlesFor(mentee, 'mentee')).resolves.toEqual(['How to submit work']);
  });

  it('anchors a clan announcement on the enrolment, not on the clan join', async () => {
    // Joined this clan yesterday, enrolled sixty days ago: a post from thirty
    // days ago is theirs. This is the standing-clan case - re-homing a mentee
    // must not erase their own clan history.
    await announce({ audience: 'clan', audienceId: clan.id, title: 'Clan standup moved', at: daysAgo(30) });
    await expect(titlesFor(mentee, 'mentee')).resolves.toEqual(['Clan standup moved']);
  });

  it('hides an org-wide announcement posted before they joined the workspace', async () => {
    await announce({ audience: 'all', title: 'Platform maintenance last spring', at: daysAgo(300) });
    await expect(titlesFor(mentee, 'mentee')).resolves.toEqual([]);
  });

  it('shows a current org-wide announcement', async () => {
    await announce({ audience: 'all', title: 'Office closed on Friday', at: new Date() });
    await expect(titlesFor(mentee, 'mentee')).resolves.toEqual(['Office closed on Friday']);
  });

  it('still shows an admin everything in their own programme, however old', async () => {
    // An admin reads announcements as a record of what their people were told,
    // so the window is deliberately not applied to them.
    await announce({ audience: 'program', audienceId: program.id, title: 'Demo Day is complete', at: daysAgo(90) });
    await expect(titlesFor(admin, 'admin')).resolves.toEqual(['Demo Day is complete']);
  });

  it('stops a dropped mentee receiving anything posted after they left', async () => {
    const enrollment = await models.Enrollment.findOne({
      where: { menteeId: mentee.id, programId: program.id },
    });
    await enrollment.update(
      { status: 'dropped', droppedAt: daysAgo(20) },
      { silent: true }
    );
    await models.ClanMembership.update(
      { status: 'removed' },
      { where: { clanId: clan.id, userId: mentee.id } }
    );

    await announce({ audience: 'program', audienceId: program.id, title: 'Week 8 brief', at: daysAgo(5) });
    await announce({ audience: 'program', audienceId: program.id, title: 'Week 2 brief', at: daysAgo(40) });

    // What was posted while they were there is still theirs to read.
    await expect(titlesFor(mentee, 'mentee')).resolves.toEqual(['Week 2 brief']);
  });
});
