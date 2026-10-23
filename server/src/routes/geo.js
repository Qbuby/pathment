const express = require('express');
const router = express.Router();
const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const geoService = require('../services/geoService');
const { authenticate } = require('../middlewares/auth');

/**
 * Reference geography: countries, their regions, their cities, and the
 * timezone a country implies.
 *
 * Static reference data — the same for everybody — so it is cached hard and
 * holds nothing about the caller. Authentication is still required: it is a
 * lookup for signed-in forms, not a public dataset mirror.
 */
router.use(authenticate);

// A day: borders do not move often, and this is the hot path of every
// profile form.
const cacheADay = (_req, res, next) => {
  res.set('Cache-Control', 'private, max-age=86400');
  next();
};

router.get('/countries', cacheADay, catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Countries retrieved', { countries: geoService.countries() }));
}));

router.get('/countries/:code/timezones', cacheADay, catchAsync(async (req, res) => {
  res.status(200).json(successResponse('Timezones retrieved', geoService.timezonesFor(req.params.code)));
}));

router.get('/countries/:code/states', cacheADay, catchAsync(async (req, res) => {
  const states = geoService.states(req.params.code, { q: req.query.q });
  res.status(200).json(successResponse('States retrieved', { states }));
}));

router.get('/countries/:code/cities', cacheADay, catchAsync(async (req, res) => {
  const { state, q, limit } = req.query;
  res.status(200).json(successResponse('Cities retrieved', geoService.cities(req.params.code, { state, q, limit })));
}));

module.exports = router;
