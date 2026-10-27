/**
 * Editing a task is the same form as assigning one.
 *
 * It had drifted into a different screen: a bare stack of labelled boxes, a
 * native <select> for the type where assigning uses pills, acceptance criteria
 * as one newline-separated textarea where assigning gives each check its own
 * row, and a scheduling block that asked the timing question in a shape the
 * assign form had already dropped. A mentor answering the same questions twice
 * should not have to learn two layouts, so this test pins the controls the two
 * forms share.
 *
 * It also pins the two things that were missing rather than merely different:
 * Clan Review opens an editable task straight into this drawer, so without the
 * progress panel the mentor edits the work without ever seeing how it is
 * going; and the list payload the drawer opens with carries no resources, so
 * without the seed from the full record adding one link silently replaced the
 * rest.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const edit = read('components', 'mentor', 'TaskEditDrawer.tsx');
const assign = read('components', 'mentor', 'AssignTaskDrawer.tsx');

test('both forms ask the timing question with the same control', () => {
  for (const [name, src] of [['assign', assign], ['edit', edit]]) {
    assert.match(src, /<TaskTimingRow/, `${name} must use TaskTimingRow, not its own date + repeat block`);
  }
  assert.doesNotMatch(edit, /TaskScheduleFields\s+editing/,
    'the three-way "Assign now / Schedule once / Repeat weekly" block was retired on the assign form; '
    + 'editing must not keep its own copy');
});

test('both forms use the same controls for type, brief and the optional fold', () => {
  assert.doesNotMatch(edit, /<select[^>]*id="assigned-task-type"/,
    'the type is a row of pills on the assign form; a native <select> here is the old layout');
  assert.match(edit, /aria-pressed=\{type === t\}/, 'the type picker must be pills, like assigning');
  for (const [name, src] of [['assign', assign], ['edit', edit]]) {
    assert.match(src, /<RichTextEditor/, `${name} must use the rich editor for the brief`);
    assert.match(src, /Deliverable, checks &amp; resources/,
      `${name} must keep the optional fold with the same wording`);
    assert.match(src, /aria-label=\{`Acceptance criterion \$\{i \+ 1\}`\}/,
      `${name} must give each acceptance check its own row`);
    assert.match(src, /aria-label=\{`Resource \$\{i \+ 1\} URL`\}/,
      `${name} must give each resource its own label + URL row`);
  }
});

test('an in-flight task opens with the mentee progress above the form', () => {
  assert.match(edit, /<TaskProgressTimeline taskId=\{task\.id\}/,
    'the day-by-day log is the progress read; Clan Review drops straight into this drawer');
  assert.match(edit, /<TaskSubmissionHistory taskId=\{task\.id\}/,
    'what they handed in must be readable without leaving the drawer');
  assert.match(edit, /const started = \[/, 'the panel is gated on the mentee having actually started');
});

test('the resource list is seeded from the full record, not the list payload', () => {
  // taskService.getMenteeTasks does not include TaskResource; getAssignedTaskById does.
  const service = read('..', 'server', 'src', 'services', 'taskService.js');
  const listQuery = service.slice(service.indexOf('async getMenteeTasks'), service.indexOf('async getMenteeTasks') + 2000);
  assert.doesNotMatch(listQuery, /models\.TaskResource/,
    'if the list payload ever starts carrying resources, this seed can go — update this test with it');
  assert.match(edit, /resourcesTouchedRef\.current \|\| prev\.length \? prev :/,
    'resources must be filled in from getTaskById without overwriting what the mentor typed');
});

test('the type and the repeat are locked where the server would refuse them', () => {
  assert.match(edit, /const canSchedule = OPEN_STATUSES\.includes\(task\.status\)/,
    'timing can only change before anything has been handed in');
  assert.match(edit, /repeat=\{canSchedule && scheduleReady\}/,
    'the repeat menu must not appear before its current value has loaded, or it would be stomped');
  for (const locked of ['quiz', 'interview', 'open_source', 'course']) {
    assert.ok(!new RegExp(`EDITABLE_TYPES[^;]*'${locked}'`, 's').test(edit),
      `${locked} carries its own assignment setup and must not be in the editable type list`);
  }
});
