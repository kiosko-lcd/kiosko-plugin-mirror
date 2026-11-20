/**
 * Small helpers shared by the mirror cards: where the panel is, network
 * timeouts and number formats.
 */
import { homedir } from 'node:os';
import { locationOptions, PluginError, type Localized } from '@kiosko/sdk';

/**
 * Latitude and longitude override fields (advanced; 0, 0 = the place in
 * Settings), for the cards that look outside. The shared ones without the
 * place name, which these cards don't show. Pick with `placeOf`.
 */
export function placeOptions() {
  const { latitude, longitude } = locationOptions();
  return { latitude, longitude };
}

export const NO_PLACE = {
  en: 'No coordinates: set your place in Settings, or latitude and longitude in the card options',
  es: 'Sin coordenadas: pon tu ubicación en Ajustes, o latitud y longitud en las opciones de la tarjeta',
  'zh-Hant': '沒有座標：請在「設定」中設定你的位置，或在小工具選項中填入緯度和經度',
  'zh-Hans': '没有坐标：请在“设置”中设置你的位置，或在小组件选项中填写纬度和经度',
  de: 'Keine Koordinaten: Lege deinen Standort in den Einstellungen fest oder Breiten- und Längengrad in den Optionen der Karte',
} satisfies Localized;

/** The error for a card with no place to look at: the user reads it in their language. */
export const noPlace = () => new PluginError(NO_PLACE);

/** The widget's abort signal plus a timeout, for one network request. */
export const within = (signal: AbortSignal, ms: number): AbortSignal => AbortSignal.any([signal, AbortSignal.timeout(ms)]);

export const USER_AGENT = 'Kiosko LCD panel (plugin mirror)';

/** `~/x` → `/home/me/x`. */
export function expandHome(p: string): string {
  return p === '~' ? homedir() : p.startsWith('~/') ? `${homedir()}${p.slice(1)}` : p;
}

/** Number with the locale's decimal mark and a fixed number of decimals. */
export function fmt(n: number, locale: string, decimals = 0): string {
  try {
    return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  } catch {
    return n.toFixed(decimals);
  }
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** `YYYY-MM-DD` of a local day. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` of the day `days` after the one of `now`. */
export function dayOffset(now: number, days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return dayKey(d.getTime());
}
