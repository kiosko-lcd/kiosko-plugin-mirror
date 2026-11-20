/**
 * On this day. A port of MMM-OnThisDay over Wikipedia's "selected
 * anniversaries" (its REST API, no key), in the user's language. One at a
 * time, changing every `changeMs`.
 */
import { defineWidget, hanScript, localize, t, type BaseContext, type Localized } from '@kiosko/sdk';
import { clamp, USER_AGENT, within } from './util.ts';

export interface Ephemeris {
  year: number;
  text: string;
}

export interface OnThisDayData {
  /** `MM-DD` the list belongs to. */
  day: string;
  items: Ephemeris[];
}

/** Drops what only makes sense next to the photo on Wikipedia's front page. */
export function cleanText(t: string): string {
  return t
    .replace(/\s*\((?:en la )?imagen[^)]*\)|\s*\(pictured[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The Wikipedia language to ask: the option, else the user's locale. */
export function wikiLang(option: string, locale: string): string {
  const o = option.trim().toLowerCase();
  if (/^[a-z]{2,3}$/.test(o)) return o;
  const l = locale.toLowerCase().split(/[-_]/)[0]!;
  return /^[a-z]{2,3}$/.test(l) ? l : 'en';
}

/**
 * The script to ask zh.wikipedia.org for (`Accept-Language`), which writes
 * every article in both and converts on the way out: Traditional as in
 * Taiwan or Hong Kong, or Simplified, by the user's locale. Undefined for
 * other editions, or a Chinese edition asked for by a reader of neither.
 */
export function wikiVariant(lang: string, locale: string): string | undefined {
  if (lang !== 'zh') return undefined;
  switch (hanScript(locale)) {
    case 'Hant':
      return 'zh-tw';
    case 'Hant-HK':
      return 'zh-hk';
    case 'Hans':
      return 'zh-cn';
    default:
      return undefined;
  }
}

/** "53 years ago" / "hace 53 años". */
export function yearsAgo(n: number, plural: BaseContext['plural']): string {
  return plural(n, { en: { one: '{n} year ago', other: '{n} years ago' }, es: { one: 'hace {n} año', other: 'hace {n} años' }, 'zh-Hant': { other: '{n} 年前' }, 'zh-Hans': { other: '{n} 年前' }, de: { one: 'vor {n} Jahr', other: 'vor {n} Jahren' } });
}

/** Sample anniversaries (5 November) for the gallery and the editor, in the user's language. */
const DEMO: { year: number; text: Localized }[] = [
  {
    year: 1605,
    text: {
      en: 'The Gunpowder Plot is foiled when Guy Fawkes is arrested in the cellars beneath the House of Lords in London.',
      es: 'Fracasa la Conspiración de la Pólvora: Guy Fawkes es detenido en los sótanos de la Cámara de los Lores, en Londres.',
      de: 'Der Schießpulverplan scheitert: Guy Fawkes wird in den Kellern unter dem House of Lords in London verhaftet.',
      'zh-Hant': '火藥陰謀失敗，蓋伊·福克斯在倫敦上議院的地窖中被捕。',
      'zh-Hans': '火药阴谋败露，盖伊·福克斯在伦敦上议院的地窖中被捕。',
    },
  },
  {
    year: 1872,
    text: {
      en: 'Women\'s suffrage campaigner Susan B. Anthony votes in the United States presidential election, for which she is later fined.',
      es: 'La sufragista Susan B. Anthony vota en las elecciones presidenciales de Estados Unidos, por lo que más tarde es multada.',
      de: 'Die Frauenrechtlerin Susan B. Anthony wählt bei der US-Präsidentschaftswahl mit und muss dafür später eine Geldstrafe zahlen.',
      'zh-Hant': '女性參政運動人士蘇珊·安東尼在美國總統大選中投票，事後遭到罰款。',
      'zh-Hans': '妇女参政运动活动家苏珊·安东尼在美国总统选举中投票，事后被处以罚款。',
    },
  },
  {
    year: 1940,
    text: {
      en: 'Franklin D. Roosevelt becomes the first president of the United States to be elected to a third term.',
      es: 'Franklin D. Roosevelt se convierte en el primer presidente de Estados Unidos elegido para un tercer mandato.',
      de: 'Franklin D. Roosevelt wird als erster Präsident der Vereinigten Staaten für eine dritte Amtszeit gewählt.',
      'zh-Hant': '富蘭克林·羅斯福成為第一位三度當選的美國總統。',
      'zh-Hans': '富兰克林·罗斯福成为首位第三次当选的美国总统。',
    },
  },
];

/** Layouts already worked out: the same fact in the same space paints many times before it changes. */
const layouts = new Map<string, { size: number; lines: string[] }>();

/**
 * The largest size (from `start` down to 11) at which `text` fits `w` × `room`
 * whole, and its lines, by halving the range (a smaller size always fits at
 * least as much): about five wraps instead of one per size, and none when the
 * same text was laid out in the same space before.
 */
function layout(text: string, w: number, room: number, start: number, family: string, wrap: (size: number, maxLines: number) => string[]): { size: number; lines: string[] } {
  const key = `${family}|${w}|${room}|${start}|${text}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const at = (sz: number) => wrap(sz, Math.max(1, Math.floor(room / (sz * 1.22))));
  const fits = (l: string[]) => !l.at(-1)?.endsWith('…');
  let lo = 11, hi = Math.max(11, start);
  let lines = at(lo);
  if (fits(lines)) {
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const l = at(mid);
      if (fits(l)) {
        lo = mid;
        lines = l;
      } else hi = mid - 1;
    }
  }
  const out = { size: lo, lines };
  if (layouts.size > 200) layouts.clear();
  layouts.set(key, out);
  return out;
}

export const onthisday = defineWidget({
  id: 'onthisday',
  name: { en: 'On this day', es: 'Tal día como hoy', 'zh-Hant': '歷史上的今天', 'zh-Hans': '历史上的今天', de: 'Heute vor … Jahren' },
  description: { en: 'Selected anniversaries of today from Wikipedia, one at a time.', es: 'Efemérides de hoy seleccionadas por la Wikipedia, una a una.', 'zh-Hant': '維基百科精選的今日歷史事件，一次一則。', 'zh-Hans': '维基百科精选的历史上的今天，一次一条。', de: 'Ausgewählte Jahrestage von heute aus der Wikipedia, einer nach dem anderen.' },
  icon: 'landmark',
  category: 'info',
  tags: ['magicmirror', 'history', 'wikipedia'],
  size: { min: { w: 240, h: 120 }, preferred: { w: 600, h: 220 } },
  options: t.object({
    lang: t.string({ placeholder: 'en', maxLength: 3, label: { en: 'Wikipedia language', es: 'Idioma de la Wikipedia', 'zh-Hant': '維基百科語言', 'zh-Hans': '维基百科语言', de: 'Wikipedia-Sprache' }, help: { en: 'A code such as en, es, de; empty = yours. Not every edition has this feed.', es: 'Un código como es, en, de; vacío = el tuyo. No todas las ediciones tienen esta sección.', 'zh-Hant': '語言代碼，例如 en、es、de；留空 = 你的語言。並非每個版本都有這個欄目。', 'zh-Hans': '语言代码，例如 en、es、de；留空 = 你的语言。并非每个版本都有这个栏目。', de: 'Ein Code wie de, en, es; leer = deine. Nicht jede Ausgabe hat diesen Feed.' } }),
    changeMs: t.duration({ default: 10 * 60_000, min: 60_000, label: { en: 'Change every', es: 'Cambia cada', 'zh-Hant': '更換間隔', 'zh-Hans': '切换间隔', de: 'Wechselt alle' } }),
  }),
  intervalMs: 3 * 3600_000,
  redraw: 'minute',
  async fetch({ options, now, locale, signal }): Promise<OnThisDayData> {
    const d = new Date(now);
    const mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    const lang = wikiLang(options.lang, locale);
    const variant = wikiVariant(lang, locale);
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/selected/${mm}/${dd}`, {
      headers: { 'User-Agent': USER_AGENT, ...(variant ? { 'Accept-Language': variant } : {}) },
      signal: within(signal, 10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { selected?: { year?: number; text?: string }[] };
    const items = (json.selected ?? []).filter((e) => typeof e.year === 'number' && e.text).map((e) => ({ year: e.year!, text: cleanText(e.text!) }));
    return { day: `${mm}-${dd}`, items };
  },
  visible: ({ data }) => Boolean(data?.items.length),
  render(g, { options, data, now, box, theme, kit, plural }) {
    if (!data?.items.length) return;
    const { colors, fonts } = theme;
    const e = data.items[Math.floor(now / Math.max(60_000, options.changeMs)) % data.items.length]!;
    const yearSize = Math.round(clamp(box.h * 0.24, 18, 64));
    const yw = kit.drawTracked(g, String(e.year), box.x, box.y + yearSize * 0.85, { size: yearSize, family: fonts.sansBold, color: colors.info });
    const ago = new Date(now).getFullYear() - e.year;
    if (ago > 0) {
      const s = Math.round(yearSize * 0.42);
      kit.drawTracked(g, kit.truncate(g, yearsAgo(ago, plural), box.w - yw - s, { size: s, family: fonts.sans }), box.x + yw + s * 0.6, box.y + yearSize * 0.82, { size: s, family: fonts.sans, color: colors.inkDim });
    }
    const top = box.y + yearSize * 1.25;
    const room = box.y + box.h - top;
    const { size, lines } = layout(e.text, box.w, room, Math.round(clamp(yearSize * 0.68, 12, 42)), fonts.sans, (sz, max) => kit.wrapLines(g, e.text, box.w, max, { size: sz, family: fonts.sans }));
    lines.forEach((l, i) => kit.drawTracked(g, l, box.x, top + size * 0.92 + i * size * 1.22, { size, family: fonts.sans, color: colors.ink }));
  },
  demo: ({ now, locale }) => {
    const d = new Date(now);
    return { data: { day: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, items: DEMO.map((e) => ({ ...e, text: localize(e.text, locale) })) } };
  },
});
