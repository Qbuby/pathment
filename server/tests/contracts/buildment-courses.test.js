'use strict';

/**
 * Buildment courses as Pathment tasks.
 *
 * Buildment is faked at the HTTP boundary (global fetch), so what is pinned
 * here is the wire contract itself: the two key headers, `student_email` on
 * enroll vs `email` on cancel, the assigned task's id as the stable
 * `external_assignment_id`, PENDING_ACCOUNT being a success, and Pathment only
 * ever READING progress.
 */

process.env.BUILDMENT_BASE_URL = 'http://buildment.test';

const request = require('supertest');
const app = require('../../src/index');
const { models, sequelize } = require('../../src/db');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram, createClan, authHeader } = require('../helpers/seed');
const appsAndCourses = require('../../scripts/migrations/127_external_apps_buildment_courses');

const KEYS = { accessKey: 'bm_access_key_1234', secretKey: 'bm_secret_key_5678' };
const COURSE = {
  course_id: 'cmv1xfm640005iwuz08kfezbx', course_slug: 'multi-vendor-marketplace', title: 'FreshMarket',
  description: 'Build a marketplace', price: 0, currency: 'USD', pricing_type: 'FREE', status: 'PUBLISHED',
  expires_at: null, available_enrollment_count: 99,
};

// ── fake Buildment ────────────────────────────────────────────────────────────
let calls;
let buildment; // per-test overrides: path → (call) => [status, body]
const realFetch = global.fetch;

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  if (url.origin !== 'http://buildment.test') return realFetch(input, init);
  const call = {
    method: init.method || 'GET',
    path: url.pathname.replace('/integrations/v1', ''),
    query: Object.fromEntries(url.searchParams),
    headers: init.headers || {},
    body: init.body ? JSON.parse(init.body) : null,
  };
  calls.push(call);
  if (call.headers['x-buildment-access-key'] !== KEYS.accessKey || call.headers['x-buildment-secret-key'] !== KEYS.secretKey) {
    return Promise.resolve(call.path === '/connection'
      ? json(401, { connected: false, error: 'Invalid integration credentials' })
      : json(401, { error: 'Invalid integration credentials' }));
  }
  const handler = buildment[`${call.method} ${call.path}`];
  if (!handler) return Promise.resolve(json(404, { error: 'Not found' }));
  const [status, body] = handler(call);
  return Promise.resolve(json(status, body));
}

const callsTo = (key) => calls.filter((c) => `${c.method} ${c.path}` === key);

// ── fixtures ──────────────────────────────────────────────────────────────────
let admin; let mentor; let mentee; let buildmentApp;

const as = (user) => ({
  get: (url) => request(app).get(url).set('Authorization', authHeader(user)),
  post: (url, body) => request(app).post(url).set('Authorization', authHeader(user)).send(body),
  delete: (url) => request(app).delete(url).set('Authorization', authHeader(user)),
});

const connect = (credentials = KEYS) => as(admin).post(`/api/apps/${buildmentApp.id}/connect`, { credentials });
const assign = (extra = {}) => as(mentor).post('/api/tasks/custom', {
  menteeId: mentee.id, type: 'course', title: 'Take FreshMarket', difficulty: 'medium',
  course: { courseId: COURSE.course_id }, ...extra,
});

beforeAll(async () => {
  await appsAndCourses.up({ db: sequelize });
  await appsAndCourses.up({ db: sequelize }); // idempotent
  global.fetch = fakeFetch;
});

afterAll(() => { global.fetch = realFetch; });

beforeEach(async () => {
  await cleanDb();
  await sequelize.query('TRUNCATE course_enrollments, organization_apps CASCADE');
  calls = [];
  buildment = {
    'GET /connection': () => [200, { connected: true, organization_slug: 'pathment', organization_name: 'Pathment' }],
    'GET /courses': () => [200, { courses: [COURSE] }],
    'POST /enrollments': (call) => [201, {
      enrollment_id: 'enr_1', course_id: call.body.course_id, learner_email: call.body.student_email,
      lifecycle: 'PENDING_ACCOUNT', created: true,
      external_mentor_id: call.body.mentor_id, external_assignment_id: call.body.external_assignment_id,
    }],
    'GET /progress': () => [200, {
      course_id: COURSE.course_id, lifecycle: 'ACTIVE', status: 'NOT_STARTED', overall_progress: 0,
      current_chapter: null, completed_lessons: 0, total_lessons: 379, completed: false,
    }],
    'POST /enrollments/cancel': () => [200, { cancelled: true, already_cancelled: false, enrollment: {} }],
  };
  admin = await createAdmin({ email: 'bm-admin@test.com' });
  mentor = await createMentor({ email: 'bm-mentor@test.com' });
  mentee = await createMentee({ email: 'BM-Mentee@test.com' });
  const program = await createProgram({ createdBy: admin.id });
  await createClan({ programId: program.id, createdBy: admin.id, leadMentor: mentor, mentees: [mentee] });
  // cleanDb truncates users CASCADE, which empties the catalog (created_by FK).
  [buildmentApp] = await models.ExternalApp.findOrCreate({
    where: { integrationKey: 'buildment' },
    defaults: { name: 'Buildment', type: 'course', integrationKey: 'buildment' },
  });
});

describe('connecting Buildment', () => {
  test('the catalog app asks for the two keys', async () => {
    const listed = await as(admin).get('/api/apps');
    const row = listed.body.data.apps.find((a) => a.id === buildmentApp.id);
    expect(row).toMatchObject({ connectable: true, connected: false });
    expect(row.credentialFields.map((f) => f.key)).toEqual(['accessKey', 'secretKey']);
  });

  test('wrong keys are refused and nothing is stored', async () => {
    const response = await connect({ accessKey: 'nope', secretKey: 'nope' });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Invalid integration credentials/);
    expect(await models.OrganizationApp.count({ skipOrganizationScope: true })).toBe(0);
    expect((await as(mentor).get('/api/courses/status')).body.data.connected).toBe(false);
  });

  test('verified keys are stored encrypted and never returned', async () => {
    const response = await connect();
    expect(response.status).toBe(200);
    expect(response.body.data.app).toMatchObject({ connected: true, status: 'connected', accountName: 'Pathment' });
    expect(JSON.stringify(response.body)).not.toContain(KEYS.secretKey);
    expect(JSON.stringify(response.body)).not.toContain(KEYS.accessKey);

    const [row] = await models.OrganizationApp.findAll({ skipOrganizationScope: true });
    expect(row.credentialsEncrypted).not.toContain(KEYS.secretKey);
    expect(row.metadata.organizationSlug).toBe('pathment');

    expect((await as(mentor).get('/api/courses/status')).body.data.connected).toBe(true);
    expect((await as(admin).post(`/api/apps/${buildmentApp.id}/test`)).body.data.status).toBe('connected');
  });

  test('an app without an integration cannot be connected', async () => {
    const other = await models.ExternalApp.create({ name: `Other ${Date.now()}`, type: 'other' });
    expect((await as(admin).post(`/api/apps/${other.id}/connect`, { credentials: {} })).status).toBe(400);
    await other.destroy();
  });
});

describe('courses for mentors', () => {
  test('nothing is listed until Buildment is connected', async () => {
    expect((await as(mentor).get('/api/courses')).status).toBe(409);
    await connect();
    const listed = await as(mentor).get('/api/courses');
    expect(listed.status).toBe(200);
    expect(listed.body.data.courses).toEqual([expect.objectContaining({
      courseId: COURSE.course_id, title: 'FreshMarket', pricingType: 'FREE', availableSeats: 99,
    })]);
  });

  test('a mentee cannot browse the catalog', async () => {
    await connect();
    expect((await as(mentee).get('/api/courses')).status).toBe(403);
  });
});

describe('assigning a course', () => {
  beforeEach(async () => { await connect(); calls = []; });

  test('enrolls with Buildment\'s field names and the task id as the assignment id', async () => {
    const response = await assign();
    expect(response.status).toBe(201);
    const task = response.body.data.task;

    const [enroll] = callsTo('POST /enrollments');
    expect(enroll.body).toEqual({
      student_email: 'bm-mentee@test.com',
      course_id: COURSE.course_id,
      external_assignment_id: task.id,
      mentor_id: mentor.id,
    });
    expect(enroll.headers['Content-Type']).toBe('application/json');
    expect(enroll.headers.Authorization).toBeUndefined();

    // PENDING_ACCOUNT is a successful enrollment, shown to the mentee as "register".
    const seen = await as(mentee).get(`/api/courses/assignments/${task.id}`);
    expect(seen.status).toBe(200);
    expect(seen.body.data.enrollment).toMatchObject({
      courseTitle: 'FreshMarket', lifecycle: 'PENDING_ACCOUNT', overallProgress: 0, learnerEmail: 'bm-mentee@test.com',
    });
  });

  test('a course outside Buildment\'s list is refused before anything is created', async () => {
    const response = await assign({ course: { courseId: 'not-a-buildment-id' } });
    expect(response.status).toBe(400);
    expect(callsTo('POST /enrollments')).toHaveLength(0);
    expect(await models.AssignedTask.count()).toBe(0);
  });

  test('no seats leaves no task behind', async () => {
    buildment['POST /enrollments'] = () => [403, { error: 'No capacity', code: 'CAPACITY' }];
    const response = await assign();
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/No seats/);
    expect(await models.AssignedTask.count()).toBe(0);
    expect(await models.CourseEnrollment.count()).toBe(0);
  });

  test('a course task cannot be handed in as ordinary work', async () => {
    const task = (await assign()).body.data.task;
    const response = await as(mentee).post(`/api/submissions/${task.id}`, { submissionText: 'done' });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await models.TaskSubmission.count()).toBe(0);
  });
});

describe('progress', () => {
  let task;
  const stale = () => models.CourseEnrollment.update({ lastSyncedAt: new Date(Date.now() - 3600e3) }, { where: { assignedTaskId: task.id } });

  beforeEach(async () => {
    await connect();
    task = (await assign()).body.data.task;
    calls = [];
    await stale();
  });

  test('is read from Buildment and moves the task to in progress', async () => {
    buildment['GET /progress'] = () => [200, {
      lifecycle: 'ACTIVE', status: 'IN_PROGRESS', overall_progress: 40,
      current_chapter: { id: 'c1', title: 'Auth', progress: 40 }, completed_lessons: 150, total_lessons: 379, completed: false,
    }];
    const seen = await as(mentor).get(`/api/courses/assignments/${task.id}`);
    expect(seen.body.data.enrollment).toMatchObject({
      lifecycle: 'ACTIVE', overallProgress: 40, completedLessons: 150, totalLessons: 379, taskStatus: 'in_progress',
    });
    expect(callsTo('GET /progress')[0].query).toEqual({ course_id: COURSE.course_id, learner_email: 'bm-mentee@test.com' });
    // Read-only: nothing but GETs after the enrollment.
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  test('finishing the course completes the task and awards its points', async () => {
    buildment['GET /progress'] = () => [200, {
      lifecycle: 'COMPLETED', status: 'COMPLETED', overall_progress: 100,
      current_chapter: null, completed_lessons: 379, total_lessons: 379, completed: true,
    }];
    const seen = await as(mentee).get(`/api/courses/assignments/${task.id}`);
    expect(seen.body.data.enrollment).toMatchObject({ lifecycle: 'COMPLETED', overallProgress: 100, taskStatus: 'completed' });
    const row = await models.AssignedTask.findByPk(task.id);
    expect(row.status).toBe('completed');
    expect(row.pointsAwarded).toBeGreaterThan(0);

    // A later read does not complete it twice.
    await stale();
    await as(mentee).get(`/api/courses/assignments/${task.id}`);
    expect(await models.TaskSubmission.count({ where: { assignedTaskId: task.id } })).toBe(1);
  });

  test('a Buildment outage still shows the last snapshot', async () => {
    buildment['GET /progress'] = () => [500, { error: 'boom' }];
    const seen = await as(mentee).get(`/api/courses/assignments/${task.id}`);
    expect(seen.status).toBe(200);
    expect(seen.body.data.enrollment.lifecycle).toBe('PENDING_ACCOUNT');
    expect(seen.body.data.enrollment.syncError).toBeTruthy();
  });

  test('another mentee cannot read it', async () => {
    const stranger = await createMentee({ email: 'bm-stranger@test.com' });
    expect((await as(stranger).get(`/api/courses/assignments/${task.id}`)).status).toBe(403);
  });

  test('rejected keys switch the integration off', async () => {
    buildment['GET /progress'] = () => [401, { error: 'Invalid integration credentials' }];
    await as(mentee).get(`/api/courses/assignments/${task.id}`);
    expect((await as(mentor).get('/api/courses/status')).body.data.connected).toBe(false);
  });
});

describe('unassigning a course', () => {
  let task;
  beforeEach(async () => {
    await connect();
    task = (await assign()).body.data.task;
    calls = [];
  });

  test('cancelling the task cancels the enrollment with `email` and the org slug', async () => {
    const response = await as(mentor).post(`/api/tasks/${task.id}/cancel`, { reason: 'changed plan' });
    expect(response.status).toBeLessThan(300);
    const [cancel] = callsTo('POST /enrollments/cancel');
    expect(cancel.body).toEqual({
      org_slug: 'pathment', email: 'bm-mentee@test.com', course_id: COURSE.course_id, external_assignment_id: task.id,
    });
    const row = await models.CourseEnrollment.findOne({ where: { assignedTaskId: task.id } });
    expect(row.lifecycle).toBe('CANCELLED');
  });

  test('if Buildment cannot cancel, the task is left as it was', async () => {
    buildment['POST /enrollments/cancel'] = () => [500, { error: 'boom' }];
    const response = await as(mentor).post(`/api/tasks/${task.id}/cancel`, {});
    expect(response.status).toBe(502);
    expect((await models.AssignedTask.findByPk(task.id)).status).toBe('assigned');
  });
});

describe('enrolling before assigning', () => {
  const enrollFirst = (menteeIds = [mentee.id]) => as(mentor).post('/api/courses/enrollments', { courseId: COURSE.course_id, menteeIds });

  beforeEach(async () => {
    await connect();
    calls = [];
    // Buildment remembers what it enrolled, so lookups answer like the real API.
    const held = [];
    buildment['POST /enrollments'] = (call) => {
      const known = held.find((e) => e.external_assignment_id === call.body.external_assignment_id);
      const row = known || {
        enrollment_id: `enr_${held.length + 1}`, course_id: call.body.course_id, learner_email: call.body.student_email,
        lifecycle: 'PENDING_ACCOUNT', external_assignment_id: call.body.external_assignment_id,
      };
      if (!known) held.push(row);
      return [known ? 200 : 201, { ...row, created: !known }];
    };
    buildment['GET /enrollments'] = (call) => {
      const row = held.find((e) => (call.query.external_assignment_id
        ? e.external_assignment_id === call.query.external_assignment_id
        : e.course_id === call.query.course_id && e.learner_email === call.query.learner_email));
      return row ? [200, { enrollment: row }] : [404, { error: 'Enrollment not found' }];
    };
  });

  test('enroll takes the seat without a task; assigning then reuses that enrollment', async () => {
    const enrolled = await enrollFirst();
    expect(enrolled.status).toBe(200);
    const [result] = enrolled.body.data.results;
    expect(result).toMatchObject({ menteeId: mentee.id, ok: true, lifecycle: 'PENDING_ACCOUNT', learnerEmail: 'bm-mentee@test.com' });
    expect(callsTo('POST /enrollments')[0].body).toEqual({
      student_email: 'bm-mentee@test.com', course_id: COURSE.course_id,
      external_assignment_id: result.assignmentId, mentor_id: mentor.id,
    });
    expect(await models.AssignedTask.count()).toBe(0);

    const response = await assign({ course: { courseId: COURSE.course_id, assignmentId: result.assignmentId } });
    expect(response.status).toBe(201);
    // The task IS the enrollment's assignment id, and nothing was enrolled twice.
    expect(response.body.data.task.id).toBe(result.assignmentId);
    expect(callsTo('POST /enrollments')).toHaveLength(1);
    const row = await models.CourseEnrollment.findOne({ where: { assignedTaskId: result.assignmentId } });
    expect(row).toMatchObject({ courseId: COURSE.course_id, learnerEmail: 'bm-mentee@test.com', externalEnrollmentId: 'enr_1' });
  });

  test('enrolling again reuses the seat already held', async () => {
    const first = (await enrollFirst()).body.data.results[0];
    const second = (await enrollFirst()).body.data.results[0];
    expect(second.assignmentId).toBe(first.assignmentId);
  });

  test('a refused enrollment is reported and nothing can be assigned from it', async () => {
    buildment['POST /enrollments'] = () => [403, { error: 'No capacity', code: 'CAPACITY' }];
    const [result] = (await enrollFirst()).body.data.results;
    expect(result).toMatchObject({ ok: false, code: 'COURSE_CAPACITY' });

    const response = await assign({ course: { courseId: COURSE.course_id, assignmentId: '7f1f3c0e-5d0b-4a8e-9b1f-0d7b0a5f3c11' } });
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/enroll them first/);
    expect(await models.AssignedTask.count()).toBe(0);
  });

  test('an enrollment made for one mentee cannot be assigned to another', async () => {
    const other = await createMentee({ email: 'bm-other@test.com' });
    const [result] = (await enrollFirst()).body.data.results;
    const response = await assign({ menteeId: other.id, course: { courseId: COURSE.course_id, assignmentId: result.assignmentId } });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await models.AssignedTask.count()).toBe(0);
  });

  test('an unassigned enrollment can be released; a task\'s enrollment cannot', async () => {
    const [result] = (await enrollFirst()).body.data.results;
    const release = (assignmentId) => as(mentor).post('/api/courses/enrollments/release', {
      courseId: COURSE.course_id, enrollments: [{ menteeId: mentee.id, assignmentId }],
    });
    expect((await release(result.assignmentId)).body.data.released).toBe(1);
    expect(callsTo('POST /enrollments/cancel')[0].body).toEqual({
      org_slug: 'pathment', email: 'bm-mentee@test.com', course_id: COURSE.course_id, external_assignment_id: result.assignmentId,
    });

    const task = (await assign()).body.data.task;
    calls = [];
    expect((await release(task.id)).body.data.released).toBe(0);
    expect(callsTo('POST /enrollments/cancel')).toHaveLength(0);
  });

  test('a mentee cannot enroll anyone', async () => {
    expect((await as(mentee).post('/api/courses/enrollments', { courseId: COURSE.course_id, menteeIds: [mentee.id] })).status).toBe(403);
  });
});
