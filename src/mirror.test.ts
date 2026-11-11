import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as kit from '@loksly/lcd-canvas-kit';
import { createBaseContext, localize, defaultsOf, validate, DEFAULT_THEME, DEFAULT_WORKDAY } from '@kiosko/sdk';
import { airquality, aqiCategory, parseAir, pollenLevel } from './airquality.ts';
import { phrasesFor, pick, poolFor } from './compliments.ts';
import { countdown, countdownLevel, daysUntil, upcoming } from './countdown.ts';
import { compass, distanceBearing, earthquakes, parseEmsc } from './earthquakes.ts';
import { choosePlayer, parsePlayer, positionAt } from './nowplaying.ts';
import { cleanText, wikiLang, yearsAgo } from './onthisday.ts';
import { isPng, tilesAround, wetFraction, worldPx } from './rainmap.ts';
import { ISSUE_QUERIES, issuesByDay, mergeIssues, parseTaskFile, sortTasks, tasks } from './tasks.ts';
import { trafficmap } from './trafficmap.ts';
import { compliments } from './compliments.ts';
import { nowplaying } from './nowplaying.ts';
import { rainmap } from './rainmap.ts';
import plugin from './index.ts';

const at = (iso: string) => new Date(iso).getTime();
const es = (x: Parameters<typeof localize>[0]) => localize(x, 'es');
const en = (x: Parameters<typeof localize>[0]) => localize(x, 'en');

test('countdown: calendar days, today kept, past ones out, nearest first', () => {
  const now = at('2026-10-10T23:30:00');
  assert.equal(daysUntil('2026-10-10', now), 0);
  assert.equal(daysUntil('2026-10-11', now), 1, 'at 23:30, tomorrow is 1 even if it is half an hour away');
  assert.equal(daysUntil('not a date', now), null);
  const list = upcoming([{ name: 'far', date: '2027-01-25' }, { name: 'past', date: '2026-10-01' }, { name: 'today', date: '2026-10-10' }, { name: 'bad', date: 'x' }], now);
  assert.deepEqual(list.map((e) => e.name), ['today', 'far']);
  assert.equal(upcoming([{ name: 'a', date: '2026-10-11' }, { name: 'b', date: '2026-10-12' }], now).length, 2, 'all of them: rows decide how many show');
});

test('countdown: yearly dates come back; thresholds in days; rows replace "max"', () => {
  const now = at('2026-10-10T12:00:00');
  assert.equal(daysUntil('1990-10-12', now, true), 2, 'a birthday two days ahead, whatever the year');
  assert.equal(daysUntil('1990-10-10', now, true), 0, 'today it is today');
  assert.equal(daysUntil('1990-10-09', now, true), 364, 'yesterday: next year');
  assert.ok(daysUntil('1990-10-09', now)! < -13000, 'not yearly: long gone');
  assert.equal(daysUntil('2024-02-29', at('2027-02-27T09:00:00'), true), 1, 'a leap day falls on the 28th');
  assert.deepEqual(upcoming([{ name: 'gone', date: '2020-10-09' }, { name: 'bday', date: '2020-10-09', yearly: true }], now).map((e) => e.name), ['bday']);
  const o = { warnDays: 7, alertDays: 1 };
  assert.deepEqual([0, 1, 2, 7, 8].map((d) => countdownLevel(d, o)), ['alert', 'alert', 'warn', 'warn', 'normal']);
  assert.equal(countdownLevel(1, { warnDays: 30, alertDays: 0 }), 'warn');
  const d = defaultsOf(countdown.options!);
  assert.deepEqual({ rows: d.rows, warnDays: d.warnDays, alertDays: d.alertDays }, { rows: 4, warnDays: 7, alertDays: 1 });
  assert.equal('max' in d, false);
  const state = (events: { name: string; date: string; yearly: boolean }[]) => ({ options: { ...d, events }, data: undefined, sources: {}, now, working: true, workday: DEFAULT_WORKDAY });
  assert.equal(countdown.empty!(state([{ name: 'gone', date: '2020-01-01', yearly: false }])), true);
  assert.equal(countdown.empty!(state([{ name: 'bday', date: '2020-01-01', yearly: true }])), false);
});

test('compliments: by time of day, stable for changeMs, built-in phrases when none are set', () => {
  const p = { morning: ['m'], afternoon: ['t'], evening: ['n'], anytime: ['x'] };
  assert.deepEqual(poolFor(p, 9), ['m', 'x']);
  assert.deepEqual(poolFor(p, 13), ['t', 'x']);
  assert.deepEqual(poolFor(p, 1), ['n', 'x']);
  const t = at('2026-10-10T09:00:00');
  assert.equal(pick(p, t, 30 * 60_000), pick(p, t + 60_000, 30 * 60_000), 'does not change on every repaint');
  assert.equal(pick({ ...p, morning: [], anytime: [] }, t, 60_000), null);
  const empty = { morning: [], afternoon: [], evening: [], anytime: [] };
  assert.ok(phrasesFor(empty, (x) => localize(x, 'es-ES')).morning.includes('Buenos días.'));
  assert.ok(phrasesFor(empty, (x) => localize(x, 'en-GB')).morning.includes('Good morning.'));
  assert.ok(phrasesFor(empty, (x) => localize(x, 'de')).morning.includes('Good morning.'), 'any other language: English');
  assert.equal(phrasesFor(p, es), p);
  assert.deepEqual(compliments.options!.props.align.values, ['left', 'center', 'right']);
});

test('tasks: open boxes by section (English or Spanish) and by date; late ones go to today', () => {
  const now = at('2026-10-10T12:00:00');
  const d = parseTaskFile(['# Hoy', '- [ ] a', '- [x] done', '## Tomorrow', '- [ ] b', '- [ ] old @2026-10-01', '* [ ] c 📅 2026-10-11', '## Something else', '- [ ] no section', '- [ ] far @2026-12-01'].join('\n'), now);
  assert.deepEqual(d.today, [{ kind: 'task', text: 'a' }, { kind: 'task', text: 'old', late: true }]);
  assert.deepEqual(d.tomorrow, [{ kind: 'task', text: 'b' }, { kind: 'task', text: 'c' }]);
  const i = issuesByDay([{ title: 'x', due_date: '2026-10-09', references: { short: '#1' } }, { title: 'y', due_date: '2026-10-11' }, { title: 'z', due_date: null }], now);
  assert.deepEqual(i.today, [{ kind: 'issue', text: '#1 x', late: true }]);
  assert.deepEqual(i.tomorrow, [{ kind: 'issue', text: 'y' }]);
  const merged = mergeIssues([[{ id: 1, title: 'old', due_date: '2026-08-01' }], [{ id: 1, title: 'old', due_date: '2026-08-01' }, { id: 2, title: 'y', due_date: '2026-10-11' }]]);
  assert.deepEqual(merged.map((x) => x.id), [1, 2], 'each issue once');
  assert.deepEqual(issuesByDay(merged, now).today, [{ kind: 'issue', text: 'old', late: true }], 'two months late still shows');
  assert.ok(ISSUE_QUERIES.some((q) => q.includes('due_date=overdue')), 'every overdue issue is asked for, not only the last two weeks');
  const sorted = sortTasks([{ kind: 'task', text: 'r' }, { kind: 'task', text: 'l', late: true }, { kind: 'meeting', text: 'm2', time: '15:00' }, { kind: 'meeting', text: 'm1', time: '09:00' }]);
  assert.deepEqual(sorted.map((s) => s.text), ['m1', 'm2', 'l', 'r']);
});

test('tasks: options; empty when nothing is due in the days shown', () => {
  const d = defaultsOf(tasks.options!);
  assert.deepEqual({ includeIssues: d.includeIssues, showTomorrow: d.showTomorrow, rows: d.rows }, { includeIssues: false, showTomorrow: true, rows: 0 });
  const state = (showTomorrow: boolean) => ({ options: { ...d, showTomorrow }, data: { today: [], tomorrow: [{ kind: 'task' as const, text: 'b' }] }, sources: {}, now: 0, working: true, workday: DEFAULT_WORKDAY });
  assert.equal(tasks.empty!(state(true)), false);
  assert.equal(tasks.empty!(state(false)), true, 'tomorrow hidden: nothing to show');
});

test('now playing: reads gdbus output (GVariant as text) and picks the player', () => {
  const out = `({'PlaybackStatus': <'Playing'>, 'Position': <int64 80000000>, 'Metadata': <{'mpris:trackid': <objectpath '/x'>, 'mpris:length': <uint64 210000000>, 'xesam:title': <"Don't Stop">, 'xesam:artist': <['Fleetwood Mac', 'Other']>, 'xesam:album': <'Rumours'>, 'mpris:artUrl': <'file:///tmp/a.jpg'>}>},)`;
  const p = parsePlayer(out, 'spotify', 1000);
  assert.deepEqual({ ...p }, { player: 'spotify', status: 'Playing', title: "Don't Stop", artists: ['Fleetwood Mac', 'Other'], album: 'Rumours', artUrl: 'file:///tmp/a.jpg', lengthMs: 210000, positionMs: 80000, at: 1000 });
  const stopped = parsePlayer(`({'PlaybackStatus': <'Stopped'>, 'Metadata': <{'mpris:length': <int64 0>}>},)`, 'chromium', 0);
  assert.equal(stopped.status, 'Stopped');
  const paused = { ...p, player: 'vlc', status: 'Paused' as const };
  assert.equal(choosePlayer([paused, p], '')?.player, 'spotify', 'playing beats paused');
  assert.equal(choosePlayer([paused, { ...p, player: 'chromium' }], 'vlc')?.player, 'chromium', 'a playing one beats a paused preferred one');
  assert.equal(choosePlayer([stopped], ''), null);
  assert.equal(positionAt(p, 6000), 85000);
  assert.equal(positionAt(p, 10_000_000), 210000, 'never past the end');
});

test('air quality: European index bands and pollen levels', () => {
  assert.deepEqual([0, 20, 21, 55, 79, 100, 150].map((a) => aqiCategory(a).level), [0, 0, 1, 2, 3, 4, 5]);
  assert.deepEqual(aqiCategory(25).label, { en: 'Fair', es: 'Razonablemente buena' });
  assert.deepEqual([40, 51, 120, 160, 250, 400].map((a) => aqiCategory(a, 'us').level), [0, 1, 2, 3, 4, 5]);
  assert.equal(parseAir({ us_aqi: 87.4, european_aqi: 30 }, 'us').aqi, 87);
  assert.equal(parseAir({ us_aqi: 87.4, european_aqi: 30 }).aqi, 30);
  const o = defaultsOf(airquality.options!);
  const visible = (onlyAbove: number, aqi: number) => airquality.visible!({ options: { ...o, onlyAbove }, data: { ...parseAir({ european_aqi: aqi }) }, sources: {}, now: 0, working: true, workday: DEFAULT_WORKDAY });
  assert.equal(visible(0, 10), true, '0: always');
  assert.equal(visible(40, 39), false);
  assert.equal(visible(40, 40), true);
  assert.deepEqual([0.8, 30, 120].map(pollenLevel), ['low', 'moderate', 'high']);
  const d = parseAir({ european_aqi: 33.6, pm2_5: 7, pm10: null, olive_pollen: 12, grass_pollen: 0 });
  assert.equal(d.aqi, 34);
  assert.equal(d.pm10, 0);
  assert.deepEqual(d.pollen, { olive_pollen: 12 });
});

test('on this day: no reference to the front-page photo; language from the option or the locale', () => {
  assert.equal(cleanText('Nace Tita Merello (en la imagen), actriz.'), 'Nace Tita Merello, actriz.');
  assert.equal(cleanText('Apollo 11 lands (pictured) on the Moon.'), 'Apollo 11 lands on the Moon.');
  assert.equal(cleanText('Born in Paris (France)  today.'), 'Born in Paris (France) today.');
  assert.equal(wikiLang('', 'es-ES'), 'es');
  assert.equal(wikiLang('de', 'es-ES'), 'de');
  assert.equal(wikiLang('', 'x'), 'en');
  assert.equal(yearsAgo(1, es), 'hace 1 año');
  assert.equal(yearsAgo(53, en), '53 years ago');
});

test('earthquakes: distance and bearing from home, EMSC newest first, localized words', () => {
  const home = { lat: 38.3452, lon: -0.4810 };
  const ab = distanceBearing(home, { lat: 38.4524, lon: -0.3053 });
  assert.ok(Math.abs(ab.km - 19.7) < 1, `km ${ab.km}`);
  assert.equal(compass(ab.bearing, en), 'NE');
  assert.equal(compass(359, en), 'N');
  assert.equal(compass(225, es), 'SO');
  assert.equal(compass(225, en), 'SW');
  assert.equal(compass(270, es), 'O');
  const q = parseEmsc({
    features: [
      { id: 'a', properties: { time: '2026-10-07T08:45:12.02Z', mag: 1.6, lat: 38.2003, lon: -2.3007, depth: 0 } },
      { id: 'b', properties: { time: '2026-10-09T19:49:38.92Z', mag: 2.1, lat: 37.4073, lon: -2.2632, depth: -6.2 } },
    ],
  }, home);
  assert.deepEqual(q.map((x) => x.id), ['b', 'a']);
  assert.equal(q[0]!.depth, 6.2);
  assert.equal(compass(q[0]!.bearing, es), 'SO');
  assert.deepEqual(parseEmsc({}, home), []);
});

test('rain radar: world pixels, the tiles that cover the box, wet fraction', () => {
  const p = worldPx(38.3452, -0.4810, 7);
  assert.deepEqual([Math.floor(p.x / 256), Math.floor(p.y / 256)], [63, 49]);
  const tiles = tilesAround(p.x, p.y, 440, 267);
  assert.ok(tiles.length >= 4 && tiles.length <= 9);
  assert.ok(tiles.some((t) => t.x === 63 && t.y === 49));
  for (const t of tiles) assert.ok(t.dx > -256 && t.dx < 440 && t.dy > -256 && t.dy < 267);
  assert.equal(wetFraction(new Uint8Array([0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 200])), 0.5);
  assert.ok(isPng(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])));
  assert.ok(!isPng(Buffer.from('<html>notice</html>')));
});

test('traffic map: composes flow over the map, authenticates without putting the key in URLs', async (t) => {
  const image = (color: string) => {
    const c = createCanvas(256, 256);
    c.getContext('2d').fillStyle = color;
    c.getContext('2d').fillRect(0, 0, 256, 256);
    return c.toBuffer('image/png');
  };
  const base = image('#0000ff'), flow = image('#00ff00');
  const calls: { url: string; key: string | null }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    calls.push({ url, key: new Headers(init?.headers).get('TomTom-Api-Key') });
    if (url.includes('/copyrights/')) return Response.json({ copyrightsCaption: '©TomTom, ©OpenStreetMap' });
    return new Response(new Uint8Array(url.includes('/traffic/flow/') ? flow : base), { headers: { 'Content-Type': 'image/png' } });
  });
  const options = { ...defaultsOf(trafficmap.options!), apiKey: 'test-key' };
  const ctx = { ...createBaseContext({ now: 123, location: { latitude: 37.9922, longitude: -1.1307 } }), options, canvas: { createCanvas, loadImage }, signal: new AbortController().signal, timeoutMs: 120_000, sources: {} };
  const data = await trafficmap.fetch!(ctx);
  assert.equal(data.time, 123);
  assert.equal(data.credit, '©TomTom, ©OpenStreetMap');
  assert.deepEqual([data.img?.width, data.img?.height], [660, 400]);
  assert.deepEqual([...data.img!.getContext('2d').getImageData(330, 200, 1, 1).data], [0, 255, 0, 255]);
  const screen = createCanvas(200, 140);
  const renderCtx = { ...ctx, data, box: { x: 0, y: 0, w: 200, h: 140 }, theme: DEFAULT_THEME, fonts: DEFAULT_THEME.fonts, kit, preview: false, working: true };
  assert.doesNotThrow(() => trafficmap.render(screen.getContext('2d'), renderCtx));
  assert.doesNotThrow(() => trafficmap.render(screen.getContext('2d'), { ...renderCtx, data: { time: 123, credit: '©TomTom, ©OpenStreetMap' } }));
  const bases = calls.filter((c) => c.url.includes('/display/raster/'));
  const flows = calls.filter((c) => c.url.includes('/traffic/flow/'));
  assert.ok(bases.length >= 4 && bases.length <= 9);
  assert.equal(flows.length, bases.length);
  assert.ok(calls.every((c) => c.key === 'test-key' && !c.url.includes('test-key')));
  assert.ok(bases.every((c) => c.url.includes('style=street-dark')));
  assert.ok(flows.every((c) => c.url.includes('style=dark')));
  assert.equal(trafficmap.options!.props.apiKey.secret, true);

  calls.length = 0;
  await trafficmap.fetch!({ ...ctx, location: { latitude: 90, longitude: 180 } });
  for (const c of calls.filter((c) => c.url.includes('/raster/tile/'))) {
    const match = c.url.match(/\/tile\/12\/(\d+)\/(\d+)/);
    assert.ok(match);
    assert.ok(Number(match[1]) < 4096 && Number(match[2]) < 4096);
  }
});

test('traffic map: missing settings, HTTP errors, invalid tiles and attribution fail explicitly', async (t) => {
  const options = { ...defaultsOf(trafficmap.options!), apiKey: 'test-key' };
  const ctx = { ...createBaseContext({ now: 123, location: { latitude: 37.9922, longitude: -1.1307 } }), options, canvas: { createCanvas, loadImage }, signal: new AbortController().signal, timeoutMs: 120_000, sources: {} };
  await assert.rejects(trafficmap.fetch!({ ...ctx, options: { ...options, apiKey: '' } }), /API key/);
  await assert.rejects(trafficmap.fetch!({ ...ctx, location: undefined }), /no coordinates/);
  await assert.rejects(trafficmap.fetch!({ ...ctx, location: { latitude: 91, longitude: 0 } }), /Invalid traffic map coordinates/);

  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }));
  await assert.rejects(trafficmap.fetch!(ctx), /TomTom HTTP 403/);
  fetchMock.mock.mockImplementation(async (input) => String(input).includes('/copyrights/') ? Response.json({ copyrightsCaption: '©TomTom' }) : new Response('not a PNG'));
  await assert.rejects(trafficmap.fetch!(ctx), /invalid PNG/);
  const png = createCanvas(256, 256).toBuffer('image/png');
  fetchMock.mock.mockImplementation(async (input) => String(input).includes('/copyrights/') ? Response.json({}) : new Response(new Uint8Array(png)));
  await assert.rejects(trafficmap.fetch!(ctx), /no map attribution/);
});

test('earthquakes: shared list rows (4 by default) and an empty switch, hidden by default', () => {
  const d = defaultsOf(earthquakes.options!);
  assert.equal(d.rows, 4);
  assert.equal(earthquakes.hideWhenEmpty, true);
  const state = (data: unknown) => ({ options: d, data: data as never, sources: {}, now: 0, working: true, workday: DEFAULT_WORKDAY });
  assert.equal(earthquakes.visible!(state(undefined)), false, 'nothing read yet');
  assert.equal(earthquakes.empty!(state({ quakes: [], radiusKm: 150 })), true);
  assert.equal(earthquakes.visible!(state({ quakes: [], radiusKm: 150 })), true, 'with a reading, hiding it is the switch\'s call');
});

test('place: the cards share latitude and longitude, 0,0 = Settings; booleans named show…', () => {
  for (const w of [airquality, earthquakes, rainmap, trafficmap]) {
    const o = validate(w.options!, {}).value as Record<string, unknown>;
    assert.equal(o.latitude, 0, w.id);
    assert.equal(o.longitude, 0, w.id);
    assert.equal('placeName' in o, false, `${w.id} shows no place name`);
  }
  assert.equal(defaultsOf(airquality.options!).showPollen, true);
  assert.equal(defaultsOf(nowplaying.options!).showCover, true);
});

test('plugin: every widget has an icon, a category, sizes and demo data', () => {
  assert.equal(plugin.id, 'mirror');
  const ids = (plugin.widgets ?? []).map((w) => w.id);
  assert.deepEqual(ids, ['countdown', 'compliments', 'tasks', 'nowplaying', 'onthisday', 'airquality', 'earthquakes', 'rainmap', 'trafficmap']);
  for (const w of plugin.widgets ?? []) {
    assert.ok(w.icon && w.category && w.size?.preferred && w.demo, w.id);
    assert.doesNotThrow(() => w.demo!({ options: w.options!.default, now: Date.now(), locale: "en" }), w.id);
  }
});
