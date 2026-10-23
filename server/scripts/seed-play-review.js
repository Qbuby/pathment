/**
 * Google Play review workspace fixture.
 *
 * This is deliberately narrower and safer than seed-demo.js:
 * - it only runs for the exact play-review workspace and owner email;
 * - it never creates or changes the reviewer's password;
 * - it never deletes customer data;
 * - it is idempotent and runs in one transaction under an advisory lock;
 * - every badge is explicitly owned by this organization and has criteria.
 *
 * Required confirmation:
 *   PLAY_REVIEW_SEED_CONFIRM=play-review npm run seed:play-review
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, models } = require('../src/db');
const { runWithRequestContext } = require('../src/utils/auditContext');

const WORKSPACE_SLUG = 'play-review';
const OWNER_EMAIL = 'play-review-admin@pathment.me';
const CONFIRMATION = 'play-review';
const MARKER = 'google-play-review-v1';
const DAY = 86_400_000;
const now = () => new Date();
const daysAgo = value => new Date(Date.now() - value * DAY);
const daysAhead = value => new Date(Date.now() + value * DAY);
const dateKey = date => date.toISOString().slice(0, 10);

function assertGuardrails() {
  if (process.env.PLAY_REVIEW_SEED_CONFIRM !== CONFIRMATION) {
    throw new Error(`Refusing to seed: set PLAY_REVIEW_SEED_CONFIRM=${CONFIRMATION}`);
  }
  if (process.env.PLAY_REVIEW_WORKSPACE && process.env.PLAY_REVIEW_WORKSPACE !== WORKSPACE_SLUG) {
    throw new Error(`Refusing to seed a workspace other than ${WORKSPACE_SLUG}`);
  }
  if (process.env.PLAY_REVIEW_OWNER_EMAIL &&
      process.env.PLAY_REVIEW_OWNER_EMAIL.toLowerCase() !== OWNER_EMAIL) {
    throw new Error(`Refusing to seed an owner other than ${OWNER_EMAIL}`);
  }
}

async function ensureFixtureUser({ email, firstName, lastName, role, capabilities }, transaction, passwordHash) {
  let user = await models.User.findOne({
    where: { email }, paranoid: false, skipOrganizationScope: true, transaction,
  });
  if (user?.deletedAt) throw new Error(`Fixture identity ${email} is deleted; refusing to revive it`);
  if (!user) {
    user = await models.User.create({
      email, firstName, lastName, role, capabilities, status: 'active',
      emailVerified: true, emailVerifiedAt: now(), passwordHash,
    }, { transaction, skipOrganizationScope: true });
  } else {
    const memberships = await models.OrganizationMembership.findAll({
      where: { userId: user.id }, skipOrganizationScope: true, transaction,
    });
    if (memberships.some(row => row.organizationId !== transaction.reviewOrganizationId)) {
      throw new Error(`Fixture identity ${email} already belongs to another workspace`);
    }
    await user.update({ firstName, lastName, role, capabilities, status: 'active', emailVerified: true,
      emailVerifiedAt: user.emailVerifiedAt || now() }, { transaction });
  }
  await models.OrganizationMembership.findOrCreate({
    where: { organizationId: transaction.reviewOrganizationId, userId: user.id },
    defaults: { role: 'member', status: 'active', joinedAt: now(), invitedBy: transaction.reviewOwnerId },
    transaction, skipOrganizationScope: true,
  });
  await models.OrganizationMembership.update({ status: 'active' }, {
    where: { organizationId: transaction.reviewOrganizationId, userId: user.id },
    transaction, skipOrganizationScope: true,
  });
  return user;
}

async function findOrCreate(model, where, defaults, transaction) {
  const [row] = await model.findOrCreate({ where, defaults: { ...where, ...defaults }, transaction });
  await row.update(defaults, { transaction });
  return row;
}

async function ensureProfiles(user, roles, transaction) {
  if (roles.includes('admin')) {
    await findOrCreate(models.AdminProfile, { userId: user.id }, {
      department: 'Product Review', canCreatePrograms: true, canManageUsers: true,
      canViewAnalytics: true, lastActiveAt: now(),
    }, transaction);
  }
  if (roles.includes('mentor')) {
    await findOrCreate(models.MentorProfile, { userId: user.id }, {
      title: 'Product Engineering Mentor', organization: 'Pathment Review Workspace',
      yearsOfExperience: 7, specialization: ['Product engineering', 'Mobile UX', 'React Native'],
      maxMentees: 12, currentMenteeCount: 4, totalMenteesGuided: 18,
      successRate: 92, avgFeedbackRating: 4.8, totalTasksReviewed: 46,
      isAcceptingMentees: true, preferredMenteeLevel: ['beginner', 'intermediate'],
    }, transaction);
  }
  if (roles.includes('mentee')) {
    await findOrCreate(models.MenteeProfile, { userId: user.id }, {
      currentOccupation: 'Associate Product Developer',
      learningGoals: ['Ship accessible mobile experiences', 'Build reliable offline flows'],
      interests: ['React Native', 'Product design', 'Accessibility'],
      priorExperience: 'Built small web applications and is now moving into mobile product development.',
      preferredLearningStyle: 'project_based', totalProgramsEnrolled: 1,
      totalTasksCompleted: 2, avgTaskRating: 4.7, currentStreakDays: 6,
      longestStreakDays: 11, lastActivityDate: dateKey(now()), totalPoints: 240,
      currentLevel: 2, totalBadgesEarned: 2,
    }, transaction);
  }
}

async function seed() {
  assertGuardrails();
  return sequelize.transaction(async transaction => {
    await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('google-play-review-v1'))", { transaction });

    const owner = await models.User.findOne({
      where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), OWNER_EMAIL),
      paranoid: false, skipOrganizationScope: true, transaction,
    });
    if (!owner || owner.deletedAt) throw new Error(`Create ${OWNER_EMAIL} through signup before seeding`);
    const organization = await models.Organization.findOne({
      where: { slug: WORKSPACE_SLUG }, paranoid: false, transaction,
    });
    if (!organization || organization.deletedAt) throw new Error(`Create workspace ${WORKSPACE_SLUG} before seeding`);
    const ownerMembership = await models.OrganizationMembership.findOne({
      where: { organizationId: organization.id, userId: owner.id, status: 'active' },
      skipOrganizationScope: true, transaction,
    });
    if (!ownerMembership || ownerMembership.role !== 'owner') {
      throw new Error(`${OWNER_EMAIL} must be the active owner of ${WORKSPACE_SLUG}`);
    }
    const otherActiveMemberships = await models.OrganizationMembership.count({
      where: {
        userId: owner.id,
        status: 'active',
        organizationId: { [Op.ne]: organization.id },
      },
      skipOrganizationScope: true,
      transaction,
    });
    if (otherActiveMemberships > 0) {
      throw new Error(
        `${OWNER_EMAIL} must be dedicated to ${WORKSPACE_SLUG}; revoke other active workspace memberships first`
      );
    }

    transaction.reviewOrganizationId = organization.id;
    transaction.reviewOwnerId = owner.id;
    const existingFixture = organization.settings?.reviewFixture;
    if (existingFixture && existingFixture !== MARKER) {
      throw new Error('Workspace contains a different review fixture; refusing to overwrite it');
    }

    await owner.update({
      status: 'active', emailVerified: true, emailVerifiedAt: owner.emailVerifiedAt || now(),
      role: 'admin', capabilities: ['admin', 'mentor', 'mentee'], profileCompleted: true,
    }, { transaction });
    await models.EmailVerificationToken.update({ usedAt: now() }, {
      where: { userId: owner.id, usedAt: null }, transaction,
    });
    await ownerMembership.update({ role: 'owner', status: 'active', joinedAt: ownerMembership.joinedAt || now() }, { transaction });
    await organization.update({
      name: 'Pathment Mobile Review', timezone: 'UTC', primaryColor: '#087F73', status: 'active',
      settings: { ...(organization.settings || {}), reviewFixture: MARKER, reviewPurpose: 'Google Play app review' },
    }, { transaction });

    await runWithRequestContext({
      organizationId: organization.id, organizationSlug: organization.slug, userId: owner.id,
    }, async () => {
      await ensureProfiles(owner, ['admin', 'mentor', 'mentee'], transaction);
      const fixturePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      const mentor = await ensureFixtureUser({
        email: 'play-review+mentor@pathment.me', firstName: 'Sofia', lastName: 'Rivera',
        role: 'mentor', capabilities: ['mentor'],
      }, transaction, fixturePasswordHash);
      const learnerSpecs = [
        ['play-review+amina@pathment.me', 'Amina', 'Yusuf'],
        ['play-review+daniel@pathment.me', 'Daniel', 'Kim'],
        ['play-review+noor@pathment.me', 'Noor', 'Hassan'],
        ['play-review+ethan@pathment.me', 'Ethan', 'Brooks'],
      ];
      const learners = [];
      for (const [email, firstName, lastName] of learnerSpecs) {
        learners.push(await ensureFixtureUser({ email, firstName, lastName, role: 'mentee', capabilities: ['mentee'] },
          transaction, fixturePasswordHash));
      }
      await ensureProfiles(mentor, ['mentor'], transaction);
      for (const learner of learners) await ensureProfiles(learner, ['mentee'], transaction);

      const program = await findOrCreate(models.Program, { name: 'Mobile Product Launch Fellowship' }, {
        createdBy: owner.id,
        description: 'A practical eight-week mentorship program for designing, building, testing, and shipping an accessible mobile product.',
        type: 'mentorship', status: 'published', visibility: 'private', totalDurationWeeks: 8,
        estimatedHoursPerWeek: 8, startDate: dateKey(daysAgo(28)), endDate: dateKey(daysAhead(28)),
        maxEnrollments: 24, tags: ['mobile', 'product', 'accessibility'],
        learningOutcomes: ['Ship a tested mobile feature', 'Use feedback to improve a release', 'Communicate progress clearly'],
        prerequisites: ['Basic JavaScript knowledge'], targetAudience: 'Early-career product developers',
        publishedAt: daysAgo(35),
      }, transaction);
      const cohort = await findOrCreate(models.Cohort, { programId: program.id, name: 'Play Store Review Cohort' }, {
        description: 'An active cohort with realistic review data.', status: 'running', capacity: 24,
        startDate: dateKey(daysAgo(28)), endDate: dateKey(daysAhead(28)), timezone: 'UTC',
        levels: [{ key: 'foundation', label: 'Foundation' }, { key: 'builder', label: 'Builder' }],
        createdBy: owner.id,
      }, transaction);
      const learnerClan = await findOrCreate(models.Clan, { programId: program.id, name: 'Launch Lab' }, {
        description: 'A supportive team shipping a polished release candidate.', leadMentorId: mentor.id,
        tags: ['mobile', 'product'], levels: ['foundation', 'builder'], maxMentees: 12,
        status: 'active', healthStatus: 'green', createdBy: owner.id,
      }, transaction);
      const mentorClan = await findOrCreate(models.Clan, { programId: program.id, name: 'Product Builders' }, {
        description: 'A mentor-led team focused on product quality and peer feedback.', leadMentorId: owner.id,
        tags: ['mentorship', 'delivery'], levels: ['builder'], maxMentees: 12,
        status: 'active', healthStatus: 'amber', createdBy: owner.id,
      }, transaction);

      const mentees = [owner, ...learners];
      const enrollments = new Map();
      for (const [index, mentee] of mentees.entries()) {
        const enrollment = await findOrCreate(models.Enrollment, { menteeId: mentee.id, programId: program.id }, {
          cohortId: cohort.id, status: 'active', currentWeek: 4, tasksCompleted: index === 0 ? 2 : Math.max(1, 4 - index),
          tasksTotal: 5, overallProgressPercentage: index === 0 ? 40 : Math.max(20, 80 - index * 15),
          enrolledAt: daysAgo(28), startedAt: daysAgo(27), expectedCompletionDate: dateKey(daysAhead(28)),
          avgTaskRating: index === 0 ? 4.7 : 4.3, totalPointsEarned: index === 0 ? 240 : Math.max(90, 260 - index * 35),
        }, transaction);
        enrollments.set(mentee.id, enrollment);
        const clan = index < 3 ? learnerClan : mentorClan;
        await findOrCreate(models.ClanMembership, { clanId: clan.id, userId: mentee.id, role: 'mentee' }, {
          enrollmentId: enrollment.id, status: 'active', joinedAt: daysAgo(28),
        }, transaction);
      }
      await findOrCreate(models.ClanMembership, { clanId: learnerClan.id, userId: mentor.id, role: 'lead_mentor' }, {
        status: 'active', joinedAt: daysAgo(30),
      }, transaction);
      await findOrCreate(models.ClanMembership, { clanId: mentorClan.id, userId: owner.id, role: 'lead_mentor' }, {
        status: 'active', joinedAt: daysAgo(30),
      }, transaction);

      const roadmap = await findOrCreate(models.Roadmap, { programId: program.id, name: 'From insight to release' }, {
        description: 'Five practical steps from user discovery to a production-ready mobile release.',
        isBaseRoadmap: true, totalWeeks: 8, totalTasks: 5, estimatedTotalHours: 40,
        source: 'org', published: true, skillTags: ['research', 'accessibility', 'mobile', 'delivery'],
      }, transaction);
      const stepSpecs = [
        ['Understand the user journey', 'Interview users and map the moments that matter.', 'research summary and journey map', ['Names the primary user need', 'Includes evidence from interviews'], 'assignment', 'easy', 40],
        ['Design accessible onboarding', 'Create an onboarding flow that works with screen readers and large text.', 'accessible onboarding prototype', ['Has clear focus order', 'Supports dynamic text'], 'project', 'medium', 60],
        ['Build the offline task flow', 'Implement cached task viewing and a reliable queued submission.', 'working offline-first task flow', ['Tasks open offline', 'Queued work retries safely'], 'practical', 'hard', 90],
        ['Run a release health check', 'Capture progress, blockers, crash risk, and readiness in one review.', 'release health report', ['Lists blockers and owners', 'Includes a release recommendation'], 'assessment', 'medium', 55],
        ['Ship the release candidate', 'Prepare a tested build and concise release notes.', 'signed release candidate and notes', ['Critical paths are tested', 'Release notes are clear'], 'project', 'hard', 120],
      ];
      const steps = [];
      for (const [index, spec] of stepSpecs.entries()) {
        const [title, description, deliverable, acceptanceCriteria, type, difficulty, pointsBase] = spec;
        const step = await findOrCreate(models.RoadmapTask, { roadmapId: roadmap.id, title }, {
          description, type, difficulty, taskOrder: index + 1, deliverable, acceptanceCriteria,
          estimatedHours: [4, 7, 12, 6, 11][index], effort: ['s', 'm', 'l', 'm', 'l'][index],
          dueOffsetDays: (index + 1) * 7, isMandatory: true, pointsBase,
        }, transaction);
        steps.push(step);
        await findOrCreate(models.TaskResource, { roadmapTaskId: step.id, title: 'Review guide' }, {
          resourceType: 'article', url: 'https://pathment.me',
          description: 'A concise reference for completing this step.', isRequired: false, displayOrder: 1,
        }, transaction);
      }

      const ownerEnrollment = enrollments.get(owner.id);
      await findOrCreate(models.RoadmapProgress, { roadmapId: roadmap.id, menteeId: owner.id, clanId: learnerClan.id }, {
        enrollmentId: ownerEnrollment.id, currentStep: 2, completed: false, startedAt: daysAgo(27),
      }, transaction);
      const ownerTasks = [];
      const statuses = ['completed', 'completed', 'submitted', 'in_progress', 'assigned'];
      for (const [index, step] of steps.entries()) {
        const status = statuses[index];
        ownerTasks.push(await findOrCreate(models.AssignedTask, {
          menteeId: owner.id, roadmapTaskId: step.id, clanId: learnerClan.id,
        }, {
          mentorId: mentor.id, enrollmentId: ownerEnrollment.id, status, assignedAt: daysAgo(27 - index * 5),
          dueDate: daysAhead(index * 5 - 7), startedAt: index < 4 ? daysAgo(24 - index * 5) : null,
          submittedAt: index < 3 ? daysAgo(18 - index * 5) : null,
          completedAt: index < 2 ? daysAgo(17 - index * 5) : null,
          currentSubmissionVersion: index < 3 ? 1 : 0, timeSpentHours: index < 3 ? 5 + index * 2 : 2,
          finalRating: index < 2 ? 4.7 : null, pointsAwarded: index < 2 ? step.pointsBase : 0,
          pointsBase: step.pointsBase, isLate: false,
        }, transaction));
      }
      for (let index = 0; index < 3; index += 1) {
        const task = ownerTasks[index];
        const submission = await findOrCreate(models.TaskSubmission, { assignedTaskId: task.id, version: 1 }, {
          submissionText: index === 2
            ? 'Implemented cached task viewing, an explicit offline state, and a retry-safe submission queue.'
            : 'Completed the deliverable with evidence, accessibility notes, and a short reflection.',
          submissionUrls: ['https://github.com/pathment/pathment'],
          status: index < 2 ? 'approved' : 'pending', submittedAt: task.submittedAt,
          reviewedAt: index < 2 ? task.completedAt : null,
        }, transaction);
        if (index < 2) {
          await findOrCreate(models.TaskFeedback, { assignedTaskId: task.id, submissionId: submission.id, mentorId: mentor.id }, {
            feedbackText: index === 0
              ? 'Strong evidence and a clear journey. Keep the user quotes in the final presentation.'
              : 'The focus order and large-text states are thoughtful and ready to build.',
            rating: index === 0 ? 4.6 : 4.8, isApproved: true, decision: 'approved_notes',
            checkedCriteria: steps[index].acceptanceCriteria, criteriaMet: { all: true }, feedbackType: 'general',
          }, transaction);
        }
      }

      const learnerCompletion = [4, 3, 1, 2];
      const learnerPoints = [310, 225, 85, 150];
      for (const [learnerIndex, learner] of learners.entries()) {
        const menteeIndex = learnerIndex + 1;
        const clan = menteeIndex < 3 ? learnerClan : mentorClan;
        const assignedMentor = clan.id === learnerClan.id ? mentor : owner;
        const enrollment = enrollments.get(learner.id);
        const completedCount = learnerCompletion[learnerIndex];
        await findOrCreate(models.RoadmapProgress, { roadmapId: roadmap.id, menteeId: learner.id, clanId: clan.id }, {
          enrollmentId: enrollment.id, currentStep: completedCount, completed: false, startedAt: daysAgo(27),
        }, transaction);
        let reviewTask = null;
        for (const [stepIndex, step] of steps.entries()) {
          const completed = stepIndex < completedCount;
          const awaitingReview = learnerIndex === 1 && stepIndex === completedCount;
          const status = completed ? 'completed' : awaitingReview ? 'submitted' :
            stepIndex === completedCount ? 'in_progress' : 'assigned';
          const task = await findOrCreate(models.AssignedTask, {
            menteeId: learner.id, roadmapTaskId: step.id, clanId: clan.id,
          }, {
            mentorId: assignedMentor.id, enrollmentId: enrollment.id, status,
            assignedAt: daysAgo(27 - stepIndex * 4), dueDate: daysAhead(stepIndex * 5 - 6),
            startedAt: stepIndex <= completedCount ? daysAgo(Math.max(1, 23 - stepIndex * 4)) : null,
            submittedAt: completed || awaitingReview ? daysAgo(Math.max(1, 20 - stepIndex * 4)) : null,
            completedAt: completed ? daysAgo(Math.max(1, 19 - stepIndex * 4)) : null,
            currentSubmissionVersion: completed || awaitingReview ? 1 : 0,
            timeSpentHours: completed || awaitingReview ? 4 + stepIndex : 1,
            finalRating: completed ? 4.2 + learnerIndex * 0.1 : null,
            pointsAwarded: completed ? step.pointsBase : 0, pointsBase: step.pointsBase,
            isLate: learnerIndex === 2 && status === 'in_progress',
          }, transaction);
          if (awaitingReview) reviewTask = task;
          if (completed || awaitingReview) {
            const submission = await findOrCreate(models.TaskSubmission, { assignedTaskId: task.id, version: 1 }, {
              submissionText: awaitingReview
                ? 'Built the offline task flow and attached test notes for mentor review.'
                : 'Completed the task with evidence, a short reflection, and the requested deliverable.',
              submissionUrls: ['https://github.com/pathment/pathment'],
              status: completed ? 'approved' : 'pending', submittedAt: task.submittedAt,
              reviewedAt: completed ? task.completedAt : null,
            }, transaction);
            if (completed) {
              await findOrCreate(models.TaskFeedback, {
                assignedTaskId: task.id, submissionId: submission.id, mentorId: assignedMentor.id,
              }, {
                feedbackText: 'Clear work, good evidence, and a thoughtful reflection. Carry this standard into the next milestone.',
                rating: 4.2 + learnerIndex * 0.1, isApproved: true, decision: 'approved_notes',
                checkedCriteria: step.acceptanceCriteria, criteriaMet: { all: true }, feedbackType: 'general',
              }, transaction);
            }
          }
        }
        await models.MenteeProfile.update({
          totalTasksCompleted: completedCount, totalPoints: learnerPoints[learnerIndex],
          currentStreakDays: [8, 5, 1, 3][learnerIndex], longestStreakDays: [14, 9, 4, 7][learnerIndex],
          lastActivityDate: dateKey(daysAgo([0, 1, 6, 2][learnerIndex])),
          avgTaskRating: [4.7, 4.5, 4.1, 4.3][learnerIndex],
        }, { where: { userId: learner.id }, transaction });
        if (reviewTask) {
          await findOrCreate(models.Notification, {
            userId: owner.id, title: `${learner.firstName} submitted work`, relatedEntityId: reviewTask.id,
          }, {
            type: 'task', audience: 'mentor', message: 'An offline task-flow submission is ready for review.',
            status: 'unread', actionUrl: '/mentor/tasks/review', actionLabel: 'Review now',
            relatedEntityType: MARKER, clanId: clan.id, sentAt: daysAgo(1), emailSent: false,
          }, transaction);
        }
        await findOrCreate(models.LeaderboardEntry, {
          userId: learner.id, programId: program.id, periodType: 'all_time', periodStart: program.startDate,
        }, {
          rank: [1, 3, 5, 4][learnerIndex], points: learnerPoints[learnerIndex],
          periodEnd: program.endDate, isVisible: true,
        }, transaction);
      }
      await findOrCreate(models.Blocker, { menteeId: owner.id, assignedTaskId: ownerTasks[3].id }, {
        clanId: learnerClan.id, title: 'Need to confirm Android background retry behavior on a low-connectivity device.',
        category: 'technical', severity: 'medium', status: 'open', createdBy: owner.id, openedAt: daysAgo(1),
      }, transaction);
      for (let offset = 0; offset < 6; offset += 1) {
        const day = daysAgo(offset);
        await findOrCreate(models.DailyLogEntry, { menteeId: owner.id, dateKey: dateKey(day), clanId: learnerClan.id }, {
          tasksDone: offset > 2 ? [ownerTasks[1].id] : [], slotsDone: [],
          note: offset === 0 ? 'Tested the offline queue and documented one Android edge case.' : 'Made steady progress and captured the next action.',
          loggedAt: day,
        }, transaction);
      }

      const badges = [];
      for (const badge of [
        { name: 'User Advocate', description: 'Complete one evidence-based user research task.', category: 'research', criteriaType: 'tasks_completed', criteriaValue: { count: 1, tag: 'research' }, pointsReward: 40 },
        { name: 'Accessible Builder', description: 'Complete the accessible onboarding milestone.', category: 'accessibility', criteriaType: 'tasks_completed', criteriaValue: { count: 2 }, pointsReward: 60 },
        { name: 'Release Ready', description: 'Complete all five tasks in the mobile product roadmap.', category: 'delivery', criteriaType: 'tasks_completed', criteriaValue: { count: 5 }, pointsReward: 120 },
      ]) {
        badges.push(await findOrCreate(models.Badge, { name: badge.name }, {
          ...badge, earningScope: 1, isActive: true, isSecret: false,
        }, transaction));
      }
      for (const [index, badge] of badges.slice(0, 2).entries()) {
        await models.UserBadge.findOrCreate({
          where: { userId: owner.id, badgeId: badge.id, programId: program.id, clanId: null },
          defaults: { unlockedAt: daysAgo(17 - index * 5), unlockContext: { fixture: MARKER, criteriaMatched: true }, isFeatured: index === 1 },
          transaction,
        });
      }
      const pointRows = [
        [ownerTasks[0].id, 40, 0, 40, 'Completed user journey research'],
        [ownerTasks[1].id, 60, 40, 100, 'Completed accessible onboarding'],
        [ownerTasks[2].id, 140, 100, 240, 'Maintained progress and submitted offline task flow'],
      ];
      for (const [sourceId, pointsChange, pointsBefore, pointsAfter, reason] of pointRows) {
        await findOrCreate(models.PointsHistory, { userId: owner.id, sourceType: MARKER, sourceId }, {
          pointsChange, pointsBefore, pointsAfter, reason,
        }, transaction);
      }
      await findOrCreate(models.LeaderboardEntry, {
        userId: owner.id, programId: program.id, periodType: 'all_time', periodStart: program.startDate,
      }, { rank: 2, points: 240, periodEnd: program.endDate, isVisible: true }, transaction);
      await findOrCreate(models.Gift, { name: 'Mentor office-hours pass' }, {
        description: 'Redeem points for a focused 30-minute mentoring session.', costXp: 200,
        stock: 8, active: true, createdBy: owner.id,
      }, transaction);

      await findOrCreate(models.Announcement, { title: 'Release review this Friday', authorId: owner.id }, {
        body: 'Bring your latest build, one user insight, and the biggest remaining risk. We will finish with clear owners and next steps.',
        audience: 'program', audienceId: program.id, pinned: true,
      }, transaction);
      await findOrCreate(models.CommunityPost, { authorId: mentor.id, title: 'What made your offline experience feel trustworthy?' }, {
        type: 'question', scopeType: 'program', scopeId: program.id,
        body: 'Share one small interaction that helped users understand whether their work was saved.',
        tags: ['mobile', 'offline', 'ux'], mentionedUserIds: [owner.id], pinnedAt: daysAgo(1), pinnedBy: owner.id,
      }, transaction);

      const conversation = await findOrCreate(models.Conversation, {
        createdBy: mentor.id, relatedEnrollmentId: ownerEnrollment.id,
      }, { type: 'direct', lastMessageAt: daysAgo(1), metadata: { fixture: MARKER, title: 'Sofia and Play Review' } }, transaction);
      for (const user of [owner, mentor]) {
        await findOrCreate(models.ConversationParticipant, { conversationId: conversation.id, userId: user.id }, {
          role: user.id === mentor.id ? 'owner' : 'participant', joinedAt: daysAgo(28),
          lastReadAt: user.id === owner.id ? daysAgo(2) : daysAgo(1),
        }, transaction);
      }
      const [message] = await models.Message.findOrCreate({
        where: { threadId: conversation.id, senderId: mentor.id, subject: 'Offline flow feedback' },
        defaults: { recipientId: owner.id, messageText: 'Your retry states are clear. Please test once more with airplane mode before Friday.',
          deliveredAt: daysAgo(1), isRead: false, relatedTaskId: ownerTasks[2].id, relatedEnrollmentId: ownerEnrollment.id },
        transaction,
      });
      await conversation.update({ lastMessageId: message.id, lastMessageAt: message.createdAt }, { transaction });

      for (const notification of [
        { type: 'feedback', audience: 'mentee', title: 'New mentor feedback', message: 'Sofia left feedback on your accessible onboarding task.', actionUrl: `/mentee/tasks/${ownerTasks[1].id}`, actionLabel: 'View feedback', relatedEntityId: ownerTasks[1].id },
        { type: 'task', audience: 'mentor', title: 'Submission ready for review', message: 'A mobile offline-flow submission is waiting for review.', actionUrl: '/mentor/tasks/review', actionLabel: 'Review now', relatedEntityId: ownerTasks[2].id },
        { type: 'system', audience: 'admin', title: 'Cohort health snapshot is ready', message: 'Review progress, open blockers, and pending work before the release review.', actionUrl: '/admin/dashboard', actionLabel: 'Open dashboard', relatedEntityId: program.id },
      ]) {
        await findOrCreate(models.Notification, {
          userId: owner.id, title: notification.title, relatedEntityId: notification.relatedEntityId,
        }, { ...notification, status: 'unread', relatedEntityType: MARKER, clanId: learnerClan.id,
          sentAt: daysAgo(1), emailSent: false }, transaction);
      }

      const summary = {
        fixture: MARKER, workspace: organization.slug, owner: owner.email,
        users: 6, programs: 1, cohorts: 1, clans: 2, roadmapSteps: steps.length,
        assignedTasks: steps.length * mentees.length, ownerTasks: ownerTasks.length,
        organizationBadges: badges.length,
      };
      console.log(JSON.stringify(summary));
    });
  });
}

if (require.main === module) {
  seed()
    .then(() => console.log('Google Play review workspace is ready. No password was created or changed.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}

module.exports = { seed, assertGuardrails, WORKSPACE_SLUG, OWNER_EMAIL, MARKER };
