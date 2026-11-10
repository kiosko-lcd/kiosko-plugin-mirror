/**
 * Countdown: the days left until what matters (an exam, the holidays, a
 * deadline, a birthday). A port of MMM-Countdown with several dates instead
 * of one: the nearest come first, past ones disappear on their own and
 * yearly ones come back.
 */
import { defineWidget, drawEmpty, drawMore, listLayout, listOptions, t } from '@kiosko/sdk';
import { clamp, dayOffset } from './util.ts';

export interface CountdownEvent {
  name: string;
  /** `YYYY-MM-DD` (or an ISO date-time), local time. */
  date: string;
  /** Comes back every year on the same day (birthdays, anniversaries): the year of `date` doesn't matter. */
  yearly?: boolean;
}

const DAY = 86_400_000;

/** Local midnight of a `YYYY-MM-DD` (or of the day of an ISO date-time); null if it isn't a date. */
function parseDay(date: string): Date | null {
  const at = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date);
  if (Number.isNaN(at.getTime())) return null;
  at.setHours(0, 0, 0, 0);
  return at;
}

/**
 * Whole days from today to that date, counted in local calendar days. A
 * yearly date counts to its next return, today included; 29 February falls
 * on the 28th in the other years.
 */
export function daysUntil(date: string, now: number, yearly = false): number | null {
  const at = parseDay(date);
  if (!at) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (yearly) {
    const on = (year: number) => new Date(year, at.getMonth(), Math.min(at.getDate(), new Date(year, at.getMonth() + 1, 0).getDate()));
    let next = on(today.getFullYear());
    if (next < today) next = on(today.getFullYear() + 1);
    return Math.round((next.getTime() - today.getTime()) / DAY);
  }
  return Math.round((at.getTime() - today.getTime()) / DAY);
}

/** The ones still ahead, nearest first. */
export function upcoming(events: readonly CountdownEvent[], now: number): { name: string; days: number }[] {
  return events
    .map((e) => ({ name: e.name, days: daysUntil(e.date, now, e.yearly) }))
    .filter((e): e is { name: string; days: number } => e.days !== null && e.days >= 0)
    .sort((a, b) => a.days - b.days);
}

/** The colour of a date: red from `alertDays` before, amber from `warnDays`. */
export function countdownLevel(days: number, o: { warnDays: number; alertDays: number }): 'alert' | 'warn' | 'normal' {
  return days <= o.alertDays ? 'alert' : days <= o.warnDays ? 'warn' : 'normal';
}

/** Sample dates relative to `now`, for the gallery: one of them yearly, with a year long gone. */
export function demoEvents(now: number): CountdownEvent[] {
  return [
    { name: 'Project deadline', date: dayOffset(now, 1) },
    { name: 'Holidays', date: dayOffset(now, 5) },
    { name: "Sam's birthday", date: `1990${dayOffset(now, 12).slice(4)}`, yearly: true },
    { name: 'Linear algebra exam', date: dayOffset(now, 26) },
    { name: 'Conference talk', date: dayOffset(now, 74) },
  ];
}

const OPTIONS = t.object({
  events: t.list(
    t.object({
      name: t.string({ label: { en: 'What', es: 'Qué' }, placeholder: 'Holidays' }),
      date: t.string({ format: 'date', label: { en: 'Date', es: 'Fecha' }, placeholder: '2027-01-25' }),
      yearly: t.boolean({ label: { en: 'Every year', es: 'Cada año' }, help: { en: 'Birthdays and anniversaries: the year of the date doesn’t matter.', es: 'Cumpleaños y aniversarios: el año de la fecha da igual.' } }),
    }),
    { label: { en: 'Dates', es: 'Fechas' }, help: { en: 'Past dates hide themselves; yearly ones come back.', es: 'Las fechas pasadas desaparecen solas; las de cada año vuelven.' } },
  ),
  ...listOptions({ rows: 4 }),
  warnDays: t.integer({ default: 7, min: 0, max: 365, unit: 'd', label: { en: 'Amber from (days before)', es: 'Ámbar desde (días antes)' } }),
  alertDays: t.integer({ default: 1, min: 0, max: 365, unit: 'd', label: { en: 'Red from (days before)', es: 'Rojo desde (días antes)' }, help: { en: '0: only on the day.', es: '0: sólo el mismo día.' } }),
});

/** The dates to count: the user's, or the sample ones in the editor while there are none. */
const eventsOf = (options: { events: CountdownEvent[] }, data: CountdownEvent[] | undefined) => (options.events.length ? options.events : (data ?? []));

export const countdown = defineWidget<typeof OPTIONS, CountdownEvent[]>({
  id: 'countdown',
  name: { en: 'Countdown', es: 'Cuenta atrás' },
  description: { en: 'Days left until your important dates, nearest first. Birthdays and anniversaries come back every year.', es: 'Los días que faltan para tus fechas importantes, la más cercana primero. Cumpleaños y aniversarios vuelven cada año.' },
  icon: 'hourglass',
  category: 'time',
  tags: ['magicmirror', 'dates'],
  size: { min: { w: 240, h: 100 }, preferred: { w: 400, h: 300 } },
  options: OPTIONS,
  redraw: 'minute',
  empty: ({ options, data, now }) => !upcoming(eventsOf(options, data), now).length,
  render(g, ctx) {
    const { box, options, data, now, theme, kit, t: tr } = ctx;
    const { colors, fonts } = theme;
    // Unconfigured in the editor: the sample dates (`data` only exists there).
    const list = upcoming(eventsOf(options, data ?? (ctx.preview ? demoEvents(now) : undefined)), now);
    if (!list.length) return drawEmpty(g, ctx, tr({ en: 'Nothing coming up', es: 'Nada a la vista' }));
    const plan = listLayout(box, list.length, options, { sizes: { 'one-line': { min: 24, max: 76 } } });
    const rowH = plan.rowH;
    const shown = list.slice(0, plan.shown);
    const size = Math.round(clamp(Math.min(rowH * 0.62, box.w / 8), 12, 48));
    const unitSize = Math.round(size * 0.5);
    // The number, right-aligned in its column, as wide as the longest one.
    const numW = Math.max(...shown.map((e) => kit.measureTracked(g, String(e.days), { size, family: fonts.sans })), kit.measureTracked(g, '00', { size, family: fonts.sans }));
    const daysWord = tr({ en: 'days', es: 'días' });
    const unitW = kit.measureTracked(g, daysWord, { size: unitSize, family: fonts.sans });
    const nx = box.x + numW + size * 0.18 + unitW + size * 0.35;
    // One size for every name: the largest at which they all fit (within limits).
    const nameSize = Math.min(...shown.map((e) => kit.fitSize(g, e.name, box.x + box.w - nx, { size: Math.round(size * 0.8), family: fonts.sans }, Math.max(11, Math.round(size * 0.5)))));
    shown.forEach((e, i) => {
      const base = plan.rows[i]!.y + rowH / 2 + size * 0.36;
      const level = countdownLevel(e.days, options);
      const color = level === 'alert' ? colors.alert : level === 'warn' ? colors.warn : colors.ink;
      if (e.days > 1) {
        kit.drawTracked(g, String(e.days), box.x + numW, base, { size, family: fonts.sans, color, align: 'right' });
        kit.drawTracked(g, daysWord, box.x + numW + size * 0.18, base, { size: unitSize, family: fonts.sans, color: colors.inkDim });
      } else {
        // "today" / "tomorrow" take the number's place, in its colour.
        const word = e.days === 0 ? tr({ en: 'today', es: 'hoy' }) : tr({ en: 'tomorrow', es: 'mañana' });
        const ws = kit.fitSize(g, word, nx - box.x - size * 0.3, { size: Math.round(size * 0.8), family: fonts.sans }, unitSize);
        kit.drawTracked(g, word, box.x, base, { size: ws, family: fonts.sans, color });
      }
      const name = kit.truncate(g, e.name, box.x + box.w - nx, { size: nameSize, family: fonts.sans });
      kit.drawTracked(g, name, nx, base, { size: nameSize, family: fonts.sans, color: colors.ink });
    });
    drawMore(g, ctx, plan, { indent: nx - box.x });
  },
  // Configured with options only: the sample dates are drawn by `render` in the editor.
  demo: ({ now }) => ({ data: demoEvents(now) }),
});
