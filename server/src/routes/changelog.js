const express = require('express');
const router = express.Router();
const changelogController = require('../controllers/changelogController');
const { authenticate } = require('../middlewares/auth');

// Anyone authenticated reads their own role-filtered "What's New" feed.
router.get('/', authenticate, changelogController.feed);
router.post('/seen', authenticate, changelogController.markSeen);

// Authoring moved to the platform console (/api/platform/updates): entries are
// GLOBAL - one row reaches every workspace's feed - so writing them is an
// operator action, not a tenant one.

module.exports = router;
