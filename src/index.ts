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
  name: { en: 'Mirror cards', es: 'Tarjetas Mirror', 'zh-Hant': 'Mirror 卡片', 'zh-Hans': 'Mirror 卡片' },
  version: '0.2.1',
  languages: ['en', 'es', 'zh-Hant', 'zh-Hans'],
  sdk: '^0.2.0',
  permissions: {
    network: ['air-quality-api.open-meteo.com', 'www.seismicportal.eu', 'api.rainviewer.com', 'tile.openstreetmap.org', 'nominatim.openstreetmap.org', '*.wikipedia.org', 'api.tomtom.com'],
    exec: ['gdbus', 'glab'],
    devices: ['mpris'],
  },
  description: {
    en: 'MagicMirror²-style cards: countdown, compliments, today and tomorrow, now playing, on this day, air quality, earthquakes, rain radar and traffic.',
    es: 'Tarjetas al estilo de MagicMirror²: cuenta atrás, frases, hoy y mañana, lo que suena, tal día como hoy, calidad del aire, terremotos, radar de lluvia y tráfico.',
    'zh-Hant': 'MagicMirror² 風格的卡片：倒數、讚美、今天與明天、正在播放、歷史上的今天、空氣品質、地震、降雨雷達與交通。',
    'zh-Hans': 'MagicMirror² 风格的卡片：倒计时、夸夸、今天和明天、正在播放、历史上的今天、空气质量、地震、降雨雷达和路况。',
  },
  author: 'Kiosko',
  license: 'MIT',
  icon: 'layout-grid',
  widgets: [countdown, compliments, tasks, nowplaying, onthisday, airquality, earthquakes, rainmap, trafficmap],
});
