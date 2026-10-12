'use strict';

const Joi = require('joi');

const courseSchemas = {
  taskParam: Joi.object({
    taskId: Joi.string().uuid().required(),
  }),

  // `refresh=true` asks for a re-read from the provider (rate-limited in the service).
  refreshQuery: Joi.object({
    refresh: Joi.boolean().optional(),
  }),

  // Enroll mentees in a course ahead of assigning it as a task.
  enrollBody: Joi.object({
    courseId: Joi.string().trim().max(120).required(),
    menteeIds: Joi.array().items(Joi.string().uuid()).min(1).max(200).unique().required(),
    clanId: Joi.string().uuid().optional(),
  }),

  // Give back enrollments that were never assigned.
  releaseBody: Joi.object({
    courseId: Joi.string().trim().max(120).required(),
    enrollments: Joi.array().items(Joi.object({
      menteeId: Joi.string().uuid().required(),
      assignmentId: Joi.string().uuid().required(),
    })).min(1).max(200).required(),
    clanId: Joi.string().uuid().optional(),
  }),
};

module.exports = { courseSchemas };
