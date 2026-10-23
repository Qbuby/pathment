/**
 * The six-month fellowship, as six chained roadmaps.
 *
 * One roadmap per month, linked end to end with `roadmap_links`: finishing a
 * month auto-assigns the next. Built this way rather than as one long roadmap
 * because `roadmap_tasks` has no month or phase column — only `task_order` and
 * `due_offset_days` — so a single roadmap hands somebody all six months of work
 * on their first day, which contradicts the rule the programme is built on:
 * month one is portfolio hygiene and there is NO blog until month two.
 *
 * The shape of the work, as specified:
 *   1  JavaScript. Every task is pushed to GitHub and the repo IS the
 *      deliverable. Case studies, READMEs and commit hygiene.
 *   2  A blog and a repo every week, plus one project finished inside the
 *      month, carrying five deliverables: LinkedIn post, article, GitHub,
 *      video demo, and a case study on their own site.
 *   5  Communication.
 *   3, 4, 6  NOT SPECIFIED YET. Seeded as empty placeholders so the chain is
 *      whole and the months are visible, each carrying one task that says what
 *      it is waiting for. Fill them in before a cohort reaches them.
 *
 * Idempotent on roadmap name within the programme: re-running adds what is
 * missing and leaves the rest alone, so it is safe against a database somebody
 * has already edited by hand.
 *
 * Run:     node scripts/seed-fellowship-roadmap.js --program "<name or id>"
 * Preview: node scripts/seed-fellowship-roadmap.js --program "<name>" --dry-run
 * Pick the workspace with --workspace <slug> (default: the deployment's own).
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { models, sequelize } = require('../src/db');
const { runWithRequestContext } = require('../src/utils/auditContext');

const arg = (flag, fallback = null) => {
  const index = process.argv.indexOf(flag);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const DRY_RUN = process.argv.includes('--dry-run');

/** Repeated on nearly every task, because it is the point of the programme. */
const PUBLIC_ARTEFACT = 'Pushed to GitHub with a README that explains the what and the why.';

const MONTHS = [
  {
    month: 1,
    name: 'Month 1 — JavaScript and a repo worth showing',
    description:
      'JavaScript fundamentals, built in the open. Every task ends as a GitHub repository: that repo is the deliverable, not a side effect. No blogging this month — the work is getting the portfolio itself into a state worth linking to.',
    tasks: [
      {
        title: 'Set up your GitHub profile and pin your first repo',
        description: 'A profile README, a sensible avatar and bio, and one pinned repository. This is the first thing anybody looks at.',
        deliverable: 'A GitHub profile with a README and at least one pinned repository.',
        acceptanceCriteria: ['Profile README exists and reads like a person wrote it', 'At least one repository pinned', 'No default placeholder bio'],
        type: 'project', difficulty: 'easy', dueOffsetDays: 4, estimatedHours: 3,
      },
      {
        title: 'JavaScript fundamentals: build a small CLI tool',
        description: 'Something genuinely useful to you, however small. Variables, control flow, functions, arrays and objects used for real rather than in exercises.',
        deliverable: `A working CLI tool. ${PUBLIC_ARTEFACT}`,
        acceptanceCriteria: ['Runs from the command line', 'README explains what it is for and how to run it', 'More than one commit, with messages that say what changed'],
        type: 'project', difficulty: 'easy', dueOffsetDays: 10, estimatedHours: 8,
      },
      {
        title: 'Async JavaScript: consume a public API',
        description: 'Promises, async/await and error handling, against an API that really does fail sometimes.',
        deliverable: `A small app that fetches, renders and handles failure. ${PUBLIC_ARTEFACT}`,
        acceptanceCriteria: ['Handles a failed request without crashing', 'No unhandled promise rejections', 'README shows a screenshot or sample output'],
        type: 'project', difficulty: 'medium', dueOffsetDays: 17, estimatedHours: 10,
      },
      {
        title: 'Write the case study for your best repo so far',
        description: 'The problem, what you chose to build, what you would do differently. This is the writing muscle that month 2 depends on.',
        deliverable: 'A case study in the repository (CASE_STUDY.md or an extended README section).',
        acceptanceCriteria: ['States the problem before the solution', 'Says what was hard and what was dropped', 'Readable by somebody who is not a developer'],
        type: 'assignment', difficulty: 'medium', dueOffsetDays: 24, estimatedHours: 4,
      },
      {
        title: 'Commit hygiene pass across every repo',
        description: 'Tidy branches, meaningful commit messages, no secrets committed, a licence where it belongs.',
        deliverable: 'Every repository from this month reviewed and cleaned.',
        acceptanceCriteria: ['No credentials or .env files in history', 'Commit messages describe the change, not "update"', 'Each repo has a README'],
        type: 'practical', difficulty: 'easy', dueOffsetDays: 30, estimatedHours: 3,
      },
    ],
  },
  {
    month: 2,
    name: 'Month 2 — ship weekly, in public',
    description:
      'The cadence starts: one blog post and one repository every week. Alongside it, one project finished inside the month, shipped with the full set of deliverables — LinkedIn post, article, GitHub, video demo, and a case study on your own website.',
    tasks: [
      {
        title: 'Build your personal website',
        description: 'Where your case studies live. Use the supplied templates if you want a running start; the content matters more than the framework.',
        deliverable: 'A deployed website with an about page and a place for case studies.',
        acceptanceCriteria: ['Live on a public URL', 'Links to your GitHub', 'At least one case study published on it'],
        type: 'project', difficulty: 'medium', dueOffsetDays: 7, estimatedHours: 12,
      },
      {
        title: 'Week 1: blog post + repo',
        description: 'One thing you built, one thing you wrote about it.',
        deliverable: `A published blog post and its repository. ${PUBLIC_ARTEFACT}`,
        acceptanceCriteria: ['Post is publicly readable', 'Repo linked from the post', 'Written this week, about this week'],
        type: 'project', difficulty: 'medium', dueOffsetDays: 7, estimatedHours: 8,
      },
      {
        title: 'Week 2: blog post + repo',
        description: 'Same cadence. The habit is the skill.',
        deliverable: `A published blog post and its repository. ${PUBLIC_ARTEFACT}`,
        acceptanceCriteria: ['Post is publicly readable', 'Repo linked from the post', 'Different subject from last week'],
        type: 'project', difficulty: 'medium', dueOffsetDays: 14, estimatedHours: 8,
      },
      {
        title: 'Week 3: blog post + repo',
        description: 'Same cadence.',
        deliverable: `A published blog post and its repository. ${PUBLIC_ARTEFACT}`,
        acceptanceCriteria: ['Post is publicly readable', 'Repo linked from the post', 'Different subject again'],
        type: 'project', difficulty: 'medium', dueOffsetDays: 21, estimatedHours: 8,
      },
      {
        title: 'Week 4: blog post + repo',
        description: 'Same cadence.',
        deliverable: `A published blog post and its repository. ${PUBLIC_ARTEFACT}`,
        acceptanceCriteria: ['Post is publicly readable', 'Repo linked from the post', 'Four weeks, four posts'],
        type: 'project', difficulty: 'medium', dueOffsetDays: 28, estimatedHours: 8,
      },
      {
        title: 'Month project: a multi-vendor module, end to end',
        description:
          'One real project finished inside the month. Scope is agreed with your mentor in week 1 and deliberately kept to what fits — a module done properly beats a platform half-built. NOTE FOR THE TEAM: which module this is has not been decided yet.',
        deliverable: 'LinkedIn post, written article, GitHub repository, video demo, and a case study on your own website.',
        acceptanceCriteria: [
          'Scope agreed with your mentor before you start',
          'LinkedIn post published',
          'Article published',
          'Repository public, with a README anybody can follow',
          'Video demo recorded and linked',
          'Case study on your own website',
        ],
        type: 'project', difficulty: 'hard', dueOffsetDays: 30, estimatedHours: 40,
      },
    ],
  },
  {
    month: 3,
    name: 'Month 3 — to be defined',
    description: 'Not specified yet. Seeded so the six-month chain is whole; fill it in before any cohort reaches it.',
    placeholder: true,
  },
  {
    month: 4,
    name: 'Month 4 — to be defined',
    description: 'Not specified yet. Seeded so the six-month chain is whole; fill it in before any cohort reaches it.',
    placeholder: true,
  },
  {
    month: 5,
    name: 'Month 5 — communication',
    description:
      'Explaining your work to people who are not in it: writing, speaking, interviewing. The portfolio is built; this month makes you able to talk about it.',
    tasks: [
      {
        title: 'Record a five-minute walkthrough of your best project',
        description: 'Talking to camera about what you built, for a non-technical audience.',
        deliverable: 'A recorded walkthrough, linked from the project README.',
        acceptanceCriteria: ['Under six minutes', 'No jargon left unexplained', 'Audible and watchable'],
        type: 'video', difficulty: 'medium', dueOffsetDays: 10, estimatedHours: 5,
      },
      {
        title: 'Mock interview: talk through your own code',
        description: 'A technical conversation about decisions you actually made.',
        deliverable: 'Completed mock interview with written feedback from your mentor.',
        acceptanceCriteria: ['Can explain a trade-off you made and why', 'Answers the "what would you change" question'],
        type: 'interview', difficulty: 'hard', dueOffsetDays: 20, estimatedHours: 3,
      },
      {
        title: 'Rewrite your LinkedIn and your CV around the work',
        description: 'Six months of public artefacts, said plainly.',
        deliverable: 'An updated LinkedIn profile and a one-page CV.',
        acceptanceCriteria: ['Every claim links to something real', 'One page', 'No unexplained buzzwords'],
        type: 'assignment', difficulty: 'easy', dueOffsetDays: 28, estimatedHours: 4,
      },
    ],
  },
  {
    month: 6,
    name: 'Month 6 — to be defined',
    description: 'Not specified yet. Seeded so the six-month chain is whole; fill it in before any cohort reaches it.',
    placeholder: true,
  },
];

/** The one task a placeholder month carries, so nobody meets a blank screen. */
const placeholderTask = (month) => ({
  title: `Month ${month} is still being written`,
  description: 'The curriculum for this month has not been agreed yet. Your mentor will replace this with the real work before you get here.',
  deliverable: 'Nothing to hand in — this is a marker, not an assignment.',
  acceptanceCriteria: ['Replace this task before a cohort reaches this month'],
  type: 'custom', difficulty: 'easy', dueOffsetDays: 30, estimatedHours: 1,
});

async function resolveProgram(wanted) {
  if (!wanted) {
    const all = await models.Program.findAll({ attributes: ['id', 'name'], limit: 25 });
    throw new Error(
      `--program is required. Available:\n${all.map((p) => `    ${p.name}  (${p.id})`).join('\n') || '    (none)'}`
    );
  }
  const byId = /^[0-9a-f-]{36}$/i.test(wanted)
    ? await models.Program.findByPk(wanted)
    : null;
  const program = byId || await models.Program.findOne({ where: { name: wanted } });
  if (!program) throw new Error(`No programme matches "${wanted}"`);
  return program;
}

async function seedMonth(program, spec, adminId) {
  const existing = await models.Roadmap.findOne({ where: { programId: program.id, name: spec.name } });
  if (existing) {
    console.log(`  ℹ already there: ${spec.name}`);
    return { roadmap: existing, created: false };
  }
  const tasks = spec.placeholder ? [placeholderTask(spec.month)] : spec.tasks;
  if (DRY_RUN) {
    console.log(`  + would create: ${spec.name}  (${tasks.length} task${tasks.length === 1 ? '' : 's'})`);
    return { roadmap: null, created: true };
  }

  const roadmap = await models.Roadmap.create({
    programId: program.id,
    name: spec.name,
    description: spec.description,
    isBaseRoadmap: true,
    totalWeeks: 4,
    createdBy: adminId,
  });
  for (const [index, task] of tasks.entries()) {
    await models.RoadmapTask.create({
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
      isMandatory: true,
    });
  }
  console.log(`  ✓ created: ${spec.name}  (${tasks.length} task${tasks.length === 1 ? '' : 's'})`);
  return { roadmap, created: true };
}

async function chain(roadmaps, adminId) {
  let linked = 0;
  for (let i = 0; i < roadmaps.length - 1; i += 1) {
    const from = roadmaps[i];
    const to = roadmaps[i + 1];
    if (!from || !to) continue;
    const [, made] = await models.RoadmapLink.findOrCreate({
      where: { fromRoadmapId: from.id, toRoadmapId: to.id },
      defaults: { fromRoadmapId: from.id, toRoadmapId: to.id, position: 0, createdBy: adminId },
    });
    if (made) linked += 1;
  }
  return linked;
}

async function main() {
  await sequelize.authenticate();

  const slug = arg('--workspace', process.env.DEFAULT_ORGANIZATION_SLUG || process.env.TENANT_SLUG || 'devweekends');
  const organization = await models.Organization.findOne({ where: { slug } });
  if (!organization) throw new Error(`No workspace with slug "${slug}"`);
  console.log(`Workspace: ${organization.name} (${organization.slug})`);

  await runWithRequestContext(
    { organizationId: organization.id, organizationSlug: organization.slug },
    async () => {
      const program = await resolveProgram(arg('--program'));
      console.log(`Programme: ${program.name}\n`);

      const admin = await models.User.findOne({ where: { role: 'admin', status: 'active' }, attributes: ['id'] });
      const roadmaps = [];
      for (const spec of MONTHS) {
        const { roadmap } = await seedMonth(program, spec, admin ? admin.id : null);
        roadmaps.push(roadmap);
      }

      if (DRY_RUN) {
        console.log('\nDry run: nothing written. The six months would be chained 1 → 2 → 3 → 4 → 5 → 6.');
        return;
      }
      const linked = await chain(roadmaps, admin ? admin.id : null);
      console.log(`\n✅ Six-month chain ready — ${linked} new link${linked === 1 ? '' : 's'} (1 → 2 → 3 → 4 → 5 → 6).`);
      console.log('   Finishing a month auto-assigns the next, per enrollment.');
      console.log('   Months 3, 4 and 6 are placeholders until the curriculum is agreed.');
    }
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error('❌ Seeding failed:', error.message); process.exit(1); });
