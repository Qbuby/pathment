const { requireWorkspaceId } = require('../../../utils/workspaceExecution');
const { Op } = require('sequelize');
const { models, sequelize } = require('../../../db');

/**
 * Whether a mentor can turn auto reply on, and what is missing if not.
 *
 * Auto reply sends a message to a mentee under the mentor's name without the
 * mentor seeing it first. That is a lot of trust, and it only works when three
 * separate things are true. A toggle that can be switched on before they are
 * produces silence, or worse, a confident answer grounded in nothing.
 *
 * So the toggle is not a toggle until the prerequisites are met. This service
 * is the single answer to "can they, and if not, what do they do next", and it
 * is used both to render the checklist and to refuse the enable, so the screen
 * and the server can never disagree about whether somebody is ready.
 *
 * The steps are ordered by what has to happen first: a key, then something to
 * ground answers in, then the mentor's own writing to imitate.
 */

/** Embeddings are Gemini only, so any other provider cannot satisfy this. */
const EMBEDDING_PROVIDER = 'gemini';

/** Below this many chunks, retrieval has nothing worth grounding an answer in. */
const MIN_CHUNKS = 5;

/** Below this, style learning has not seen enough of how the mentor writes. */
const MIN_STYLE_EXAMPLES = 3;

/**
 * Their OWN key. Not the organisation's, however much that looks unhelpful.
 *
 * This used to accept either, on the reasoning that telling somebody to add a
 * key they already have through their org would be wrong. The pipeline
 * disagrees, in as many words: `aiConnectionService.resolveActiveConfig` carries
 * a "Strict BYOK rule - mentors MUST have their own personal AI key... do NOT
 * fall back to admin/org keys" and returns null for a mentor who has none, and
 * `resolveGeminiKey` only ever looks at `ownerId: mentorId`.
 *
 * So an admin adding one workspace key turned step one green for every mentor
 * in the organisation, and not one of them could generate anything: embeddings
 * resolved to null, generation resolved to null, and the checklist said they
 * were ready. A checklist that promises what the pipeline refuses is worse than
 * no checklist, because it sends people looking for the fault somewhere else.
 *
 * Whether mentors SHOULD be able to use an org key is a billing question and a
 * real one - it is whose usage is being spent. Until it is answered, this says
 * what is true today.
 *
 * `status` holds 'connected' | 'error' | 'untested'. The old filter excluded
 * 'invalid', which is not a value this column can hold, so it excluded nothing
 * and a key that had failed its own test counted as a working one.
 */
async function hasGeminiKey(mentorId) {
  const count = await models.AIConnection.count({
    where: {
      provider: EMBEDDING_PROVIDER,
      status: { [Op.ne]: 'error' },
      ownerId: mentorId
    }
  });
  return count > 0;
}

async function chunkCount(mentorId) {
  const [rows] = await sequelize.query(
    'SELECT count(*)::int AS n FROM knowledge_chunks WHERE organization_id=:organizationId AND mentor_id = :id',
    { replacements: { id: mentorId, organizationId: requireWorkspaceId() } }
  );
  return rows?.[0]?.n ?? 0;
}

/**
 * The checklist, in the order it has to be done.
 *
 * Each step says what it is for rather than only what it is, because a mentor
 * being asked to paste an API key deserves to know why the feature cannot work
 * without one.
 */
async function getReadiness(mentorId) {
  const [profile, keyPresent, chunks] = await Promise.all([
    models.MentorStyleProfile.findOne({ where: { mentorId } }),
    hasGeminiKey(mentorId),
    chunkCount(mentorId)
  ]);

  const styleExamples = Array.isArray(profile?.styleExamples) ? profile.styleExamples.length : 0;

  const steps = [
    {
      key: 'key',
      title: 'Connect a Gemini key',
      why: 'Answers are written and searched by Gemini. The key has to be your own - a workspace key your admin added does not cover this - and the usage is billed to you, never to Pathment.',
      action: 'Add it here',
      done: keyPresent,
      /** Nothing else can be attempted until this is true. */
      blocking: true
    },
    {
      key: 'documents',
      title: 'Add something to answer from',
      why: `Replies are grounded in your own material, never invented. ${
        chunks > 0
          ? `You have ${chunks} passages so far.`
          : 'Upload notes, a guide, or anything you find yourself explaining twice.'
      }`,
      action: 'Upload it here',
      done: chunks >= MIN_CHUNKS,
      blocking: true,
      progress: { current: chunks, needed: MIN_CHUNKS }
    },
    {
      key: 'style',
      title: 'Let it learn how you write',
      why: `Drafts copy your tone rather than sounding like a chatbot. This happens on its own as you reply to mentees. ${
        styleExamples > 0 ? `${styleExamples} of your replies studied so far.` : ''
      }`,
      action: 'Nothing to do, it learns as you work',
      done: styleExamples >= MIN_STYLE_EXAMPLES,
      blocking: false,
      progress: { current: styleExamples, needed: MIN_STYLE_EXAMPLES }
    }
  ];

  const blockers = steps.filter((s) => s.blocking && !s.done);

  return {
    /** True only when every blocking step is done. */
    canEnable: blockers.length === 0,
    enabled: Boolean(profile?.autoReplyEnabled),
    steps,
    /** The one thing to do next, or null when they are ready. */
    nextStep: blockers[0] ? blockers[0].key : null,
    usage: {
      sent: profile?.autoReplyCount ?? 0,
      limit: profile?.autoReplyLimit ?? 100
    }
  };
}

/**
 * Turning auto reply on, refused when the prerequisites are not met.
 *
 * The check is repeated here rather than trusted from the screen. A client that
 * is out of date, or a request made directly, must not be able to switch on a
 * feature that will then answer a mentee out of an empty knowledge base.
 */
async function setAutoReply(mentorId, enabled) {
  if (enabled) {
    const readiness = await getReadiness(mentorId);
    if (!readiness.canEnable) {
      const missing = readiness.steps.filter((s) => s.blocking && !s.done).map((s) => s.title);
      const error = new Error(`Auto reply is not ready yet: ${missing.join(', ').toLowerCase()}`);
      error.statusCode = 400;
      throw error;
    }
  }

  const [profile] = await models.MentorStyleProfile.findOrCreate({
    where: { mentorId },
    defaults: { mentorId, autoReplyEnabled: false }
  });

  await profile.update({ autoReplyEnabled: Boolean(enabled) });
  return getReadiness(mentorId);
}

module.exports = { getReadiness, setAutoReply, MIN_CHUNKS, MIN_STYLE_EXAMPLES };
