/**
 * "Every weekday", "every Monday and Thursday", "every 2 weeks" — on one item.
 *
 * A schedule SLOT could already repeat: the weekly materialiser turns a slot's
 * recurring config into tasks on a cadence. An item inside a block could not,
 * so "post on LinkedIn every Wednesday" had no home — you either made a whole
 * block for it or re-added it by hand every week.
 *
 * The rule travels on the task rather than in a scheduler, and the next
 * occurrence is created the moment one is finished. That means no background
 * job has to be running for a repeat to work, nothing drifts if a worker misses
 * a tick, and a repeat that nobody ever completes quietly stops instead of
 * piling up — which is the behaviour people actually expect from a to-do that
 * repeats.
 *
 * Shape (all dates are 'YYYY-MM-DD' day keys, never instants — a repeat is a
 * calendar idea and must not shift when a server changes zone):
 *
 *   { freq: 'daily',   interval: 1 }
 *   { freq: 'weekly',  interval: 1, days: [1,3] }   // Mon + Wed, 0 = Sunday
 *   { freq: 'monthly', interval: 1 }                // same day-of-month
 *   { freq: 'yearly',  interval: 1 }                // same day + month
 *
 * `until` ('YYYY-MM-DD' or null) ends the series after that date.
 */

const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];
const DAY_MS = 86400000;

/** 'YYYY-MM-DD' → UTC ms at midnight. Day keys only; no zone arithmetic. */
function keyToMs(key) {
  const ms = Date.parse(`${key}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

function msToKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Normalise what a client sent, or throw. Returns null for "does not repeat",
 * so a caller can store the result directly.
 */
function normalizeRepeat(input) {
  if (!input || input.freq === 'never' || input.freq === null) return null;
  const freq = String(input.freq || '').toLowerCase();
  if (!FREQS.includes(freq)) {
    throw new Error('Repeat must be daily, weekly, monthly or yearly');
  }

  const interval = Number.isInteger(Number(input.interval)) && Number(input.interval) >= 1
    ? Math.min(52, Number(input.interval))
    : 1;

  let days = null;
  if (freq === 'weekly') {
    const raw = Array.isArray(input.days) ? input.days : [];
    days = [...new Set(raw.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
      .sort((a, b) => a - b);
    // A weekly repeat with no day chosen is meaningless, not an error: it means
    // "this day of the week", which the first occurrence already tells us.
    if (!days.length) days = null;
  }

  const until = input.until ? String(input.until).slice(0, 10) : null;
  if (until && keyToMs(until) === null) throw new Error('Repeat end date must be a real date');

  return { freq, interval, ...(days ? { days } : {}), ...(until ? { until } : {}) };
}

/**
 * The next day this rule lands on, strictly AFTER `fromKey`.
 *
 * Returns null when the series has ended. Strictly-after matters: finishing
 * today's occurrence must never produce another one for today, or ticking a
 * daily item would spawn an endless chain inside one afternoon.
 */
function nextOccurrence(rule, fromKey) {
  if (!rule) return null;
  const from = keyToMs(fromKey);
  if (from === null) return null;

  let next = null;
  if (rule.freq === 'daily') {
    next = from + rule.interval * DAY_MS;
  } else if (rule.freq === 'weekly') {
    const days = rule.days && rule.days.length ? rule.days : [new Date(from).getUTCDay()];
    // Walk forward a day at a time to the next chosen weekday. Capped so a
    // malformed rule can never spin: seven days always finds one of 0-6, and
    // the interval only applies once a full week has been crossed.
    const startDow = new Date(from).getUTCDay();
    for (let step = 1; step <= 7; step += 1) {
      const candidate = from + step * DAY_MS;
      const dow = new Date(candidate).getUTCDay();
      if (!days.includes(dow)) continue;
      // Crossing into a new week costs the extra interval weeks.
      const wrapped = dow <= startDow;
      next = candidate + (wrapped ? (rule.interval - 1) * 7 * DAY_MS : 0);
      break;
    }
  } else if (rule.freq === 'monthly' || rule.freq === 'yearly') {
    const d = new Date(from);
    const months = rule.interval * (rule.freq === 'yearly' ? 12 : 1);
    const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
    // 31 Jan + 1 month overflows into March, and 29 Feb + 1 year into 1 March;
    // pin either to the last day of the month the user actually meant.
    if (target.getUTCDate() !== d.getUTCDate()) target.setUTCDate(0);
    next = target.getTime();
  }

  if (next === null) return null;
  const key = msToKey(next);
  if (rule.until && key > rule.until) return null;
  return key;
}

/** "Every weekday" / "Every Mon, Thu" / "Every 2 weeks" — for the UI and tests. */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function describeRepeat(rule) {
  if (!rule) return null;
  const every = rule.interval > 1 ? `Every ${rule.interval} ` : 'Every ';
  if (rule.freq === 'daily') return rule.interval > 1 ? `${every}days` : 'Every day';
  if (rule.freq === 'monthly') return rule.interval > 1 ? `${every}months` : 'Every month';
  if (rule.freq === 'yearly') return rule.interval > 1 ? `${every}years` : 'Every year';
  if (!rule.days || !rule.days.length) return rule.interval > 1 ? `${every}weeks` : 'Every week';
  const isWeekdays = rule.days.length === 5 && rule.days.every((d) => d >= 1 && d <= 5);
  if (isWeekdays && rule.interval === 1) return 'Every weekday';
  return `${every === 'Every ' ? 'Every ' : every}${rule.days.map((d) => DAY_NAMES[d]).join(', ')}`;
}

module.exports = { normalizeRepeat, nextOccurrence, describeRepeat, FREQS };
