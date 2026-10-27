const express = require('express');
const router = express.Router();
const c = require('../controllers/courseController');
const { authenticate } = require('../middlewares/auth');
const { requirePermissionAnyScope } = require('../middlewares/authz');
const { validateQuery, validateParams, validateBody } = require('../middlewares/validate');
const { courseSchemas } = require('../validations/courseValidation');
const { PERMISSIONS } = require('../config/permissions');

router.use(authenticate);

// Browsing assignable courses is a task-authoring action — any mentor/admin who
// can assign tasks somewhere. Enrolling (here, ahead of the task, or as part of
// POST /api/tasks/custom) enforces task.assign on each mentee's clan.
const canAssign = requirePermissionAnyScope(PERMISSIONS.TASK_ASSIGN);

router.get('/status', canAssign, c.status);
router.get('/', canAssign, validateQuery(courseSchemas.refreshQuery), c.list);
router.post('/enrollments', canAssign, validateBody(courseSchemas.enrollBody), c.enroll);
router.post('/enrollments/release', canAssign, validateBody(courseSchemas.releaseBody), c.release);

// The mentee, their mentors and admins — the service asserts access to the task.
router.get('/assignments/:taskId', validateParams(courseSchemas.taskParam), validateQuery(courseSchemas.refreshQuery), c.getForTask);

module.exports = router;
