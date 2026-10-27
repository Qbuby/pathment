/**
 * Dev Weekends x Qantara Gaza Fellowship: six months, twenty-four weeks.
 *
 * Six chained roadmaps, one per month. Inside each, four weekly modules plus
 * the continuous tracks that run the whole way through and a milestone that
 * closes the month. Finishing a month assigns the next.
 *
 * The hierarchy the spec asks for maps onto Pathment like this:
 *
 *   month   -> a roadmap, chained to the next
 *   week    -> a module task, paced by its due offset
 *   track   -> one task per month for DSA, English and branding, each
 *              carrying its own cadence in the acceptance criteria
 *   gate    -> a milestone task that has to be approved before the month is
 *              complete, which is what payment hangs on
 *
 * Why tracks are monthly rather than weekly: English is thirty minutes a day
 * and DSA is three sessions a week. Twenty-four separate English tasks would
 * bury the engineering work they exist to support, and a task per session is
 * a timesheet, not a curriculum. One task a month with the cadence written
 * into its criteria keeps it visible and reviewable without the noise.
 *
 * Resource links are carried across from the production English Full Stack
 * roadmap where a week covers the same ground, so fellows get the same
 * material rather than a bare title.
 *
 * Run:     node scripts/build-qantara-fellowship.js --program "<name or id>"
 * Preview: node scripts/build-qantara-fellowship.js --program "<name>" --dry-run
 * Clean:   node scripts/build-qantara-fellowship.js --program "<name>" --replace
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
 * What every substantial project has to come with. Written once; attached to
 * the weeks that end in one, and restated in the milestone that gates payment.
 */
const PROJECT_DELIVERABLES = [
  'GitHub repository with a professional README',
  'Working deployed application',
  'Architecture documentation',
  'Tests, and a code review completed',
  'Demonstration video',
  'Case study on your personal website',
  'LinkedIn technical post or article',
  'Learning notes, including the challenges you hit',
  'Mentor evaluation',
];

/**
 * Gaza-specific, and not a footnote.
 *
 * Power and bandwidth are not reliable, so nothing here depends on being
 * online at a particular hour. Every deadline is a target with a documented
 * route to an extension, and every resource has an offline fallback.
 */
const ACCESS_NOTE =
  'Everything this month works asynchronously. Sessions are recorded, resources can be downloaded for offline use, and if connectivity or power stops you meeting a date, tell your mentor and the deadline moves. Ask early rather than going quiet.';

const weekTask = ({ week, title, description, criteria, type = 'project', difficulty = 'medium', hours = 12, source = null, deliverables = false }) => ({
  title: `Week ${week}: ${title}`,
  description,
  type,
  difficulty,
  deliverable: deliverables
    ? 'The full project deliverable set below.'
    : 'Work pushed to GitHub, with a README explaining what it does and how to run it.',
  acceptanceCriteria: deliverables ? [...criteria, ...PROJECT_DELIVERABLES] : criteria,
  estimatedHours: hours,
  dueOffsetDays: ((week - 1) % 4 + 1) * 7,
  pointsBase: deliverables ? 40 : 20,
  sourceOrder: source,
});

const dsaTask = (month, focus, criteria) => ({
  title: `DSA and problem solving: month ${month}`,
  description: `Three sessions a week, every week. ${focus} Keep one solutions repository for the whole fellowship so the progression is visible in the commit history.`,
  type: 'exercise',
  difficulty: month <= 2 ? 'medium' : 'hard',
  deliverable: 'Solutions committed as you go, plus a short note on the problems you could not finish.',
  acceptanceCriteria: [...criteria, 'Three sessions a week, committed on the day', 'A written note on at least two problems you could not solve and what you learned'],
  estimatedHours: 24,
  dueOffsetDays: 28,
  pointsBase: 25,
});

const englishTask = (month, focus, criteria) => ({
  title: `English and communication: month ${month}`,
  description: `Thirty minutes a day. ${focus} This is assessed on whether you can be understood by an employer, not on grammar drills.`,
  type: 'practical',
  difficulty: 'medium',
  deliverable: 'A short recording or written piece at the end of the month, plus your practice log.',
  acceptanceCriteria: [...criteria, 'Thirty minutes a day, logged', 'One piece submitted for mentor feedback'],
  estimatedHours: 10,
  dueOffsetDays: 28,
  pointsBase: 15,
});

const brandingTask = (month, focus, criteria) => ({
  title: `Professional presence: month ${month}`,
  description: focus,
  type: 'assignment',
  difficulty: 'easy',
  deliverable: 'Public profiles and published writing, linked for review.',
  acceptanceCriteria: criteria,
  estimatedHours: 6,
  dueOffsetDays: 28,
  pointsBase: 15,
});

/**
 * The gate. A month is not finished because four weeks passed; it is finished
 * when this is approved, and that is what payment is tied to.
 *
 * Resubmission is part of the design, not an exception: the first attempt not
 * clearing the bar is ordinary, and the route back is stated rather than left
 * to be asked for.
 */
const milestoneTask = (month, criteria) => ({
  title: `Month ${month} milestone: assessment and sign-off`,
  description:
    'The month closes here. Your mentor checks the deliverables, runs a short technical assessment, watches your project demonstration and reviews how you worked: ownership, communication, and whether you asked for help early enough. Payment eligibility for the month follows this approval.\n\nNot clearing it the first time is normal. You will be told exactly what is missing and given a resubmission window. In team work, your individual contribution is assessed on your own commits, your own reviews and your own demonstration.',
  type: 'assessment',
  difficulty: 'hard',
  deliverable: 'Every deliverable for the month, submitted together, plus the demonstration.',
  acceptanceCriteria: [
    ...criteria,
    'All mandatory deliverables for the month submitted',
    'Technical assessment passed',
    'Project demonstrated live or by recording',
    'Soft skills reviewed: ownership, communication, initiative',
    'Mentor approval recorded',
  ],
  estimatedHours: 6,
  dueOffsetDays: 30,
  pointsBase: 50,
});

const MONTHS = [
  {
    month: 1,
    name: 'Month 1: Foundations',
    description: `JavaScript, React, Git and the MERN basics, ending in a CRUD application you built yourself. Your public presence starts now, not at the end: GitHub and LinkedIn in week 1, a deployed portfolio by week 2. ${ACCESS_NOTE}`,
    weeks: [
      weekTask({
        week: 1, title: 'JavaScript fundamentals', source: 3, hours: 14,
        description: 'The language itself: types, control flow, functions, arrays and objects, used on something real rather than in exercises. Set up GitHub and LinkedIn properly this week.',
        criteria: ['Three small JavaScript programs, each in its own repository', 'GitHub profile has a README and a pinned repository', 'LinkedIn profile complete with a photo and a headline'],
      }),
      weekTask({
        week: 2, title: 'Advanced JavaScript, Git and your portfolio', source: 4, hours: 14,
        description: 'Closures, promises, async/await and error handling. A proper Git workflow: branches, meaningful commits, pull requests. Deploy a portfolio site this week, even if it is nearly empty, because everything after this gets added to it.',
        criteria: ['Portfolio site deployed on a public URL', 'A repository showing branches and at least one merged pull request', 'Commit messages describe the change, not "update"'],
      }),
      weekTask({
        week: 3, title: 'React fundamentals', source: 6, hours: 14,
        description: 'Components, props, state, effects and lists. Build an interface of your own rather than following a tutorial to the end.',
        criteria: ['A React application you designed, deployed', 'State handled without copying a tutorial structure', 'README explains the component structure'],
      }),
      weekTask({
        week: 4, title: 'MERN fundamentals: your first CRUD application', source: 11, hours: 18, deliverables: true,
        description: 'Front end, back end and a database joined up. Create, read, update, delete, working end to end and deployed.',
        criteria: ['All four operations work against a real database', 'Deployed and reachable by your mentor'],
      }),
    ],
    dsa: dsaTask(1, 'Arrays and strings: the patterns everything else is built on.', ['At least twelve problems on arrays and strings']),
    english: englishTask(1, 'Conversational English, spoken out loud. Introduce yourself, describe what you are building, ask for help clearly.', ['A two-minute recorded self-introduction']),
    branding: brandingTask(1, 'GitHub and LinkedIn set up properly in week 1, portfolio deployed in week 2. From week 3, one short technical article a week, reviewed by your mentor before it goes out.', ['GitHub profile README published', 'LinkedIn complete', 'Portfolio deployed', 'Two technical articles published by the end of the month']),
    milestone: milestoneTask(1, ['CRUD application deployed and demonstrated', 'Portfolio live with at least one case study']),
  },
  {
    month: 2,
    name: 'Month 2: Full-Stack Engineering',
    description: `TypeScript, Node, real APIs, databases, authentication, testing and deployment, ending in a substantial MERN project you take from idea to deployment on your own. ${ACCESS_NOTE}`,
    weeks: [
      weekTask({
        week: 5, title: 'TypeScript', source: 17, hours: 12,
        description: 'Types, interfaces, generics and why a compiler that argues with you is worth the trouble. Convert an earlier project rather than starting fresh.',
        criteria: ['An earlier project converted to TypeScript', 'No `any` left without a comment explaining why', 'Build passes with strict mode on'],
      }),
      weekTask({
        week: 6, title: 'Node.js, Express and REST APIs', source: 9, hours: 14,
        description: 'Routing, middleware, status codes that mean something, and an API another person could use from the documentation alone.',
        criteria: ['An API with at least six endpoints', 'Correct status codes and error shapes', 'Documented well enough for someone else to call it'],
      }),
      weekTask({
        week: 7, title: 'Databases and authentication', source: 12, hours: 16,
        description: 'Schema design, relationships, indexes, and authentication done properly: hashed passwords, sessions or tokens, protected routes.',
        criteria: ['Passwords hashed, never stored in plain text', 'Protected routes genuinely refuse unauthenticated requests', 'Schema explained in the README'],
      }),
      weekTask({
        week: 8, title: 'Testing, deployment and your independent project', hours: 20, deliverables: true,
        description: 'Automated tests, a deployment pipeline, and the month’s project: something substantial, chosen by you, built without a tutorial to follow.',
        criteria: ['Tests cover the main paths and run in one command', 'Deployed with a documented deployment process', 'Scope agreed with your mentor in week 5'],
      }),
    ],
    dsa: dsaTask(2, 'Hash maps, sets, two pointers and sliding windows.', ['At least fifteen problems', 'At least five solved without looking at a hint']),
    english: englishTask(2, 'Technical English: explaining a bug, writing a clear issue, reading documentation and saying what it means in your own words.', ['One written technical explanation of a problem you solved']),
    branding: brandingTask(2, 'A weekly technical article, each one reviewed before publication. Your portfolio gains a real case study this month.', ['Four articles published', 'One full case study on your portfolio', 'LinkedIn post for the month’s project']),
    milestone: milestoneTask(2, ['Independent MERN project deployed and demonstrated', 'Tests running and passing']),
  },
  {
    month: 3,
    name: 'Month 3: Advanced Engineering',
    description: `The parts that separate a developer from an engineer: PostgreSQL, Docker, CI/CD, Redis and queues, observability, microservices and system design, plus a first look at building with AI agents. ${ACCESS_NOTE}`,
    weeks: [
      weekTask({
        week: 9, title: 'PostgreSQL and data modelling', hours: 14,
        description: 'Relational modelling, joins, transactions, indexes, and what a query plan is telling you.',
        criteria: ['A schema with at least four related tables', 'A query you made faster, with the before and after explained', 'Transactions used where they are needed'],
      }),
      weekTask({
        week: 10, title: 'Docker, CI/CD and DevOps', source: 21, hours: 16,
        description: 'Containerise an application, then build a pipeline that tests and deploys it without you doing anything by hand.',
        criteria: ['Application runs from a Dockerfile', 'Pipeline runs tests on every push', 'A deployment triggered by a merge, not by a person'],
      }),
      weekTask({
        week: 11, title: 'Redis, queues and observability', hours: 14,
        description: 'Caching, background jobs, and being able to answer "what is it doing right now" with logs and metrics rather than a guess.',
        criteria: ['A cache with a considered invalidation strategy', 'Background work moved onto a queue with retries', 'Structured logs, and one dashboard or metric that matters'],
      }),
      weekTask({
        week: 12, title: 'Microservices, system design and AI agents', source: 24, hours: 16,
        description: 'Service boundaries, communication between them, and the trade-offs. Then a first AI agent: a tool-using assistant on top of something you already built.',
        criteria: ['A design document for a system you have built, with trade-offs stated', 'One working AI agent that calls at least two tools', 'An honest account of what the agent gets wrong'],
      }),
    ],
    dsa: dsaTask(3, 'Recursion, trees and sorting.', ['At least fifteen problems', 'Tree traversals written from memory']),
    english: englishTask(3, 'Professional English: a stand-up update, a design discussion, disagreeing with a technical decision politely and clearly.', ['A recorded five-minute technical walkthrough']),
    branding: brandingTask(3, 'Weekly articles continue, now on the harder subjects you are meeting. Your GitHub should look like an engineer’s, not a student’s.', ['Four articles published', 'Every repository has a README and a licence', 'One article on something you got wrong and fixed']),
    milestone: milestoneTask(3, ['Containerised application with a working pipeline', 'System design document reviewed', 'AI agent demonstrated']),
  },
  {
    month: 4,
    name: 'Month 4: Flagship Project, Part 1',
    description: `One serious project, preferably through DWOSI, taken from requirements to a working MVP. This is the piece of work that will carry your portfolio, so it is scoped properly and built properly. ${ACCESS_NOTE}`,
    weeks: [
      weekTask({
        week: 13, title: 'Requirements and scope', type: 'assignment', hours: 10,
        description: 'What the project is, who it is for, and what it will NOT do. The hardest part of this week is cutting the scope to something that can actually be finished.',
        criteria: ['A written requirements document', 'An explicit list of what is out of scope', 'Scope signed off by your mentor before any code is written'],
      }),
      weekTask({
        week: 14, title: 'Architecture and planning', type: 'assignment', hours: 12,
        description: 'The shape of the system, the data model, the deployment target, and a plan broken into deliverable pieces. Decide how the team will work: branches, reviews, who owns what.',
        criteria: ['Architecture document with a diagram', 'Data model agreed', 'Work broken into tickets with owners', 'Branching and review process written down'],
      }),
      weekTask({
        week: 15, title: 'Implementation: the core', hours: 24,
        description: 'Build the part of the system everything else depends on. Review each other’s code properly, and keep the main branch deployable.',
        criteria: ['Core domain working end to end', 'Every change reviewed by another fellow before merge', 'Main branch deployable at the end of each week'],
      }),
      weekTask({
        week: 16, title: 'Functional MVP and demonstration', hours: 20, deliverables: true,
        description: 'A version somebody outside the team can use, demonstrated live.',
        criteria: ['The main user journey works end to end', 'Deployed and reachable', 'Demonstrated to mentors with the team presenting together'],
      }),
    ],
    dsa: dsaTask(4, 'Graphs, and the problems that look nothing like graphs until you notice.', ['At least fifteen problems', 'Graph traversal written from memory']),
    english: englishTask(4, 'Collaboration English: running a stand-up, writing an update your mentor can read in thirty seconds, asking a good question.', ['A written weekly update, four of them']),
    branding: brandingTask(4, 'Write about the project while you build it. The articles people read are the ones written during the work, not after.', ['Four articles on the flagship project', 'Project repository public with a professional README']),
    milestone: milestoneTask(4, ['Functional MVP deployed', 'Architecture document reviewed', 'Individual contribution evidenced by your own commits and reviews']),
  },
  {
    month: 5,
    name: 'Month 5: Flagship Project, Part 2',
    description: `The same project, finished properly: advanced features, AI where it genuinely helps, security, tests, performance, monitoring, deployment, and a final presentation. ${ACCESS_NOTE}`,
    weeks: [
      weekTask({
        week: 17, title: 'Advanced features and AI integration', hours: 22,
        description: 'The features that make it worth using. Add AI only where it solves a real problem in this product.',
        criteria: ['Advanced features working and reviewed', 'Any AI feature justified in writing, with its failure modes described'],
      }),
      weekTask({
        week: 18, title: 'Security and testing', hours: 20,
        description: 'Authentication and authorisation checked properly, inputs validated, secrets kept out of the repository, and a test suite you would trust before a release.',
        criteria: ['No secrets in the repository or its history', 'Authorisation tested, not just authentication', 'Tests cover the paths that would hurt most if they broke'],
      }),
      weekTask({
        week: 19, title: 'Performance, scalability and monitoring', hours: 18,
        description: 'Find the slow part with evidence rather than instinct, fix it, and put monitoring in place so the next one is noticed before a user reports it.',
        criteria: ['One measured performance improvement, before and after', 'Monitoring and alerting in place', 'A written answer to "what breaks first under load"'],
      }),
      weekTask({
        week: 20, title: 'Deployment and final presentation', hours: 18, deliverables: true,
        description: 'Production deployment, documentation somebody else could run it from, and a presentation to mentors and guests.',
        criteria: ['Deployed to production with a documented process', 'Final presentation delivered', 'Handover documentation complete'],
      }),
    ],
    dsa: dsaTask(5, 'Dynamic programming and the interview patterns that recur.', ['At least fifteen problems', 'Five classic dynamic programming problems solved and explained']),
    english: englishTask(5, 'Presentation English: delivering a technical talk, handling questions you did not expect.', ['The final presentation, delivered in English']),
    branding: brandingTask(5, 'The flagship project written up as a full case study, with a demonstration video.', ['Full case study on your portfolio', 'Demonstration video published', 'LinkedIn article on what you built and what you learned']),
    milestone: milestoneTask(5, ['Project deployed to production', 'Final presentation delivered', 'Security and performance work evidenced']),
  },
  {
    month: 6,
    name: 'Month 6: Career Preparation',
    description: `No new engineering. Five months of work turned into a CV, a portfolio, interview readiness, a network and applications actually sent. ${ACCESS_NOTE}`,
    weeks: [
      weekTask({
        week: 21, title: 'CV, LinkedIn, GitHub and portfolio polish', source: 22, type: 'assignment', difficulty: 'medium', hours: 12,
        description: 'One page. Every claim linked to something a stranger can open. Pin the right repositories, rewrite the weak READMEs, and make the portfolio open on your best work.',
        criteria: ['One-page CV', 'Every claim links to something real', 'Six repositories pinned and tidy', 'Portfolio leads with the flagship project'],
      }),
      weekTask({
        week: 22, title: 'Technical interview preparation', type: 'exercise', difficulty: 'hard', hours: 20,
        description: 'Problems under time pressure, out loud. Then your own code: the decisions, the trade-offs, what you would change.',
        criteria: ['Twenty problems solved out loud', 'Can explain any decision in your flagship project', 'Can answer "what would you do differently"'],
      }),
      weekTask({
        week: 23, title: 'Behavioural interviews and mock interviews', type: 'interview', difficulty: 'hard', hours: 12,
        description: 'The questions about people rather than code, and two full mock interviews with real feedback.',
        criteria: ['Two mock interviews completed', 'Feedback from the first acted on before the second', 'Can tell the story of one project end to end in under three minutes'],
      }),
      weekTask({
        week: 24, title: 'Networking, applications and your career plan', type: 'assignment', hours: 16,
        description: 'A real target list, warm approaches to actual people, applications sent and tracked, and a written plan for the six months after this one.',
        criteria: ['At least twenty-five applications sent and tracked', 'At least five warm approaches to a person rather than a form', 'A written plan for the next six months'],
      }),
    ],
    dsa: dsaTask(6, 'Interview drilling across every pattern, timed.', ['At least forty problems', 'Ten solved out loud under time pressure']),
    english: englishTask(6, 'Interview English: answering clearly under pressure, and professional written communication with recruiters.', ['A recorded mock interview in English', 'Three professional emails reviewed']),
    branding: null,
    milestone: milestoneTask(6, ['CV and portfolio reviewed and approved', 'Two mock interviews completed', 'Applications sent and tracked']),
  },
];

const plain = (value, asTitle = false) =>
  (typeof value === 'string' ? value.replace(/\s*—\s*/g, asTitle ? ': ' : ', ') : value);

function tasksFor(spec, resourcesByOrder) {
  const ordered = [
    ...spec.weeks,
    spec.dsa,
    spec.english,
    spec.branding,
    spec.milestone,
  ].filter(Boolean);
  return ordered.map((task) => ({
    ...task,
    title: plain(task.title, true),
    description: plain(task.description),
    deliverable: plain(task.deliverable),
    acceptanceCriteria: (task.acceptanceCriteria || []).map((line) => plain(line)),
    resources: task.sourceOrder != null ? (resourcesByOrder.get(task.sourceOrder) || []) : [],
  }));
}

async function createMonth(program, spec, tasks, adminId) {
  const existing = await models.Roadmap.findOne({ where: { programId: program.id, name: spec.name } });
  if (existing) { console.log(`  ℹ already there: ${spec.name}`); return existing; }
  if (DRY_RUN) {
    console.log(`  + ${spec.name}`);
    for (const t of tasks) console.log(`       ${t.resources.length ? '🔗' : '  '} ${t.title}`);
    return null;
  }
  const roadmap = await models.Roadmap.create({
    programId: program.id, name: spec.name, description: spec.description,
    isBaseRoadmap: true, totalWeeks: 4, createdBy: adminId,
  });
  for (const [index, task] of tasks.entries()) {
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
      isMandatory: true,
    });
    for (const resource of task.resources) {
      await models.TaskResource.create({
        roadmapTaskId: row.id,
        title: resource.title,
        resourceType: resource.resource_type || resource.resourceType,
        url: resource.url,
        description: resource.description,
        isRequired: resource.is_required ?? false,
        displayOrder: resource.display_order ?? 0,
      });
    }
  }
  const links = tasks.reduce((n, t) => n + t.resources.length, 0);
  console.log(`  ✓ ${spec.name}  (${tasks.length} tasks, ${links} resource link${links === 1 ? '' : 's'})`);
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

/** Everything in this programme that is not one of the six months. */
async function removeOthers(program, keepIds) {
  const doomed = await models.Roadmap.findAll({
    where: { programId: program.id, id: { [Op.notIn]: keepIds.length ? keepIds : ['00000000-0000-0000-0000-000000000000'] } },
    attributes: ['id', 'name'],
  });
  if (!doomed.length) { console.log('  ℹ nothing else in this programme'); return; }
  const roadmapIds = doomed.map((r) => r.id);
  const taskIds = (await models.RoadmapTask.findAll({ where: { roadmapId: { [Op.in]: roadmapIds } }, attributes: ['id'], raw: true })).map((t) => t.id);
  const assignedIds = taskIds.length ? (await models.AssignedTask.findAll({ where: { roadmapTaskId: { [Op.in]: taskIds } }, attributes: ['id'], raw: true })).map((a) => a.id) : [];

  console.log(`  ${DRY_RUN ? 'would remove' : 'removing'} ${doomed.length} roadmap(s), ${taskIds.length} task(s), ${assignedIds.length} assigned task(s):`);
  for (const r of doomed) console.log(`      - ${r.name}`);
  if (DRY_RUN) return;

  if (assignedIds.length) {
    for (const model of ['TaskSubmission', 'TaskFeedback', 'TaskProgressEntry']) {
      if (models[model]) await models[model].destroy({ where: { assignedTaskId: { [Op.in]: assignedIds } } });
    }
    await models.AssignedTask.destroy({ where: { id: { [Op.in]: assignedIds } } });
  }
  if (taskIds.length) {
    await models.TaskResource.destroy({ where: { roadmapTaskId: { [Op.in]: taskIds } } });
    await models.RoadmapTask.destroy({ where: { id: { [Op.in]: taskIds } } });
  }
  await models.RoadmapLink.destroy({ where: { [Op.or]: [{ fromRoadmapId: { [Op.in]: roadmapIds } }, { toRoadmapId: { [Op.in]: roadmapIds } }] } });
  await models.Roadmap.destroy({ where: { id: { [Op.in]: roadmapIds } } });
  console.log('  ✓ removed');
}

async function main() {
  await sequelize.authenticate();
  const curriculum = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const resourcesByOrder = new Map(curriculum.map((t) => [t.task_order, t.resources || []]));

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
      console.log(`Programme: ${program.name}${DRY_RUN ? '   [dry run]' : ''}\n`);
      const adminRow = await models.User.findOne({ where: { role: 'admin' }, attributes: ['id'] });
      const adminId = adminRow ? adminRow.id : null;

      console.log('Months');
      const roadmaps = [];
      let totalTasks = 0;
      for (const spec of MONTHS) {
        const tasks = tasksFor(spec, resourcesByOrder);
        totalTasks += tasks.length;
        roadmaps.push(await createMonth(program, spec, tasks, adminId));
      }

      if (!DRY_RUN) {
        const made = await chain(roadmaps.filter(Boolean), adminId);
        console.log(`\nChain\n  ✓ ${made} link(s): 1 -> 2 -> 3 -> 4 -> 5 -> 6`);
      } else {
        console.log('\nChain\n  + would link 1 -> 2 -> 3 -> 4 -> 5 -> 6');
      }

      if (REPLACE) {
        console.log('\nRemoving everything else in this programme');
        await removeOthers(program, roadmaps.filter(Boolean).map((r) => r.id));
      }

      console.log(DRY_RUN ? '\nDry run: nothing written.' : `\n✅ Six months, 24 weeks, ${totalTasks} tasks, chained.`);
    }
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error('❌ Failed:', error.message); process.exit(1); });
