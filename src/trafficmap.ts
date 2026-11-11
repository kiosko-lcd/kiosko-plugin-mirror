/**
 * Live traffic flow around the configured place, using TomTom's raster
 * basemap and traffic tiles. The free tier requires an API key.
 */
import { defineWidget, placeOf, t, type Box, type Canvas, type Graphics, type RenderContext } from '@kiosko/sdk';
import { tilesAround, worldPx } from './rainmap.ts';
import { clamp, NO_PLACE, placeOptions, USER_AGENT, within } from './util.ts';

const OUT_W = 660, OUT_H = 400, SCALE = 1.5;
const MAX_LAT = 85.05112878;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface TrafficData {
  img?: Canvas;
  time: number;
  credit: string;
}

async function request(path: string, key: string, signal: AbortSignal): Promise<Response> {
  const res = await fetch(`https://api.tomtom.com${path}`, {
    headers: { 'User-Agent': USER_AGENT, 'TomTom-Api-Key': key },
    signal: within(signal, 10_000),
  });
  if (!res.ok) throw new Error(`TomTom HTTP ${res.status}`);
  return res;
}

async function tile(path: string, key: string, signal: AbortSignal): Promise<Buffer> {
  const buf = Buffer.from(await (await request(path, key, signal)).arrayBuffer());
  if (buf.length < PNG_SIGNATURE.length || !buf.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('TomTom returned an invalid PNG tile');
  }
  return buf;
}

function drawSampleTraffic(g: Graphics, box: Box, kit: RenderContext<unknown, unknown>['kit']): void {
  g.save();
  g.beginPath();
  g.rect(box.x, box.y, box.w, box.h);
  g.clip();
  g.fillStyle = '#0B0F14';
  g.fillRect(box.x, box.y, box.w, box.h);
  const rnd = kit.rng(37);
  for (let i = 0; i < 13; i++) {
    g.strokeStyle = i % 4 === 0 ? '#e22503' : i % 3 === 0 ? '#db9200' : '#118845';
    g.lineWidth = Math.max(2, box.h * 0.012);
    g.beginPath();
    g.moveTo(box.x + rnd() * box.w, box.y);
    g.bezierCurveTo(box.x + rnd() * box.w, box.y + box.h / 3, box.x + rnd() * box.w, box.y + box.h * 2 / 3, box.x + rnd() * box.w, box.y + box.h);
    g.stroke();
  }
  g.restore();
}

export const trafficmap = defineWidget({
  id: 'trafficmap',
  name: { en: 'Traffic map', es: 'Mapa de tráfico' },
  description: {
    en: 'Live traffic flow around your place on a dark TomTom map.',
    es: 'Tráfico en tiempo real alrededor de tu ubicación sobre un mapa oscuro de TomTom.',
  },
  icon: 'car',
  category: 'info',
  tags: ['traffic', 'map', 'roads'],
  size: { min: { w: 200, h: 140 }, preferred: { w: 600, h: 440 } },
  options: t.object({
    apiKey: t.string({
      default: '', secret: true,
      label: { en: 'TomTom API key', es: 'Clave API de TomTom' },
      help: { en: 'Create a free account at tomtom.com and enable Map Display and Traffic APIs.', es: 'Crea una cuenta gratuita en tomtom.com y habilita las API Map Display y Traffic.' },
    }),
    zoom: t.integer({
      default: 12, min: 8, max: 16,
      label: { en: 'Zoom', es: 'Zoom' },
      help: { en: 'Higher numbers show a smaller area in more detail.', es: 'Un número mayor muestra una zona más pequeña con más detalle.' },
    }),
    ...placeOptions(),
  }),
  intervalMs: 10 * 60_000,
  async fetch({ options, location, canvas, signal, now }): Promise<TrafficData> {
    const at = placeOf(options, location);
    if (!at) throw new Error(NO_PLACE);
    const key = options.apiKey.trim();
    if (!key) throw new Error('Set a TomTom API key in the traffic map options');
    if (!Number.isFinite(at.latitude) || !Number.isFinite(at.longitude) || Math.abs(at.latitude) > 90 || Math.abs(at.longitude) > 180) {
      throw new Error('Invalid traffic map coordinates');
    }

    const zoom = options.zoom;
    const center = worldPx(clamp(at.latitude, -MAX_LAT, MAX_LAT), at.longitude, zoom);
    const n = 2 ** zoom;
    const tiles = tilesAround(center.x, center.y, OUT_W / SCALE, OUT_H / SCALE).filter((t) => t.y >= 0 && t.y < n);
    const [caption, images] = await Promise.all([
      request('/maps/orbis/copyrights/caption?apiVersion=2', key, signal).then((res) => res.json() as Promise<{ copyrightsCaption?: unknown }>),
      Promise.all(tiles.map(async (t) => {
        const x = ((t.x % n) + n) % n;
        const coords = `${zoom}/${x}/${t.y}`;
        const [base, flow] = await Promise.all([
          tile(`/maps/orbis/display/raster/tile/${coords}?apiVersion=2&style=street-dark`, key, signal),
          tile(`/maps/orbis/traffic/flow/raster/tile/${coords}?apiVersion=2&style=dark`, key, signal),
        ]);
        return { ...t, base: await canvas.loadImage(base), flow: await canvas.loadImage(flow) };
      })),
    ]);
    if (typeof caption.copyrightsCaption !== 'string' || !caption.copyrightsCaption.trim()) {
      throw new Error('TomTom returned no map attribution');
    }
    const out = canvas.createCanvas(OUT_W, OUT_H);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#0B0F14';
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    for (const image of images) {
      const x = image.dx * SCALE, y = image.dy * SCALE, size = 256 * SCALE;
      ctx.drawImage(image.base, x, y, size, size);
      ctx.drawImage(image.flow, x, y, size, size);
    }
    return { img: out, time: now, credit: caption.copyrightsCaption };
  },
  render(g, { data, box, theme, kit, fmt, t: tr }) {
    if (!data) return;
    if (data.img) {
      const k = Math.max(box.w / OUT_W, box.h / OUT_H);
      const sw = box.w / k, sh = box.h / k;
      g.drawImage(data.img, (OUT_W - sw) / 2, (OUT_H - sh) / 2, sw, sh, box.x, box.y, box.w, box.h);
    } else {
      drawSampleTraffic(g, box, kit);
    }
    g.strokeStyle = theme.colors.warn;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(box.x + box.w / 2, box.y + box.h / 2, clamp(box.h * 0.03, 5, 9), 0, Math.PI * 2);
    g.stroke();
    const size = Math.round(clamp(box.h * 0.07, 11, 24));
    const creditSize = Math.round(clamp(size * 0.55, 9, 13));
    g.fillStyle = 'rgba(0,0,0,0.70)';
    g.fillRect(box.x, box.y + box.h - size - creditSize - 12, box.w, size + creditSize + 12);
    kit.drawTracked(g, `${tr({ en: 'traffic', es: 'tráfico' })} ${fmt.time(data.time)}`, box.x + 8, box.y + box.h - creditSize - 8, { size, family: theme.fonts.mono, color: '#E6EDF5' });
    kit.drawTracked(g, data.credit, box.x + 8, box.y + box.h - 4, { size: creditSize, family: theme.fonts.sans, color: '#E6EDF5' });
  },
  demo: ({ now }) => ({ data: { time: now, credit: '©TomTom, ©OpenStreetMap' } satisfies TrafficData }),
});
