/**
 * Cards in the spirit of MagicMirror² modules, ported from aimonitor: a
 * countdown, phrases for the time of day, today's to-dos, what's playing,
 * on this day, air quality, earthquakes nearby, rain radar and traffic.
 */
import { definePlugin } from '@kiosko/sdk';
import { airquality } from './airquality.ts';
import { compliments } from './compliments.ts';
import { countdown } from './countdown.ts';
import { earthquakes } from './earthquakes.ts';
import { nowplaying } from './nowplaying.ts';
import { onthisday } from './onthisday.ts';
import { rainmap } from './rainmap.ts';
import { tasks } from './tasks.ts';
import { trafficmap } from './trafficmap.ts';

export { airquality, compliments, countdown, earthquakes, nowplaying, onthisday, rainmap, tasks, trafficmap };

export default definePlugin({
  id: 'mirror',
  name: { en: 'Mirror cards', es: 'Tarjetas Mirror' },
  version: '0.1.0',
  description: {
    en: 'MagicMirror²-style cards: countdown, compliments, today and tomorrow, now playing, on this day, air quality, earthquakes, rain radar and traffic.',
    es: 'Tarjetas al estilo de MagicMirror²: cuenta atrás, frases, hoy y mañana, lo que suena, tal día como hoy, calidad del aire, terremotos, radar de lluvia y tráfico.',
  },
  author: 'Kiosko',
  license: 'MIT',
  icon: 'layout-grid',
  widgets: [countdown, compliments, tasks, nowplaying, onthisday, airquality, earthquakes, rainmap, trafficmap],
});
