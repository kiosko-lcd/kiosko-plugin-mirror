/**
 * Small helpers shared by the mirror cards: where the panel is, network
 * timeouts and number formats.
 */
import { homedir } from 'node:os';
import { locationOptions } from '@kiosko/sdk';

/**
 * Latitude and longitude override fields (advanced; 0, 0 = the place in
 * Settings), for the cards that look outside. The shared ones without the
 * place name, which these cards don't show. Pick with `placeOf`.
 */
export function placeOptions() {
  const { latitude, longitude } = locationOptions();
  return { latitude, longitude };
}

export const NO_PLACE = 'no coordinates: set your place in Settings, or latitude and longitude in the card options';

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
