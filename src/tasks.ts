/**
 * Today and tomorrow. A port of MMM-Todoist with sources you already have
 * instead of an account on a service:
 *
 *   - a Markdown file of yours with checkboxes under `## Today` and
 *     `## Tomorrow` (or `## Hoy` / `## Mañana`); a box with a date
 *     (`@2026-10-14` or `📅 2026-10-14`) goes to the day it belongs to, and if
 *     that day is gone, to today marked as late. Ticked boxes (`- [x]`) are
 *     left out;
 *   - optionally, the GitLab issues assigned to you that are due today or
 *     tomorrow, and every overdue one, however late (through the `glab` CLI).
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { defineWidget, drawEmpty, drawMore, listLayout, listOptions, moreHeight, moreLabel, t, type Box, type Graphics, type RenderContext } from '@kiosko/sdk';
import { clamp, dayKey, expandHome } from './util.ts';

const execFileAsync = promisify(execFile);

export interface TaskItem {
  kind: 'task' | 'issue' | 'meeting';
  text: string;
  /** `HH:MM`, for meetings. */
  time?: string;
  /** Was due before today. */
  late?: boolean;
}

export interface TasksData {
  today: TaskItem[];
  tomorrow: TaskItem[];
}

const TODAY = /^(today|hoy)\b/i;
const TOMORROW = /^(tomorrow|mañana|manana)\b/i;

/** The open checkboxes of the file, split between today and tomorrow. */
export function parseTaskFile(text: string, now: number): TasksData {
  const today = dayKey(now), tomorrow = dayKey(now + 86_400_000);
  const out: TasksData = { today: [], tomorrow: [] };
  let section: 'today' | 'tomorrow' | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const head = /^#{1,6}\s+(.*)$/.exec(line);
    if (head) {
      const h = head[1]!.trim();
      section = TODAY.test(h) ? 'today' : TOMORROW.test(h) ? 'tomorrow' : null;
      continue;
    }
    const item = /^[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (!item || item[1] !== ' ') continue;
    let body = item[2]!.trim();
    const date = /(?:@|📅\s*)(\d{4}-\d{2}-\d{2})/u.exec(body)?.[1];
    if (date) body = body.replace(/\s*(?:@|📅\s*)\d{4}-\d{2}-\d{2}/u, '').trim();
    if (date) {
      if (date < today) out.today.push({ kind: 'task', text: body, late: true });
      else if (date === today) out.today.push({ kind: 'task', text: body });
      else if (date === tomorrow) out.tomorrow.push({ kind: 'task', text: body });
    } else if (section) {
      out[section].push({ kind: 'task', text: body });
    }
  }
  return out;
}

export interface GitlabIssue {
  id?: number;
  title: string;
  due_date?: string | null;
  web_url?: string;
  references?: { short?: string; full?: string };
}

/**
 * The two queries the issues come from: every overdue one (the window GitLab
 * calls "next month and previous two weeks" loses those more than two weeks
 * late, which are exactly the ones that mustn't hide) and the coming ones.
 */
export const ISSUE_QUERIES = ['overdue', 'next_month_and_previous_two_weeks'].map((due) => `issues?scope=assigned_to_me&state=opened&due_date=${due}&per_page=100`);

/** Several pages of issues as one list, each issue once. */
export function mergeIssues(lists: readonly GitlabIssue[][]): GitlabIssue[] {
  const seen = new Set<string>();
  return lists.flat().filter((i) => {
    const key = String(i.id ?? i.web_url ?? i.references?.full ?? i.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** GitLab issues (REST shape) due today, tomorrow or already overdue. */
export function issuesByDay(issues: GitlabIssue[], now: number): TasksData {
  const today = dayKey(now), tomorrow = dayKey(now + 86_400_000);
  const out: TasksData = { today: [], tomorrow: [] };
  for (const i of issues) {
    if (!i.due_date) continue;
    const text = `${i.references?.short ?? ''} ${i.title}`.trim();
    if (i.due_date < today) out.today.push({ kind: 'issue', text, late: true });
    else if (i.due_date === today) out.today.push({ kind: 'issue', text });
    else if (i.due_date === tomorrow) out.tomorrow.push({ kind: 'issue', text });
  }
  return out;
}

/** Meetings first, by time; then what's late; then the rest. */
export function sortTasks(list: TaskItem[]): TaskItem[] {
  const rank = (t: TaskItem) => (t.kind === 'meeting' ? 0 : t.late ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.time ?? '').localeCompare(b.time ?? ''));
}

const DEMO: TasksData = {
  today: [
    { kind: 'meeting', text: 'Team stand-up', time: '11:30' },
    { kind: 'issue', text: '#214 Login button misaligned on mobile', late: true },
    { kind: 'task', text: 'Review the quarterly budget' },
    { kind: 'task', text: 'Call the dentist' },
  ],
  tomorrow: [
    { kind: 'issue', text: '#231 Update the onboarding docs' },
    { kind: 'task', text: 'Buy a birthday present' },
  ],
};

interface Section {
  title: string;
  items: TaskItem[];
}

interface TaskPainter {
  g: Graphics;
  ctx: RenderContext<unknown, TasksData>;
  rowH: number;
}

/**
 * Paints a section in `rows` rows of `area` from its top: the title, then
 * the items; when they don't fit, a compact "+N more" line takes the last
 * row (with a single row for items, it goes after the one shown). Returns
 * the height used.
 */
function drawSection(p: TaskPainter, s: Section, area: Box, rows: number): number {
  const { g, ctx, rowH } = p;
  const { kit, theme, t: tr } = ctx;
  const { colors, fonts } = theme;
  const size = Math.round(rowH * 0.76);
  const small = Math.round(rowH * 0.62);
  const baseOf = (i: number) => area.y + i * rowH + rowH / 2 + size * 0.36;
  kit.drawTracked(g, kit.truncate(g, s.title, area.w, { size: small, family: fonts.sans }), area.x, area.y + rowH / 2 + small * 0.45, { size: small, family: fonts.sans, color: colors.inkDim, smallCaps: true, tracking: 1 });
  const itemRows = Math.max(1, rows - 1);
  if (!s.items.length) {
    kit.drawTracked(g, tr({ en: 'Nothing', es: 'Nada' }), area.x, baseOf(1), { size, family: fonts.sans, color: colors.inkFaint });
    return 2 * rowH;
  }
  const fits = s.items.length <= itemRows;
  const shown = fits ? s.items : s.items.slice(0, Math.max(1, itemRows - 1));
  const hidden = s.items.length - shown.length;
  // With a single row for items, "+N more" goes at its end; otherwise in a compact line under them, like every list's.
  const inline = hidden > 0 && shown.length >= itemRows;
  const moreH = moreHeight(rowH);
  const inlineW = inline ? kit.measureTracked(g, moreLabel(hidden, tr), { size: Math.max(8, Math.round(moreH * 0.62)), family: fonts.sans }) + small * 0.8 : 0;
  shown.forEach((it, i) => {
    const base = baseOf(i + 1);
    let tx = area.x;
    if (it.kind === 'meeting' && it.time) {
      tx += kit.drawTracked(g, it.time, area.x, base, { size: small, family: fonts.mono, color: colors.info }) + small * 0.5;
    } else {
      tx += kit.drawTracked(g, it.kind === 'issue' ? '◆' : '•', area.x, base, { size: small, family: fonts.sans, color: it.late ? colors.alert : colors.inkDim }) + small * 0.5;
    }
    const o = { size, family: fonts.sans, color: it.late ? colors.alert : colors.ink };
    const last = i === shown.length - 1;
    kit.drawTracked(g, kit.truncate(g, it.text, area.x + area.w - tx - (last ? inlineW : 0), o), tx, base, o);
  });
  const indent = kit.measureTracked(g, '•', { size: small, family: fonts.sans }) + small * 0.5;
  if (inline) {
    drawMore(g, ctx, { hidden, more: { x: area.x, y: area.y + shown.length * rowH + (rowH - moreH) / 2, w: area.w, h: moreH } }, { align: 'right' });
    return (1 + shown.length) * rowH;
  }
  if (hidden) {
    drawMore(g, ctx, { hidden, more: { x: area.x, y: area.y + (1 + shown.length) * rowH, w: area.w, h: moreH } }, { indent });
    return (1 + shown.length) * rowH + moreH;
  }
  return (1 + shown.length) * rowH;
}

export const tasks = defineWidget({
  id: 'tasks',
  name: { en: 'Today and tomorrow', es: 'Hoy y mañana' },
  description: {
    en: 'Your to-dos for today and tomorrow, from a Markdown checklist and, optionally, your GitLab issues.',
    es: 'Lo que tienes para hoy y mañana, de una lista de casillas en Markdown y, si quieres, de tus issues de GitLab.',
  },
  icon: 'list-checks',
  category: 'productivity',
  tags: ['magicmirror', 'todo'],
  size: { min: { w: 240, h: 140 }, preferred: { w: 400, h: 440 } },
  options: t.object({
    file: t.string({
      default: '~/tasks.md',
      format: 'path',
      risk: 'path',
      label: { en: 'Checklist file', es: 'Fichero de tareas' },
      help: {
        en: 'Markdown with "- [ ] …" boxes under "## Today" and "## Tomorrow"; "@2026-10-14" dates a box.',
        es: 'Markdown con casillas «- [ ] …» bajo «## Hoy» y «## Mañana»; «@2026-10-14» le pone fecha.',
      },
    }),
    includeIssues: t.boolean({ label: { en: 'Add my GitLab issues with a due date', es: 'Añadir mis issues de GitLab con fecha' }, help: { en: 'Due today or tomorrow, and every overdue one.', es: 'Las que vencen hoy o mañana, y todas las vencidas.' } }),
    bin: t.string({ default: 'glab', format: 'path', risk: 'exec', advanced: true, label: { en: 'glab command', es: 'Comando glab' }, help: { en: 'The GitLab CLI, already logged in.', es: 'El CLI de GitLab, con la sesión iniciada.' } }),
    showTomorrow: t.boolean({ default: true, label: { en: 'Tomorrow too', es: 'También mañana' }, help: { en: 'Off: only today, for small tiles.', es: 'Apagado: sólo hoy, para teselas pequeñas.' } }),
    ...listOptions(),
  }),
  intervalMs: 10 * 60_000,
  async fetch({ options, now, log, signal }): Promise<TasksData> {
    const data: TasksData = { today: [], tomorrow: [] };
    const add = (d: TasksData) => {
      data.today.push(...d.today);
      data.tomorrow.push(...d.tomorrow);
    };
    if (options.file) {
      try {
        add(parseTaskFile(await readFile(expandHome(options.file), 'utf8'), now));
      } catch {
        // No file, no tasks of your own.
      }
    }
    if (options.includeIssues) {
      const pages = await Promise.allSettled(
        ISSUE_QUERIES.map(async (q) => JSON.parse((await execFileAsync(options.bin || 'glab', ['api', q], { timeout: 20_000, maxBuffer: 8_000_000, signal })).stdout) as GitlabIssue[]),
      );
      const failed = pages.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) log(`no GitLab issues: ${failed.reason instanceof Error ? failed.reason.message.split('\n')[0] : String(failed.reason)}`);
      add(issuesByDay(mergeIssues(pages.flatMap((r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? [r.value] : []))), now));
    }
    return { today: sortTasks(data.today), tomorrow: sortTasks(data.tomorrow) };
  },
  empty: ({ data, options }) => !!data && !data.today.length && !(options.showTomorrow && data.tomorrow.length),
  render(g, ctx) {
    const { data, box, options, t: tr } = ctx;
    if (!data) return;
    const today = { title: tr({ en: 'Today', es: 'Hoy' }), items: data.today };
    const tomorrow = { title: tr({ en: 'Tomorrow', es: 'Mañana' }), items: data.tomorrow };
    const sections = options.showTomorrow ? [today, tomorrow] : [today];
    if (!sections.some((s) => s.items.length)) return drawEmpty(g, ctx, options.showTomorrow ? tr({ en: 'Nothing for today or tomorrow', es: 'Nada para hoy ni mañana' }) : tr({ en: 'Nothing for today', es: 'Nada para hoy' }));
    // Wide and short tiles get today and tomorrow side by side; otherwise
    // today on top and tomorrow below, full width (in two narrow columns the
    // texts were left with a dozen letters).
    const columns = sections.length === 2 && box.w >= 520 && box.w >= box.h * 2.4;
    const gap = columns ? Math.round(clamp(box.w * 0.03, 12, 40)) : 0;
    const colW = columns ? (box.w - gap) / 2 : box.w;
    // A section is its title and its items (or "Nothing"), a row each; rows follow the shared list options.
    const linesOf = (s: Section) => 1 + Math.max(1, s.items.length);
    const count = columns ? Math.max(...sections.map(linesOf)) : sections.reduce((a, s) => a + linesOf(s), 0);
    const plan = listLayout(box, count, options, { sizes: { 'one-line': { min: 20, max: clamp(colW / 9, 20, 40) } } });
    const rowH = plan.rowH;
    // Row slots: those that fit, or `rows` of them.
    const fit = Math.max(1, Math.floor(box.h / rowH + 0.1));
    const slots = options.rows > 0 ? Math.min(options.rows, fit) : fit;
    const p: TaskPainter = { g, ctx, rowH };
    if (columns) {
      sections.forEach((s, i) => drawSection(p, s, { x: box.x + i * (colW + gap), y: box.y, w: colW, h: box.h }, slots));
      return;
    }
    if (sections.length === 1) return void drawSection(p, today, box, slots);
    const need = sections.map(linesOf);
    if (need[0]! + need[1]! <= slots) {
      const used = drawSection(p, today, box, need[0]!);
      drawSection(p, tomorrow, { ...box, y: box.y + used }, need[1]!);
      return;
    }
    if (slots < 5) {
      // Too short for both lists: today, and tomorrow as a one-line count.
      const rows = Math.max(2, slots - (tomorrow.items.length ? 1 : 0));
      const used = drawSection(p, today, box, rows);
      if (tomorrow.items.length && rows < slots && used + rowH <= box.h + rowH * 0.1) {
        const small = Math.round(rowH * 0.62);
        const font = { size: small, family: ctx.theme.fonts.sans };
        ctx.kit.drawTracked(g, ctx.kit.truncate(g, `${tomorrow.title}: ${tomorrow.items.length}`, box.w, font), box.x, box.y + used + rowH / 2 + small * 0.36, { ...font, color: ctx.theme.colors.inkDim });
      }
      return;
    }
    // Today takes the room it needs, leaving tomorrow its title and two rows (one when tight).
    const keep = 1 + Math.min(slots >= 8 ? 2 : 1, Math.max(1, tomorrow.items.length));
    const todayRows = Math.min(need[0]!, slots - keep);
    const used = drawSection(p, today, box, todayRows);
    drawSection(p, tomorrow, { ...box, y: box.y + used }, Math.min(need[1]!, slots - todayRows));
  },
  demo: () => ({ data: DEMO }),
});
