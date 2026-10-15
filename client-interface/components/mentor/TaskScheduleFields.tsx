'use client';

export interface TaskScheduleDraft {
  mode: 'now' | 'once' | 'weekly';
  startsOn: string;
  timeLocal: string;
  timezone: string;
  daysOfWeek: number[];
  dueOffsetDays: number;
  intervalWeeks: number;
  endsOn: string;
}
export function initialTaskSchedule(): TaskScheduleDraft {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return {
    mode: 'now',
    startsOn: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    timeLocal: '09:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    daysOfWeek: [date.getDay()],
    dueOffsetDays: 7,
    intervalWeeks: 1,
    endsOn: '',
  };
}

/** 'YYYY-MM-DD' in the viewer's zone — an ISO instant is a day off west of UTC. */
const dayKey = (d: Date) => d.toLocaleDateString('en-CA');
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
/** The coming Monday — what "next week" means when you are planning work. */
const comingMonday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
};
const WEEKDAYS = [1, 2, 3, 4, 5];
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TaskScheduleFields({
  value,
  onChange,
  allowNow = true,
  editing = false,
}: {
  value: TaskScheduleDraft;
  onChange: (value: TaskScheduleDraft) => void;
  allowNow?: boolean;
  editing?: boolean;
}) {
  const patch = (change: Partial<TaskScheduleDraft>) =>
    onChange({ ...value, ...change });
  const field =
    'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-brand-500';
  return (
    <section
      aria-label="Task timing"
      className="rounded-2xl border border-border bg-muted/40 p-4 space-y-4"
    >
      <div>
        <h3 className="text-sm font-semibold">When should this happen?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {editing ? 'Plan another assignment or set a weekly repeat.' : 'Assign now, plan ahead, or build a weekly habit.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-1 rounded-xl bg-card p-1 border border-border">
        {(
          [
            ['now', 'Assign now'],
            ['once', 'Schedule once'],
            ['weekly', 'Repeat weekly'],
          ] as const
        )
          .filter(([mode]) => allowNow || mode !== 'now')
          .map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              aria-pressed={value.mode === mode}
              onClick={() => patch({ mode })}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium ${value.mode === mode ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {mode === 'now' && editing ? 'No future assignments' : label}
            </button>
          ))}
      </div>
      {value.mode !== 'now' && (
        <>
          <div>
            <label className="block text-xs font-medium">
              {value.mode === 'once' ? 'Scheduled for' : 'Start repeating from'}
              <input
                aria-label="Schedule date and time"
                type="datetime-local"
                value={`${value.startsOn}T${value.timeLocal}`}
                onChange={(e) => {
                  const [startsOn, timeLocal] = e.target.value.split('T');
                  patch({ startsOn: startsOn || '', timeLocal: timeLocal || '' });
                }}
                className={`${field} mt-1.5`}
              />
            </label>
            {/* Typing a date you have to work out from a calendar is the slowest
                part of this form, and these three are nearly always the answer. */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { label: 'Today', date: new Date() },
                { label: 'Tomorrow', date: inDays(1) },
                { label: 'Next week', date: comingMonday() },
              ].map((quick) => {
                const key = dayKey(quick.date);
                return (
                  <button
                    type="button"
                    key={quick.label}
                    aria-pressed={value.startsOn === key}
                    onClick={() => patch({
                      startsOn: key,
                      // Repeating from a chosen day means that day of the week,
                      // unless days have already been picked by hand.
                      ...(value.mode === 'weekly' && value.daysOfWeek.length <= 1
                        ? { daysOfWeek: [quick.date.getDay()] } : {}),
                    })}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      value.startsOn === key
                        ? 'bg-brand-600 text-white'
                        : 'border border-border text-muted-foreground hover:border-brand-300 hover:text-brand-700'
                    }`}
                  >
                    {quick.label}
                  </button>
                );
              })}
            </div>
          </div>
          {value.mode === 'weekly' && (
            <fieldset>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <legend className="text-xs font-medium">Repeat on</legend>
                {/* "Every weekday" is the commonest shape of all and took five
                    taps to build by hand. */}
                <button
                  type="button"
                  onClick={() => patch({ daysOfWeek: WEEKDAYS })}
                  className="rounded-lg border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-brand-300 hover:text-brand-700"
                >
                  Weekdays
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DAY_INITIALS.map((initial, index) => {
                  const on = value.daysOfWeek.includes(index);
                  return (
                    <button
                      type="button"
                      key={DAY_NAMES[index]}
                      aria-pressed={on}
                      aria-label={DAY_NAMES[index]}
                      title={DAY_NAMES[index]}
                      onClick={() =>
                        patch({
                          daysOfWeek: on
                            ? value.daysOfWeek.filter((d) => d !== index)
                            : [...value.daysOfWeek, index].sort((a, b) => a - b),
                        })
                      }
                      className={`h-9 w-9 rounded-full text-xs font-semibold transition-colors ${
                        on
                          ? 'bg-brand-600 text-white'
                          : 'border border-border bg-card text-muted-foreground hover:border-brand-300'
                      }`}
                    >
                      {initial}
                    </button>
                  );
                })}
              </div>
              {value.daysOfWeek.length === 0 && (
                <p className="mt-1.5 text-[11px] text-amber-600">Pick at least one day.</p>
              )}
            </fieldset>
          )}
          <p className="text-xs text-muted-foreground">
            {value.timezone} · Due {value.dueOffsetDays} days after each
            scheduled date. Upcoming tasks appear ahead of time.
          </p>
          <details>
            <summary className="cursor-pointer text-xs font-medium text-brand-700">
              Adjust deadline{value.mode === 'weekly' ? ' or end date' : ''}
            </summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="text-xs font-medium">
                Due after (days)
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={value.dueOffsetDays}
                  onChange={(e) =>
                    patch({ dueOffsetDays: Number(e.target.value) })
                  }
                  className={`${field} mt-1.5`}
                />
              </label>
              {value.mode === 'weekly' && (
                <label className="text-xs font-medium">
                  End date (optional)
                  <input
                    type="date"
                    min={value.startsOn}
                    value={value.endsOn}
                    onChange={(e) => patch({ endsOn: e.target.value })}
                    className={`${field} mt-1.5`}
                  />
                </label>
              )}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
