'use strict';

/**
 * The reply-assistance checklist has to agree with the pipeline.
 *
 * `readinessService` decides whether a mentor may switch auto reply on, and
 * renders the three steps they follow to get there. It answered a different
 * question from the one the pipeline asks, in two ways, and both produced the
 * same experience: every step green, the toggle on, and never a single draft.
 *
 *   1. It counted the ORGANISATION'S key. `aiConnectionService` carries a
 *      "Strict BYOK rule - mentors MUST have their own personal AI key... do
 *      NOT fall back to admin/org keys" and returns null for a mentor without
 *      one; `resolveGeminiKey` only ever looks at `ownerId: mentorId`. So one
 *      workspace key turned step one green for every mentor in the
 *      organisation and unblocked none of them.
 *
 *   2. It filtered `status != 'invalid'`, and the column holds
 *      'connected' | 'error' | 'untested'. The filter excluded nothing, so a
 *      key that had failed its own test counted as a working one.
 *
 * A checklist that promises what the pipeline refuses is worse than no
 * checklist: it sends people looking for the fault somewhere else.
 */

const { models } = require('../../src/db');
const { getReadiness } = require('../../src/features/rag/services/readinessService');
const { cleanDb, createMentor, createAdmin } = require('../helpers/seed');

const stepFor = (readiness, key) => readiness.steps.find((step) => step.key === key);

describe('reply assistance readiness', () => {
  let mentor;

  beforeEach(async () => {
    await cleanDb();
    mentor = await createMentor({ email: `rag-mentor-${Date.now()}@test.com` });
  });

  it('is not ready with no key at all', async () => {
    const readiness = await getReadiness(mentor.id);
    expect(stepFor(readiness, 'key').done).toBe(false);
    expect(readiness.canEnable).toBe(false);
    expect(readiness.nextStep).toBe('key');
  });

  it('accepts the mentor’s own Gemini key', async () => {
    await models.AIConnection.create({
      ownerId: mentor.id, provider: 'gemini', label: 'Mine', keyEncrypted: 'encrypted-key', status: 'connected',
    });
    expect(stepFor(await getReadiness(mentor.id), 'key').done).toBe(true);
  });

  /**
   * The headline fix. An org key is real and useful - it powers the
   * admin-side AI features - but a mentor cannot reach it, so it must not
   * tick their box.
   */
  it('does not accept the organisation’s key on a mentor’s behalf', async () => {
    await models.AIConnection.create({
      ownerId: null, provider: 'gemini', label: 'Workspace', keyEncrypted: 'encrypted-key', status: 'connected',
    });
    const readiness = await getReadiness(mentor.id);
    expect(stepFor(readiness, 'key').done).toBe(false);
    expect(readiness.canEnable).toBe(false);
  });

  it('does not accept a key that failed its own test', async () => {
    await models.AIConnection.create({
      ownerId: mentor.id, provider: 'gemini', label: 'Broken', keyEncrypted: 'encrypted-key', status: 'error',
    });
    expect(stepFor(await getReadiness(mentor.id), 'key').done).toBe(false);
  });

  it('accepts an untested key, which is the state a key is added in', async () => {
    await models.AIConnection.create({
      ownerId: mentor.id, provider: 'gemini', label: 'Fresh', keyEncrypted: 'encrypted-key', status: 'untested',
    });
    expect(stepFor(await getReadiness(mentor.id), 'key').done).toBe(true);
  });

  it('does not accept another provider, because embeddings are Gemini only', async () => {
    await models.AIConnection.create({
      ownerId: mentor.id, provider: 'openrouter', label: 'Other', keyEncrypted: 'encrypted-key', status: 'connected',
    });
    expect(stepFor(await getReadiness(mentor.id), 'key').done).toBe(false);
  });

  it('does not accept another mentor’s key', async () => {
    const other = await createMentor({ email: `other-${Date.now()}@test.com` });
    await models.AIConnection.create({
      ownerId: other.id, provider: 'gemini', label: 'Theirs', keyEncrypted: 'encrypted-key', status: 'connected',
    });
    expect(stepFor(await getReadiness(mentor.id), 'key').done).toBe(false);
  });

  /**
   * The step text is what a mentor reads before pasting a key, so it has to
   * say the thing that was costing people hours: a workspace key is not theirs
   * to use here.
   */
  it('tells the mentor the key has to be their own', async () => {
    const step = stepFor(await getReadiness(mentor.id), 'key');
    expect(step.why).toMatch(/your own/i);
    expect(step.why).toMatch(/workspace key/i);
  });

  it('still blocks on material even once the key is right', async () => {
    await models.AIConnection.create({
      ownerId: mentor.id, provider: 'gemini', label: 'Mine', keyEncrypted: 'encrypted-key', status: 'connected',
    });
    const readiness = await getReadiness(mentor.id);
    expect(stepFor(readiness, 'documents').done).toBe(false);
    expect(readiness.canEnable).toBe(false);
    expect(readiness.nextStep).toBe('documents');
  });

  it('treats the writing-style step as optional, never a blocker', async () => {
    const step = stepFor(await getReadiness(mentor.id), 'style');
    expect(step.blocking).toBe(false);
  });

  it('refuses to switch on while a blocking step is unfinished', async () => {
    const { setAutoReply } = require('../../src/features/rag/services/readinessService');
    await expect(setAutoReply(mentor.id, true)).rejects.toThrow(/not ready/i);
  });

  it('leaves an admin’s own org key alone - it is not a mentor concern', async () => {
    // Adding one must not change any mentor's answer, which is the whole point.
    const admin = await createAdmin({ email: `admin-${Date.now()}@test.com` });
    await models.AIConnection.create({
      ownerId: null, provider: 'gemini', label: 'Workspace', keyEncrypted: 'encrypted-key', status: 'connected',
    });
    expect(admin).toBeTruthy();
    expect(stepFor(await getReadiness(mentor.id), 'key').done).toBe(false);
  });
});
