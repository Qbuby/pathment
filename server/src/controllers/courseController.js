const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const courseService = require('../services/courseService');
const { requestedClanId } = require('../middlewares/portalScope');

// GET /api/courses/status — is an external course provider connected for this workspace?
const status = catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Course integration status', await courseService.status()));
});

// GET /api/courses — courses this workspace may assign (read live from the provider).
const list = catchAsync(async (req, res) => {
  const courses = await courseService.listCourses({ fresh: req.query.refresh === true });
  res.status(200).json(successResponse('Courses retrieved', { courses }));
});

// GET /api/courses/assignments/:taskId — a course task's enrollment + progress.
const getForTask = catchAsync(async (req, res) => {
  const enrollment = await courseService.getForTask(req.params.taskId, req.user, { refresh: req.query.refresh === true });
  res.status(200).json(successResponse('Course enrollment retrieved', { enrollment }));
});

// POST /api/courses/enrollments — enroll mentees ahead of assigning the course task.
const enroll = catchAsync(async (req, res) => {
  const result = await courseService.enrollLearners(req.body.courseId, req.body.menteeIds, req.user, requestedClanId(req));
  res.status(200).json(successResponse(`Enrolled ${result.enrolled} mentee(s)`, result));
});

// POST /api/courses/enrollments/release — cancel enrollments that were never assigned.
const release = catchAsync(async (req, res) => {
  const result = await courseService.releaseEnrollments(req.body.courseId, req.body.enrollments, req.user, requestedClanId(req));
  res.status(200).json(successResponse(`Released ${result.released} enrollment(s)`, result));
});

module.exports = { status, list, getForTask, enroll, release };
