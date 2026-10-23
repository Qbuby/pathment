'use strict';

/**
 * The inbox belongs to the portal it was opened from.
 *
 * A person who leads one clan and learns in another saw one merged list in both
 * portals — their mentees' threads sitting next to their own mentor's. The list
 * is paged, so the split has to happen in the query, not over the returned page.
 *
 * The rule is stated as an EXCLUSION: hide the contacts who belong only to the
 * other hat. An inclusion list would silently drop everyone the relationship
 * model can't classify (an admin, someone from a clan you left), and an inbox
 * that quietly loses threads is worse than one showing a few extra.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const messagingService = require('../../src/services/messagingService');
const { cleanDb, createMentor, createMentee, createAdmin, createProgram } = require('../helpers/seed');

const titlesFor = async (user, portalRole) => {
  const conversations = await messagingService.listConversations(user.id, {
    portal: { role: portalRole, clanId: null }
  });
  return conversations.flatMap((c) => c.participants.map((p) => p.email)).sort();
};

describe('a dual-role inbox', () => {
  let dual, myMentee, myMentor, anAdmin, program, ledClan, learningClan;

  beforeEach(async () => {
    await cleanDb();

    dual = await createMentor({ email: 'dual@test.com' });
    myMentee = await createMentee({ email: 'my-mentee@test.com' });
    myMentor = await createMentor({ email: 'my-mentor@test.com' });
    anAdmin = await createAdmin({ email: 'an-admin@test.com' });

    program = await createProgram({ createdBy: myMentor.id });
    ledClan = await models.Clan.create({
      programId: program.id, name: 'Viral Loop', leadMentorId: dual.id, createdBy: dual.id
    });
    learningClan = await models.Clan.create({
      programId: program.id, name: 'Community', leadMentorId: myMentor.id, createdBy: myMentor.id
    });

    await clanService.addMember(ledClan.id, { userId: dual.id, role: 'lead_mentor' });
    await clanService.addMember(ledClan.id, { userId: myMentee.id, role: 'mentee' });
    await clanService.addMember(learningClan.id, { userId: myMentor.id, role: 'lead_mentor' });
    await clanService.addMember(learningClan.id, { userId: dual.id, role: 'mentee' });

    for (const other of [myMentee, myMentor, anAdmin]) {
      const conversation = await messagingService.createOrGetDirectConversation(dual.id, other.id);
      await messagingService.sendMessage(dual.id, { conversationId: conversation.id, messageText: 'hello' });
    }
  });

  it('keeps the mentor hat out of the mentee inbox', async () => {
    const emails = await titlesFor(dual, 'mentee');
    expect(emails).not.toContain('my-mentee@test.com');
    expect(emails).toContain('my-mentor@test.com');
  });

  it('keeps the mentee hat out of the mentor inbox', async () => {
    const emails = await titlesFor(dual, 'mentor');
    expect(emails).toContain('my-mentee@test.com');
    expect(emails).not.toContain('my-mentor@test.com');
  });

  it('never hides a contact it cannot classify', async () => {
    expect(await titlesFor(dual, 'mentee')).toContain('an-admin@test.com');
    expect(await titlesFor(dual, 'mentor')).toContain('an-admin@test.com');
  });

  it('shows everything when no portal is stated (older clients)', async () => {
    const conversations = await messagingService.listConversations(dual.id, {});
    const emails = conversations.flatMap((c) => c.participants.map((p) => p.email)).sort();
    expect(emails).toEqual(['an-admin@test.com', 'my-mentee@test.com', 'my-mentor@test.com']);
  });

  it('leaves a single-role person untouched in their own portal', async () => {
    const emails = await titlesFor(myMentee, 'mentee');
    expect(emails).toEqual(['dual@test.com']);
  });

  /**
   * The overlap case, and the reason the rule subtracts rather than selects: in
   * a clan where you co-mentor AND learn, a clan-mate is genuinely both. Their
   * thread belongs in both portals.
   */
  it('keeps a contact who is under both hats in both portals', async () => {
    await clanService.addMember(learningClan.id, { userId: dual.id, role: 'co_mentor' });
    expect(await titlesFor(dual, 'mentee')).toContain('my-mentor@test.com');
    expect(await titlesFor(dual, 'mentor')).toContain('my-mentor@test.com');
  });
});

/**
 * The inbox also belongs to the programmes the viewer can currently see.
 *
 * Scope moves. Somebody can be an org admin at nine and an admin of one
 * programme at ten, and nothing recomputed when it changed: `listConversations`
 * filtered by hat and never asked about programmes at all, so every thread they
 * had ever opened stayed in the list, with people from programmes they no
 * longer had any access to.
 *
 * Hidden, never deleted. Nothing about the thread is touched, so restoring the
 * access brings it straight back.
 */
describe('an inbox bounded by programme', () => {
  let viewer, samePrograme, otherProgramme, unplaceable;

  const threadBetween = async (a, b) => {
    const conversation = await models.Conversation.create({
      type: 'direct',
      createdBy: a.id,
      metadata: { directKey: [a.id, b.id].sort().join(':') },
    });
    await models.ConversationParticipant.bulkCreate([
      { conversationId: conversation.id, userId: a.id, role: 'owner' },
      { conversationId: conversation.id, userId: b.id, role: 'participant' },
    ]);
    return conversation;
  };

  const inboxEmails = async (user, portalRole) => {
    const conversations = await messagingService.listConversations(user.id, {
      portal: { role: portalRole, clanId: null },
    });
    return conversations.flatMap((c) => c.participants.map((p) => p.email)).sort();
  };

  beforeEach(async () => {
    await cleanDb();

    viewer = await createMentor({ email: 'viewer@test.com' });
    samePrograme = await createMentee({ email: 'same-programme@test.com' });
    otherProgramme = await createMentee({ email: 'other-programme@test.com' });
    unplaceable = await createMentor({ email: 'unplaceable@test.com' });

    const mine = await createProgram({ createdBy: viewer.id, name: 'Fellowship' });
    const theirs = await createProgram({ createdBy: viewer.id, name: 'Accelerator' });
    const myClan = await models.Clan.create({
      programId: mine.id, name: 'Mine', leadMentorId: viewer.id, createdBy: viewer.id,
    });
    const theirClan = await models.Clan.create({
      programId: theirs.id, name: 'Theirs', leadMentorId: viewer.id, createdBy: viewer.id,
    });

    await clanService.addMember(myClan.id, { userId: viewer.id, role: 'lead_mentor' });
    await clanService.addMember(myClan.id, { userId: samePrograme.id, role: 'mentee' });
    await clanService.addMember(theirClan.id, { userId: otherProgramme.id, role: 'mentee' });

    // Threads with all three, built directly: the point is what the INBOX
    // shows, not what the directory would now let them start.
    for (const other of [samePrograme, otherProgramme, unplaceable]) {
      await threadBetween(viewer, other);
    }
  });

  it('keeps the thread with somebody in the same programme', async () => {
    expect(await inboxEmails(viewer, 'mentor')).toContain('same-programme@test.com');
  });

  it('hides the thread with somebody who belongs only to another programme', async () => {
    expect(await inboxEmails(viewer, 'mentor')).not.toContain('other-programme@test.com');
  });

  /**
   * Stated as "hide the ones we can PROVE belong elsewhere", never "keep the
   * ones we can prove belong here". An inclusion list silently drops every
   * contact the relationship model cannot classify, and an inbox that quietly
   * loses threads is worse than one showing a few extra.
   */
  it('never hides somebody it cannot place in any programme', async () => {
    expect(await inboxEmails(viewer, 'mentor')).toContain('unplaceable@test.com');
  });

  it('hides nothing at all from somebody with no programme of their own', async () => {
    const outsider = await createMentor({ email: 'outsider@test.com' });
    await threadBetween(outsider, otherProgramme);
    // No programmes of our own is no basis on which to judge anybody else's.
    expect(await inboxEmails(outsider, 'mentor')).toContain('other-programme@test.com');
  });
});
