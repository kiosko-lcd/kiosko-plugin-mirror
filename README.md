# kiosko-plugin-mirror

MagicMirror²-style cards: countdown, compliments, today and tomorrow, now playing, on this day, air quality, earthquakes, rain radar and traffic.

A plugin for [Kiosko](https://github.com/kiosko-lcd/kiosko), the widget mosaic for small USB LCD panels.

![Countdown](docs/countdown.png)

## Install

In Kiosko, **Plugins → Install from npm** → `kiosko-plugin-mirror`, then restart Kiosko. Or from a terminal:

```sh
npm install --prefix ~/.config/kiosko/plugins kiosko-plugin-mirror
```

(macOS: `~/Library/Application Support/Kiosko/plugins`, Windows: `%APPDATA%\Kiosko\plugins`.)

## Requirements

- Location in Kiosko → Settings for air quality, earthquakes, rain radar and traffic. *Now playing* reads MPRIS (Linux).

## Widgets

### Countdown — `mirror/countdown`

Days left until your important dates, nearest first. Birthdays and anniversaries come back every year.

![Countdown](docs/countdown.png)

| Option | Type | Default | |
|---|---|---|---|
| `events` | list | `[]` | Dates. Past dates hide themselves; yearly ones come back. |
| `rows` | number | `4` | Rows. 0 = as many as fit. A number shows that many, in rows of a readable size (fewer when the tile is too small for them); the rest are counted in "+N more". |
| `warnDays` | number | `7` | Amber from (days before) |
| `alertDays` | number | `1` | Red from (days before). 0: only on the day. |

### Compliments — `mirror/compliments`

A phrase that suits the time of day, like the MagicMirror² classic.

![Compliments](docs/compliments.png)

| Option | Type | Default | |
|---|---|---|---|
| `morning` | list | `[]` | Morning (3–12 h). Leave every list empty to use the built-in phrases, in your language. |
| `afternoon` | list | `[]` | Afternoon (12–17 h). Leave every list empty to use the built-in phrases, in your language. |
| `evening` | list | `[]` | Evening and night. Leave every list empty to use the built-in phrases, in your language. |
| `anytime` | list | `[]` | Any time. Leave every list empty to use the built-in phrases, in your language. |
| `changeMs` | duration (ms) | `1800000` | Change every |
| `maxSize` | number | `56` | Largest letter size |
| `align` | `left` \| `center` \| `right` | `"left"` | Alignment |

### Today and tomorrow — `mirror/tasks`

Your to-dos for today and tomorrow, from a Markdown checklist and, optionally, your GitLab issues.

![Today and tomorrow](docs/tasks.png)

| Option | Type | Default | |
|---|---|---|---|
| `file` | string | `"~/tasks.md"` | Checklist file. Markdown with "- [ ] …" boxes under "## Today" and "## Tomorrow"; "@2026-10-14" dates a box. |
| `includeIssues` | boolean | `false` | Add my GitLab issues with a due date. Due today or tomorrow, and every overdue one. |
| `bin` | string | `"glab"` | glab command. The GitLab CLI, already logged in. |
| `showTomorrow` | boolean | `true` | Tomorrow too. Off: only today, for small tiles. |
| `rows` | number | `0` | Rows. 0 = as many as fit. A number shows that many, in rows of a readable size (fewer when the tile is too small for them); the rest are counted in "+N more". |

### Now playing — `mirror/nowplaying`

The song playing on this computer (any MPRIS player on Linux: Spotify, browser, VLC…), with cover and progress. Hidden while nothing plays.

![Now playing](docs/nowplaying.png)

| Option | Type | Default | |
|---|---|---|---|
| `showPaused` | boolean | `false` | Also while paused |
| `prefer` | string | `""` | Preferred player. Part of its MPRIS name; empty = whichever plays. |
| `showCover` | boolean | `true` | Show the cover |

### On this day — `mirror/onthisday`

Selected anniversaries of today from Wikipedia, one at a time.

![On this day](docs/onthisday.png)

| Option | Type | Default | |
|---|---|---|---|
| `lang` | string | `""` | Wikipedia language. A code such as en, es, de; empty = yours. Not every edition has this feed. |
| `changeMs` | duration (ms) | `600000` | Change every |

### Air quality — `mirror/airquality`

Air quality index (European or US), particles, gases and pollen where you are (Open-Meteo).

![Air quality](docs/airquality.png)

| Option | Type | Default | |
|---|---|---|---|
| `index` | `european` \| `us` | `"european"` | Index |
| `onlyAbove` | number | `0` | Only from index. 0: always. Otherwise it takes its turn only when the index reaches this, on its own scale (European: 40 is moderate, 60 poor; US: 100 is unhealthy for sensitive groups). |
| `showPollen` | boolean | `true` | Show pollen |
| `latitude` | number | `0` | Latitude. Leave latitude and longitude at 0 to use the place in Settings. |
| `longitude` | number | `0` | Longitude |

### Earthquakes nearby — `mirror/earthquakes`

Recent earthquakes around you (EMSC) on a polar map, with magnitude, place and time. Hidden when there are none (you can change that).

![Earthquakes nearby](docs/earthquakes.png)

| Option | Type | Default | |
|---|---|---|---|
| `radiusKm` | number | `150` | Radius |
| `days` | number | `30` | Days back |
| `minMagnitude` | number | `1.5` | Minimum magnitude |
| `rows` | number | `4` | Rows. 0 = as many as fit. A number shows that many, in rows of a readable size (fewer when the tile is too small for them); the rest are counted in "+N more". |
| `latitude` | number | `0` | Latitude. Leave latitude and longitude at 0 to use the place in Settings. |
| `longitude` | number | `0` | Longitude |

### Rain radar — `mirror/rainmap`

Latest rain radar (RainViewer) over a dark OpenStreetMap map, home in the centre. By default only shows while it rains nearby.

![Rain radar](docs/rainmap.png)

| Option | Type | Default | |
|---|---|---|---|
| `onlyWhenRaining` | boolean | `true` | Only while it rains nearby |
| `latitude` | number | `0` | Latitude. Leave latitude and longitude at 0 to use the place in Settings. |
| `longitude` | number | `0` | Longitude |

### Traffic map — `mirror/trafficmap`

Live traffic flow around your location on a dark TomTom map. Green indicates traffic near free-flow speed, amber slower traffic, and red severe congestion; missing colored roads do not necessarily mean clear traffic. Data coverage varies by road.

Create a [TomTom developer account](https://my.tomtom.com/), obtain an API key with access to Map Display and Traffic, and enter it in the widget options. TomTom offers a [free tier](https://docs.tomtom.com/pricing); check current limits and terms. Every refresh requests several map and traffic tiles, so additional widgets or faster refresh intervals increase usage. The default refresh is every 10 minutes.

| Option | Type | Default | |
|---|---|---|---|
| `apiKey` | secret string | `""` | TomTom API key. Required. |
| `zoom` | number | `12` | Map zoom, from 8 to 16. Higher values show a smaller area. |
| `latitude` | number | `0` | Latitude. Leave latitude and longitude at 0 to use the place in Settings. |
| `longitude` | number | `0` | Longitude |

## Development

```sh
npm install
npm test          # node:test
npm run check     # TypeScript
npm run build     # dist/index.js, what Kiosko loads
```

To try it in a running Kiosko without publishing: `kiosko plugins link .` and restart Kiosko.

Working on Kiosko and its plugins together: clone them side by side
(`kiosko/` and `kiosko-plugins/kiosko-plugin-mirror/`) and run `npm install` in
`kiosko/`; its workspaces link every plugin found in `../kiosko-plugins`.

## License

MIT
