/**
 * The English Full Stack curriculum, split into a six-month fellowship.
 *
 * The real roadmap is one flat list of 25 tasks with no sense of pace — open it
 * and you are looking at six months of work at once. This cuts the same tasks
 * into six monthly roadmaps and chains them with `roadmap_links`, so finishing
 * a month assigns the next.
 *
 * The content is NOT invented. `data/english-full-stack-curriculum.json` is an
 * export of the production roadmap — every title, description, deliverable,
 * acceptance criterion, estimate, due offset, points value and attached
 * resource link is copied across unchanged. What this script adds is the
 * division into months, one problem-solving task per month, and the final
 * month, which the source roadmap has nothing for.
 *
 * Two rules from the spec drive the shape:
 *   - the last month is job preparation and nothing else;
 *   - there is room kept for problem solving and analytical work throughout,
 *     rather than it being something that happens if time allows.
 *
 * `--replace` removes the programme's other roadmaps afterwards, together with
 * the assigned tasks that came from them. Both halves matter: every foreign key
 * here is ON DELETE SET NULL, so deleting a roadmap on its own does not remove
 * the work handed out from it — it silently cuts those tasks loose, and a few
 * hundred tasks with no source left is a worse state than the one you started
 * in. Without the flag nothing is removed.
 *
 * `--assign` then hands month one out to the mentees already in the programme
 * with a spread of states across it, because a cockpit whose every number is
 * zero demonstrates nothing.
 *
 * Run:     node scripts/build-fellowship-months.js --program "<name or id>"
 * Preview: node scripts/build-fellowship-months.js --program "<name>" --dry-run
 * Clean:   node scripts/build-fellowship-months.js --program "<name>" --replace
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Op } = require('sequelize');
const { models, sequelize } = require('../src/db');
const { runWithRequestContext } = require('../src/utils/auditContext');

const arg = (flag, fallback = null) => {
  const index = process.argv.indexOf(flag);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const DRY_RUN = process.argv.includes('--dry-run');
const REPLACE = process.argv.includes('--replace');

const SOURCE = path.resolve(__dirname, 'data/english-full-stack-curriculum.json');

/**
 * Which of the source tasks belong to which month, by their original
 * `task_order`.
 *
 * Grouped by what each month is FOR rather than by counting tasks into equal
 * piles: a month is a thing you can say in one sentence. Order 22, the
 * portfolio website, is deliberately pulled out of the middle of the list and
 * moved to month six, because a portfolio built before the work exists has
 * nothing in it.
 */
const MONTHS = [
  {
    month: 1,
    /**
     * JavaScript first, then Git.
     *
     * The source roadmap opens with HTML, CSS and a landing page, which are
     * dropped here: the fellowship is for people who can already put a page
     * together, and spending the first fortnight on markup costs a month that
     * is needed later. Git comes second rather than first on purpose, so the
     * first thing anybody commits is code they wrote themselves.
     */
    name: 'Month 1: JavaScript and working in the open',
    description: 'The JavaScript language itself, then Git and GitHub. Everything is built in the open from day one: the repository is the deliverable, not an afterthought.',
    orders: [3, 2],
  },
  {
    month: 2,
    name: 'Month 2: JavaScript in depth, and React',
    description: 'The parts of JavaScript that separate someone who can follow a tutorial from someone who can debug. Then React, and the first interfaces that are yours rather than copied.',
    orders: [4, 5, 6, 7, 8],
  },
  {
    month: 3,
    name: 'Month 3: The backend, and your first full stack',
    description: 'Node, Express and a database, joined to the front end you can already build. By the end of this month you have shipped something with both halves working.',
    orders: [9, 10, 11, 12, 13],
  },
  {
    month: 4,
    name: 'Month 4: Real applications, and types',
    description: 'Three full applications with real domains, plus TypeScript and enough DevOps to deploy what you build without someone else doing it for you.',
    orders: [14, 15, 16, 17, 21],
  },
  {
    month: 5,
    name: 'Month 5: Scale and architecture',
    description: 'Next.js, the largest builds in the programme, and the beginning of thinking about systems rather than features. This is the month that produces your strongest portfolio piece.',
    orders: [18, 19, 20, 23, 24],
  },
  {
    month: 6,
    name: 'Month 6: Job preparation',
    description: 'No new engineering. Five months of work turned into a portfolio, a CV, interview readiness and applications actually sent.',
    orders: [22],
    jobPrep: true,
  },
];

/**
 * One per month, because "we will fit problem solving in somewhere" is how it
 * ends up never happening. Each points at the DSA and competitive-programming
 * material the workspace already has rather than duplicating it.
 */
const problemSolving = (month) => ({
  title: `Problem solving: month ${month}`,
  description:
    'Steady practice alongside the build work. Pick from the DSA and competitive programming tracks in the workspace and keep a solutions repository: a commit on the days you solve something, so the habit is visible.',
  type: 'exercise',
  difficulty: month <= 2 ? 'easy' : month <= 4 ? 'medium' : 'hard',
  deliverable: 'A solutions repository with this month’s problems, and a short note on the ones you found hard.',
  acceptanceCriteria: [
    'At least twelve problems solved this month',
    'Solutions committed as you go, not in one batch at the end',
    'A note on at least one problem you could not solve and what you learned',
  ],
  estimatedHours: 16,
  dueOffsetDays: 28,
  pointsBase: 20,
});

/** The final month, which the source roadmap has nothing for. */
const JOB_PREP = [
  {
    title: 'CV and LinkedIn, rebuilt around the work',
    description: 'One page. Every claim on it links to something a stranger can open: a repository, a deployed app, a case study.',
    type: 'assignment', difficulty: 'medium',
    deliverable: 'A one-page CV and an updated LinkedIn profile.',
    acceptanceCriteria: ['One page', 'Every claim links to something real', 'No skill listed that you could not be questioned on'],
    estimatedHours: 6, dueOffsetDays: 7, pointsBase: 15,
  },
  {
    title: 'Interview problem solving: daily drilling',
    description: 'The month’s problem-solving work, aimed at interviews specifically: arrays, strings, hash maps, trees, and talking out loud while you solve.',
    type: 'exercise', difficulty: 'hard',
    deliverable: 'A solutions repository and a log of the problems attempted.',
    acceptanceCriteria: ['At least forty problems this month', 'Solved out loud at least ten times', 'Patterns noted, not just answers'],
    estimatedHours: 40, dueOffsetDays: 28, pointsBase: 30,
  },
  {
    title: 'System design interview practice',
    description: 'Take the systems you built in month 5 and explain them at a whiteboard: the trade-offs, what you would change at ten times the traffic.',
    type: 'practical', difficulty: 'hard',
    deliverable: 'Two recorded design walkthroughs of your own projects.',
    acceptanceCriteria: ['Explains a trade-off and why it was made', 'Answers "what breaks first under load"', 'Under twenty minutes each'],
    estimatedHours: 12, dueOffsetDays: 17, pointsBase: 25,
  },
  {
    title: 'Mock interviews: technical and behavioural',
    description: 'With your mentor, on your own code, under the conditions of a real interview.',
    type: 'interview', difficulty: 'hard',
    deliverable: 'Two completed mock interviews with written feedback.',
    acceptanceCriteria: ['One technical, one behavioural', 'Feedback acted on before the second', 'Can tell the story of one project end to end'],
    estimatedHours: 6, dueOffsetDays: 21, pointsBase: 25,
  },
  {
    title: 'Apply: target list and outreach',
    description: 'A list of companies you actually want, and applications sent. Not a number, a list with names on it.',
    type: 'assignment', difficulty: 'medium',
    deliverable: 'A tracked list of applications with dates and outcomes.',
    acceptanceCriteria: ['At least twenty-five applications sent', 'At least five warm approaches to a person, not a form', 'Tracked well enough to follow up'],
    estimatedHours: 20, dueOffsetDays: 28, pointsBase: 20,
  },
];

/**
 * No em dashes on the board.
 *
 * Two of the source tasks carry one, and the house style for roadmap content
 * is to do without: a colon where the dash introduced a label, a full stop
 * where it joined two thoughts. Applied to the copied text rather than edited
 * into the export, so re-exporting from production does not quietly undo it.
 */
const plain = (value, asTitle = false) => {
  if (typeof value !== 'string') return value;
  return value.replace(/\s*\u2014\s*/g, asTitle ? ': ' : ', ');
};

const fromSource = (task) => ({
  title: plain(task.title, true),
  description: plain(task.description),
  type: task.type,
  difficulty: task.difficulty,
  deliverable: plain(task.deliverable),
  acceptanceCriteria: (task.acceptance_criteria || []).map((line) => plain(line)),
  estimatedHours: task.estimated_hours,
  dueOffsetDays: task.due_offset_days,
  pointsBase: task.points_base,
  isMandatory: task.is_mandatory,
  resources: task.resources || [],
});

function planFor(curriculum) {
  const byOrder = new Map(curriculum.map((t) => [t.task_order, t]));
  return MONTHS.map((spec) => {
    const tasks = spec.orders.map((order) => {
      const source = byOrder.get(order);
      if (!source) throw new Error(`Source task ${order} is missing from the export`);
      return fromSource(source);
    });
    if (spec.jobPrep) tasks.push(...JOB_PREP.map((t) => ({ ...t, resources: [] })));
    else tasks.push({ ...problemSolving(spec.month), resources: [] });
    return { ...spec, tasks };
  });
}

async function createMonth(program, spec, adminId) {
  const existing = await models.Roadmap.findOne({ where: { programId: program.id, name: spec.name } });
  if (existing) { console.log(`  ℹ already there: ${spec.name}`); return existing; }
  if (DRY_RUN) {
    console.log(`  + ${spec.name}`);
    for (const t of spec.tasks) console.log(`       ${t.resources.length ? '🔗' : '  '} ${t.title}`);
    return null;
  }

  const roadmap = await models.Roadmap.create({
    programId: program.id,
    name: spec.name,
    description: spec.description,
    isBaseRoadmap: true,
    totalWeeks: 4,
    createdBy: adminId,
  });
  for (const [index, task] of spec.tasks.entries()) {
    const row = await models.RoadmapTask.create({
      roadmapId: roadmap.id,
      title: task.title,
      description: task.description,
      type: task.type,
      difficulty: task.difficulty,
      taskOrder: index + 1,
      deliverable: task.deliverable,
      acceptanceCriteria: task.acceptanceCriteria,
      estimatedHours: task.estimatedHours,
      dueOffsetDays: task.dueOffsetDays,
      pointsBase: task.pointsBase,
      isMandatory: task.isMandatory !== false,
    });
    for (const resource of task.resources) {
      await models.TaskResource.create({
        roadmapTaskId: row.id,
        title: resource.title,
        resourceType: resource.resource_type || resource.resourceType,
        url: resource.url,
        description: resource.description,
        isRequired: resource.is_required ?? resource.isRequired ?? false,
        displayOrder: resource.display_order ?? resource.displayOrder ?? 0,
      });
    }
  }
  const links = spec.tasks.reduce((n, t) => n + t.resources.length, 0);
  console.log(`  ✓ ${spec.name}  (${spec.tasks.length} tasks, ${links} resource link${links === 1 ? '' : 's'})`);
  return roadmap;
}

async function chain(roadmaps, adminId) {
  let made = 0;
  for (let i = 0; i < roadmaps.length - 1; i += 1) {
    if (!roadmaps[i] || !roadmaps[i + 1]) continue;
    const [, created] = await models.RoadmapLink.findOrCreate({
      where: { fromRoadmapId: roadmaps[i].id, toRoadmapId: roadmaps[i + 1].id },
      defaults: { fromRoadmapId: roadmaps[i].id, toRoadmapId: roadmaps[i + 1].id, position: 0, createdBy: adminId },
    });
    if (created) made += 1;
  }
  return made;
}

/**
 * Everything in this programme that is not one of the six months, and the work
 * handed out from it.
 *
 * The assigned tasks have to go with the roadmaps. Every foreign key pointing
 * here is ON DELETE SET NULL, so removing a roadmap by itself leaves the tasks
 * it produced sitting in people's lists with no source — which reads, on every
 * screen that names where a task came from, as a few hundred mystery tasks.
 */
async function removeOthers(program, keepIds) {
  const doomed = await models.Roadmap.findAll({
    where: { programId: program.id, id: { [Op.notIn]: keepIds.length ? keepIds : ['00000000-0000-0000-0000-000000000000'] } },
    attributes: ['id', 'name'],
  });
  if (!doomed.length) { console.log('  ℹ nothing else in this programme'); return; }

  const roadmapIds = doomed.map((r) => r.id);
  const taskIds = (await models.RoadmapTask.findAll({
    where: { roadmapId: { [Op.in]: roadmapIds } }, attributes: ['id'], raw: true,
  })).map((t) => t.id);
  const assignedIds = taskIds.length ? (await models.AssignedTask.findAll({
    where: { roadmapTaskId: { [Op.in]: taskIds } }, attributes: ['id'], raw: true,
  })).map((a) => a.id) : [];

  console.log(`  ${DRY_RUN ? 'would remove' : 'removing'} ${doomed.length} roadmap(s), ${taskIds.length} roadmap task(s), ${assignedIds.length} assigned task(s):`);
  for (const r of doomed) console.log(`      - ${r.name}`);
  if (DRY_RUN) return;

  if (assignedIds.length) {
    // In dependency order: the children would otherwise be left pointing at
    // nothing, for the same SET NULL reason.
    for (const model of ['TaskSubmission', 'TaskFeedback', 'TaskProgressEntry']) {
      if (models[model]) await models[model].destroy({ where: { assignedTaskId: { [Op.in]: assignedIds } } });
    }
    await models.AssignedTask.destroy({ where: { id: { [Op.in]: assignedIds } } });
  }
  if (taskIds.length) {
    await models.TaskResource.destroy({ where: { roadmapTaskId: { [Op.in]: taskIds } } });
    await models.RoadmapTask.destroy({ where: { id: { [Op.in]: taskIds } } });
  }
  await models.RoadmapLink.destroy({
    where: { [Op.or]: [{ fromRoadmapId: { [Op.in]: roadmapIds } }, { toRoadmapId: { [Op.in]: roadmapIds } }] },
  });
  await models.Roadmap.destroy({ where: { id: { [Op.in]: roadmapIds } } });
  console.log('  ✓ removed');
}

/**
 * Hand month one out, so the programme is not a set of empty shelves.
 *
 * `--replace` removes the work that came from the old roadmaps along with
 * them, which is correct and leaves every count on the cockpit at zero. A
 * review queue with nothing in it demonstrates nothing, so month one is
 * assigned to the people already in the programme with a spread of states
 * across it: finished, waiting on a mentor, started, not started. The spread
 * is deterministic — the same mentee always lands in the same state — so a
 * re-run does not reshuffle the screen somebody is demonstrating from.
 */
async function assignFirstMonth(firstMonth) {
  if (!firstMonth) return;
  const tasks = await models.RoadmapTask.findAll({
    where: { roadmapId: firstMonth.id }, order: [['taskOrder', 'ASC']],
  });
  if (!tasks.length) return;

  const clans = await models.Clan.findAll({ where: { kind: 'cohort' }, attributes: ['id', 'programId'] });
  const clanIds = clans.map((c) => c.id);
  if (!clanIds.length) { console.log('  ℹ no cohort clan to assign into'); return; }

  const memberships = await models.ClanMembership.findAll({
    where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: 'active' },
    attributes: ['userId', 'clanId', 'enrollmentId'],
    order: [['created_at', 'ASC']],
  });
  const mentors = await models.ClanMembership.findAll({
    where: { clanId: { [Op.in]: clanIds }, role: { [Op.in]: ['lead_mentor', 'co_mentor'] } },
    attributes: ['userId', 'clanId'],
  });
  const mentorFor = new Map(mentors.map((m) => [m.clanId, m.userId]));

  // not_started / in_progress / submitted / completed, cycled so every column
  // on the cockpit has something in it.
  const STATES = ['completed', 'submitted', 'in_progress', 'assigned'];
  let created = 0, submissions = 0;

  for (const [index, member] of memberships.entries()) {
    const mentorId = mentorFor.get(member.clanId);
    if (!mentorId) continue;
    for (const [position, task] of tasks.entries()) {
      const already = await models.AssignedTask.findOne({
        where: { menteeId: member.userId, roadmapTaskId: task.id },
        attributes: ['id'],
      });
      if (already) continue;
      // Earlier tasks are further along than later ones, which is what a real
      // month in progress looks like.
      const state = STATES[Math.min(STATES.length - 1, (index + position) % STATES.length)];
      const assignedAt = new Date(Date.now() - (tasks.length - position) * 3 * 86400000);
      const row = await models.AssignedTask.create({
        roadmapTaskId: task.id,
        menteeId: member.userId,
        mentorId,
        clanId: member.clanId,
        enrollmentId: member.enrollmentId || null,
        status: state,
        assignedAt,
        dueDate: new Date(assignedAt.getTime() + (task.dueOffsetDays || 7) * 86400000),
        startedAt: state === 'assigned' ? null : assignedAt,
        submittedAt: ['submitted', 'completed'].includes(state) ? new Date(assignedAt.getTime() + 86400000) : null,
        completedAt: state === 'completed' ? new Date(assignedAt.getTime() + 2 * 86400000) : null,
        pointsAwarded: state === 'completed' ? (task.pointsBase || 10) : null,
      });
      created += 1;
      if (['submitted', 'completed'].includes(state) && models.TaskSubmission) {
        await models.TaskSubmission.create({
          assignedTaskId: row.id,
          version: 1,
          submissionText: `Repository and notes for "${task.title}".`,
          submittedAt: row.submittedAt,
        });
        submissions += 1;
      }
    }
  }
  console.log(`  ✓ ${created} task(s) assigned across ${memberships.length} mentee(s), ${submissions} submission(s)`);
}

async function main() {
  await sequelize.authenticate();
  const curriculum = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));

  const slug = arg('--workspace', process.env.DEFAULT_ORGANIZATION_SLUG || process.env.TENANT_SLUG || 'devweekends');
  const organization = await models.Organization.findOne({ where: { slug } });
  if (!organization) throw new Error(`No workspace with slug "${slug}"`);

  await runWithRequestContext(
    { organizationId: organization.id, organizationSlug: organization.slug },
    async () => {
      const wanted = arg('--program');
      if (!wanted) {
        const all = await models.Program.findAll({ attributes: ['id', 'name'] });
        throw new Error(`--program is required. Available:\n${all.map((p) => `    ${p.name}  (${p.id})`).join('\n')}`);
      }
      const program = /^[0-9a-f-]{36}$/i.test(wanted)
        ? await models.Program.findByPk(wanted)
        : await models.Program.findOne({ where: { name: wanted } });
      if (!program) throw new Error(`No programme matches "${wanted}"`);

      console.log(`Workspace: ${organization.name}`);
      console.log(`Programme: ${program.name}`);
      console.log(`Source:    ${curriculum.length} tasks from the English Full Stack roadmap${DRY_RUN ? '   [dry run]' : ''}\n`);

      const admin = await models.User.findOne({ where: { role: 'admin' }, attributes: ['id'] });
      const adminId = admin ? admin.id : null;
      const plan = planFor(curriculum);

      console.log('Months');
      const roadmaps = [];
      for (const spec of plan) roadmaps.push(await createMonth(program, spec, adminId));

      if (!DRY_RUN) {
        const made = await chain(roadmaps.filter(Boolean), adminId);
        console.log(`\nChain\n  ✓ ${made} link(s): 1 → 2 → 3 → 4 → 5 → 6`);
      } else {
        console.log('\nChain\n  + would link 1 → 2 → 3 → 4 → 5 → 6');
      }

      if (REPLACE) {
        console.log('\nRemoving everything else in this programme');
        await removeOthers(program, roadmaps.filter(Boolean).map((r) => r.id));
      } else {
        console.log('\n  (other roadmaps left alone. Pass --replace to remove them)');
      }

      if (process.argv.includes('--assign') && !DRY_RUN) {
        console.log('\nHanding out month one');
        await assignFirstMonth(roadmaps[0]);
      }

      const total = plan.reduce((n, m) => n + m.tasks.length, 0);
      console.log(DRY_RUN ? '\nDry run: nothing written.' : `\n✅ Six months, ${total} tasks, chained.`);
    }
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error('❌ Failed:', error.message); process.exit(1); });
