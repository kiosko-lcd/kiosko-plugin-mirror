/**
 * Air quality and pollen. A port of MMM-AirQuality over Open-Meteo's air
 * quality API (no key): the European index (EAQI) or the US one (AQI) with
 * its category, the particles and gases, and whatever pollen is in the air.
 * Pollen comes from the Copernicus models, in Europe and in season only; its
 * levels (low, moderate, high) are a rough guide.
 */
import { defineWidget, hanScript, placeOf, t, type Localized } from '@kiosko/sdk';
import { clamp, fmt, noPlace, placeOptions, within } from './util.ts';

export const POLLEN = {
  grass_pollen: { en: 'Grass', es: 'Gramíneas', 'zh-Hant': '禾草', 'zh-Hans': '禾草' },
  olive_pollen: { en: 'Olive', es: 'Olivo', 'zh-Hant': '橄欖', 'zh-Hans': '橄榄' },
  birch_pollen: { en: 'Birch', es: 'Abedul', 'zh-Hant': '樺樹', 'zh-Hans': '桦树' },
  alder_pollen: { en: 'Alder', es: 'Aliso', 'zh-Hant': '赤楊', 'zh-Hans': '桤木' },
  mugwort_pollen: { en: 'Mugwort', es: 'Artemisa', 'zh-Hant': '艾草', 'zh-Hans': '艾蒿' },
  ragweed_pollen: { en: 'Ragweed', es: 'Ambrosía', 'zh-Hant': '豚草', 'zh-Hans': '豚草' },
} as const satisfies Record<string, Localized>;
export type PollenKey = keyof typeof POLLEN;

export type AqiIndex = 'european' | 'us';

/**
 * The index to show for `auto`: the European one, but the US scale for
 * readers of Chinese, Japanese and Korean (the 0–500 scale their own
 * agencies use too; the European one means nothing there).
 */
export function resolveIndex(option: AqiIndex | 'auto', locale: string): AqiIndex {
  return option === 'auto' ? (hanScript(locale) ? 'us' : 'european') : option;
}

/**
 * Whether a place is under the Copernicus European model, the only one
 * with pollen (30–72° N, 25° W–45° E). Elsewhere Open-Meteo gives nulls or
 * zeros, so its European trees and grasses are not even asked for.
 */
export function inEurope(latitude: number, longitude: number): boolean {
  return latitude >= 30 && latitude <= 72 && longitude >= -25 && longitude <= 45;
}

export interface AirData {
  /** The index asked for (`index`); absent in old readings means European. */
  index?: AqiIndex;
  aqi: number;
  pm2_5: number;
  pm10: number;
  ozone: number;
  no2: number;
  pollen: Partial<Record<PollenKey, number>>;
  /** False outside Europe, where there is no pollen model (nothing to say, not "no pollen"). */
  pollenHere?: boolean;
}

/** The bands of the European index; Spanish names as the MITECO uses them. */
const BANDS: { max: number; label: Localized }[] = [
  { max: 20, label: { en: 'Good', es: 'Buena', 'zh-Hant': '良好', 'zh-Hans': '良好' } },
  { max: 40, label: { en: 'Fair', es: 'Razonablemente buena', 'zh-Hant': '尚可', 'zh-Hans': '一般' } },
  { max: 60, label: { en: 'Moderate', es: 'Regular', 'zh-Hant': '普通', 'zh-Hans': '中等' } },
  { max: 80, label: { en: 'Poor', es: 'Desfavorable', 'zh-Hant': '不良', 'zh-Hans': '较差' } },
  { max: 100, label: { en: 'Very poor', es: 'Muy desfavorable', 'zh-Hant': '很差', 'zh-Hans': '很差' } },
  { max: Infinity, label: { en: 'Extremely poor', es: 'Extremadamente desfavorable', 'zh-Hant': '極差', 'zh-Hans': '极差' } },
];

/** The bands of the US EPA index (AirNow's names). */
const US_BANDS: { max: number; label: Localized }[] = [
  { max: 50, label: { en: 'Good', es: 'Buena', 'zh-Hant': '良好', 'zh-Hans': '良好' } },
  { max: 100, label: { en: 'Moderate', es: 'Moderada', 'zh-Hant': '普通', 'zh-Hans': '中等' } },
  { max: 150, label: { en: 'Unhealthy for sensitive groups', es: 'Dañina para grupos sensibles', 'zh-Hant': '對敏感族群不健康', 'zh-Hans': '对敏感人群不健康' } },
  { max: 200, label: { en: 'Unhealthy', es: 'Dañina', 'zh-Hant': '對所有族群不健康', 'zh-Hans': '不健康' } },
  { max: 300, label: { en: 'Very unhealthy', es: 'Muy dañina', 'zh-Hant': '非常不健康', 'zh-Hans': '非常不健康' } },
  { max: Infinity, label: { en: 'Hazardous', es: 'Peligrosa', 'zh-Hant': '危害', 'zh-Hans': '危险' } },
];

/** The index's name on the card. */
export const INDEX_NAME: Record<AqiIndex, string> = { european: 'EAQI', us: 'AQI' };

export function aqiCategory(aqi: number, index: AqiIndex = 'european'): { label: Localized; level: 0 | 1 | 2 | 3 | 4 | 5 } {
  const bands = index === 'us' ? US_BANDS : BANDS;
  const i = bands.findIndex((b) => aqi <= b.max);
  return { label: bands[i]!.label, level: i as 0 | 1 | 2 | 3 | 4 | 5 };
}

/** Rough pollen level, in grains per m³. */
export function pollenLevel(grains: number): 'low' | 'moderate' | 'high' {
  return grains < 10 ? 'low' : grains < 50 ? 'moderate' : 'high';
}

const LEVEL_NAME: Record<ReturnType<typeof pollenLevel>, Localized> = {
  low: { en: 'low', es: 'bajo', 'zh-Hant': '低', 'zh-Hans': '低' },
  moderate: { en: 'moderate', es: 'moderado', 'zh-Hant': '中', 'zh-Hans': '中' },
  high: { en: 'high', es: 'alto', 'zh-Hant': '高', 'zh-Hans': '高' },
};

/** The indexes' own colour scales, from green to purple (the US one ends in maroon). */
const LEVEL_COLOR: Record<AqiIndex, string[]> = {
  european: ['#3FCB7E', '#9BD45A', '#FFB020', '#FF8A3D', '#F5453D', '#B05CFF'],
  us: ['#3FCB7E', '#F2D230', '#FF8A3D', '#F5453D', '#B05CFF', '#A0304A'],
};

/** Open-Meteo's `current` block → our data. */
export function parseAir(current: Record<string, number | null | undefined>, index: AqiIndex = 'european', withPollen = true): AirData {
  const pollen: AirData['pollen'] = {};
  if (withPollen) for (const k of Object.keys(POLLEN) as PollenKey[]) if ((current[k] ?? 0) > 0) pollen[k] = current[k]!;
  const aqi = index === 'us' ? current.us_aqi : current.european_aqi;
  return { index, aqi: Math.round(aqi ?? 0), pm2_5: current.pm2_5 ?? 0, pm10: current.pm10 ?? 0, ozone: current.ozone ?? 0, no2: current.nitrogen_dioxide ?? 0, pollen, ...(withPollen ? {} : { pollenHere: false }) };
}

const DEMO: AirData = { index: 'european', aqi: 34, pm2_5: 8.2, pm10: 17.4, ozone: 61, no2: 12.6, pollen: { olive_pollen: 22, grass_pollen: 6.5 } };

export const airquality = defineWidget({
  id: 'airquality',
  name: { en: 'Air quality', es: 'Calidad del aire', 'zh-Hant': '空氣品質', 'zh-Hans': '空气质量' },
  description: { en: 'Air quality index (European or US), particles, gases and pollen where you are (Open-Meteo).', es: 'Índice de calidad del aire (europeo o de EE. UU.), partículas, gases y polen donde estás (Open-Meteo).', 'zh-Hant': '你所在地的空氣品質指標（歐洲或美國）、懸浮微粒、氣體與花粉（Open-Meteo）。', 'zh-Hans': '你所在地的空气质量指数（欧洲或美国标准）、颗粒物、气体和花粉（Open-Meteo）。' },
  icon: 'wind',
  category: 'info',
  tags: ['magicmirror', 'weather', 'pollen'],
  size: { min: { w: 240, h: 130 }, preferred: { w: 400, h: 300 } },
  options: t.object({
    index: t.enum(['auto', 'european', 'us'] as const, {
      label: { en: 'Index', es: 'Índice', 'zh-Hant': '指標', 'zh-Hans': '指数' },
      help: { en: 'Automatic: the US one for Chinese, Japanese and Korean, the European one otherwise.', es: 'Automático: el de EE. UU. en chino, japonés y coreano; el europeo en los demás idiomas.', 'zh-Hant': '自動：中文、日文與韓文使用美國指標，其他語言使用歐洲指標。', 'zh-Hans': '自动：中文、日文和韩文使用美国指数，其他语言使用欧洲指数。' },
      labels: { auto: { en: 'Automatic', es: 'Automático', 'zh-Hant': '自動', 'zh-Hans': '自动' }, european: { en: 'European (EAQI, 0–100+)', es: 'Europeo (EAQI, 0–100+)', 'zh-Hant': '歐洲（EAQI，0–100+）', 'zh-Hans': '欧洲（EAQI，0–100+）' }, us: { en: 'US (AQI, 0–500)', es: 'EE. UU. (AQI, 0–500)', 'zh-Hant': '美國（AQI，0–500）', 'zh-Hans': '美国（AQI，0–500）' } },
    }),
    onlyAbove: t.integer({
      default: 0,
      min: 0,
      max: 500,
      label: { en: 'Only from index', es: 'Sólo desde el índice', 'zh-Hant': '指標達到才顯示', 'zh-Hans': '指数达到才显示' },
      help: {
        en: '0: always. Otherwise it takes its turn only when the index reaches this, on its own scale (European: 40 is moderate, 60 poor; US: 100 is unhealthy for sensitive groups).',
        es: '0: siempre. Si no, sólo sale cuando el índice llega a esto, en su escala (europeo: 40 es regular, 60 desfavorable; EE. UU.: 100 es dañina para grupos sensibles).',
        'zh-Hant': '0：一律顯示。否則只在指標達到此值時才輪到它，依各自的標準（歐洲：40 為普通，60 為不良；美國：100 為對敏感族群不健康）。',
        'zh-Hans': '0：始终显示。否则只在指数达到此值时才轮到它，按各自的标准（欧洲：40 为中等，60 为较差；美国：100 为对敏感人群不健康）。',
      },
    }),
    showPollen: t.boolean({ default: true, label: { en: 'Show pollen', es: 'Mostrar el polen', 'zh-Hant': '顯示花粉', 'zh-Hans': '显示花粉' } }),
    ...placeOptions(),
  }),
  intervalMs: 30 * 60_000,
  async fetch({ options, location, locale, signal }): Promise<AirData> {
    const at = placeOf(options, location);
    if (!at) throw noPlace();
    const index = resolveIndex(options.index, locale);
    const europe = inEurope(at.latitude, at.longitude);
    const vars = [index === 'us' ? 'us_aqi' : 'european_aqi', 'pm10', 'pm2_5', 'ozone', 'nitrogen_dioxide', ...(europe ? Object.keys(POLLEN) : [])].join(',');
    const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${at.latitude}&longitude=${at.longitude}&current=${vars}&timezone=auto`, { signal: within(signal, 10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseAir(((await res.json()) as { current?: Record<string, number | null> }).current ?? {}, index, europe);
  },
  visible: ({ data, options }) => Boolean(data) && (options.onlyAbove <= 0 || data!.aqi >= options.onlyAbove),
  render(g, { data, box, theme, kit, t: tr, locale, options }) {
    if (!data) return;
    const { colors, fonts } = theme;
    const index = data.index ?? 'european';
    const cat = aqiCategory(data.aqi, index);
    const col = LEVEL_COLOR[index][cat.level]!;
    const label = tr(cat.label);
    const indexName = INDEX_NAME[index];
    const gases: [string, number][] = [[tr({ en: 'PM2.5', es: 'PM2,5', 'zh-Hant': 'PM2.5', 'zh-Hans': 'PM2.5' }), data.pm2_5], ['PM10', data.pm10], ['O₃', data.ozone], ['NO₂', data.no2]];
    const pollen = (Object.entries(data.pollen) as [PollenKey, number][]).sort((a, b) => b[1] - a[1]);
    // Outside Europe there is no pollen to tell: no column for it.
    const showPollen = options.showPollen && data.pollenHere !== false;

    /** Pollen as name over level, left to right, as many as fit in `w`. */
    const drawPollen = (x0: number, y: number, w: number, ps: number, vertical: boolean) => {
      if (!pollen.length) {
        const msg = tr({ en: 'No pollen in the air', es: 'Sin polen en el aire', 'zh-Hant': '空氣中沒有花粉', 'zh-Hans': '空气中没有花粉' });
        kit.drawTracked(g, kit.truncate(g, msg, w, { size: ps, family: fonts.sans }), x0, y, { size: ps, family: fonts.sans, color: colors.inkDim });
        return;
      }
      let px = x0, py = y;
      for (const [key, v] of pollen.slice(0, 4)) {
        const lvl = pollenLevel(v);
        const lc = lvl === 'high' ? colors.alert : lvl === 'moderate' ? colors.warn : colors.ok;
        const name = tr(POLLEN[key]), lvlText = tr(LEVEL_NAME[lvl]);
        const ls = Math.round(ps * 0.8);
        if (vertical) {
          if (py > box.y + box.h + 1) break;
          const nw = kit.drawTracked(g, kit.truncate(g, name, w, { size: ps, family: fonts.sans }), px, py, { size: ps, family: fonts.sans, color: colors.ink });
          if (nw + ps * 0.4 + kit.measureTracked(g, lvlText, { size: ls, family: fonts.sans }) <= w) kit.drawTracked(g, lvlText, px + nw + ps * 0.4, py, { size: ls, family: fonts.sans, color: lc });
          py += ps * 1.3;
          continue;
        }
        const need = Math.max(kit.measureTracked(g, name, { size: ps, family: fonts.sans }), kit.measureTracked(g, lvlText, { size: ls, family: fonts.sans }));
        if (px + need > x0 + w) break;
        kit.drawTracked(g, name, px, py, { size: ps, family: fonts.sans, color: colors.ink });
        kit.drawTracked(g, lvlText, px, py + ps * 1.1, { size: ls, family: fonts.sans, color: lc });
        px += need + ps;
      }
    };

    if (box.w >= 440 && box.w >= box.h * 2.2) {
      // Wide and short: index | gases (2 × 2) | pollen, side by side.
      const k = clamp(box.h / 150, 0.5, 1.6);
      const colW = box.w / (showPollen ? 3.1 : 2.2);
      const big = Math.round(Math.min(box.h * 0.62, colW * 0.5));
      const w = kit.drawTracked(g, String(data.aqi), box.x, box.y + big * 0.86, { size: big, family: fonts.sansBold, color: col });
      kit.drawTracked(g, indexName, box.x + w + 10 * k, box.y + big * 0.4, { size: Math.round(20 * k), family: fonts.sans, color: colors.inkDim });
      const ls = kit.fitSize(g, label, colW - 8, { size: Math.round(28 * k), family: fonts.sans }, Math.round(14 * k));
      kit.drawTracked(g, kit.truncate(g, label, colW - 8, { size: ls, family: fonts.sans }), box.x, box.y + big * 0.86 + ls * 1.4, { size: ls, family: fonts.sans, color: col });
      const gx0 = box.x + colW, gw = colW * 0.55;
      const vs = Math.round(clamp(box.h * 0.24, 14, 44)), us = Math.round(vs * 0.42);
      gases.forEach(([name, v], i) => {
        const gx = gx0 + (i % 2) * gw, gy = box.y + vs * 0.9 + Math.floor(i / 2) * (box.h / 2);
        kit.drawTracked(g, fmt(Math.round(v), locale), gx, gy, { size: vs, family: fonts.sans, color: colors.ink });
        kit.drawTracked(g, `${name} µg/m³`, gx, gy + us * 1.3, { size: us, family: fonts.sans, color: colors.inkDim });
      });
      if (showPollen) drawPollen(gx0 + 2 * gw + 8 * k, box.y + vs * 0.7, box.x + box.w - (gx0 + 2 * gw + 8 * k), Math.round(clamp(box.h * 0.17, 12, 30)), true);
      return;
    }

    // Stacked: everything scales from one unit (reference layout 368 × 290).
    // In units of k the content is ~305 tall with the pollen row and ~210 without
    // (index, gases, their names and µg/m³ under them): scale to that, or it hangs out of the box.
    const k1 = Math.min(box.w / 368, box.h / 305);
    const withPollen = showPollen && k1 >= 0.6;
    const k = clamp(withPollen ? k1 : Math.min(box.w / 368, box.h / 210), 0.35, 1.6);
    const big = Math.round(100 * k);
    const top = box.y + big * 0.86;
    const w = kit.drawTracked(g, String(data.aqi), box.x, top, { size: big, family: fonts.sansBold, color: col });
    const gap = 14 * k;
    kit.drawTracked(g, indexName, box.x + w + gap, top - big * 0.5, { size: Math.round(24 * k), family: fonts.sans, color: colors.inkDim });
    const ls = kit.fitSize(g, label, box.w - w - gap, { size: Math.round(34 * k), family: fonts.sans }, Math.round(20 * k));
    kit.drawTracked(g, kit.truncate(g, label, box.w - w - gap, { size: ls, family: fonts.sans }), box.x + w + gap, top, { size: ls, family: fonts.sans, color: col });

    const gw = box.w / gases.length;
    const gy = top + 72 * k;
    const unitSize = Math.round(clamp(18 * k, 10, 26));
    gases.forEach(([name, v], i) => {
      const gx = box.x + i * gw;
      kit.drawTracked(g, fmt(Math.round(v), locale), gx, gy, { size: Math.round(44 * k), family: fonts.sans, color: colors.ink });
      kit.drawTracked(g, kit.truncate(g, name, gw - 4, { size: unitSize, family: fonts.sans }), gx, gy + 26 * k, { size: unitSize, family: fonts.sans, color: colors.inkDim });
    });
    kit.drawTracked(g, 'µg/m³', box.x + box.w, gy + 26 * k + unitSize * 1.1, { size: Math.round(unitSize * 0.85), family: fonts.sans, color: colors.inkFaint, align: 'right' });
    if (withPollen) drawPollen(box.x, gy + 88 * k, box.w, Math.round(30 * k), false);
  },
  demo: () => ({ data: DEMO }),
});
