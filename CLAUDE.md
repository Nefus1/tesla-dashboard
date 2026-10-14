# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

Zero dependencies, no build step. Requires Node 22+ (global `WebSocket`).

```
npm run demo     # simulated car, no .env needed (also: node server/index.js --mock --port=4174)
npm start        # uses .env (Home Assistant mode when HA_URL + HA_TOKEN are set)
npm test         # node --test "test/*.test.js"
npm run check    # node --check over all JS
```

The user's `.env` points at a real car. When verifying changes, run in mock mode and never send commands to the real vehicle without asking.

## Architecture

```
server/        Node backend (ESM, "type": "module")
public/        the ONLY directory served statically
test/          node:test suites
explorations/  standalone JSX design explorations — not served, not connected
data/          runtime settings.json + activity.json (gitignored)
```

### Backend (`server/`)

- `index.js` — entry: loads `.env`, validates config, starts the app, graceful shutdown.
- `app.js` — `createApp(config, options)`: router, auth (optional `DASHBOARD_ACCESS_TOKEN`), CSP/security headers, JSON+same-origin checks on POST, wiring between data source → store → SSE. Tests boot it on port 0.
- `config.js` — `buildConfig(env)` (pure), `ENTITY_KEYS` (dashboard key → `HA_ENTITY_<SUFFIX>`), `validateConfig`.
- `ha-client.js` — REST (`request`, `callService`, `history`) + WebSocket `state_changed` subscription with backoff; REST polling while the socket is down. Emits `states`, `entity`, `status`.
- `normalize.js` — pure HA entities → vehicle object. **Unknown/missing → `null`; never fall back to mock values.** Button/script entities are momentary (`false`).
- `commands.js` — `COMMANDS` registry, `validateValue`, `resolveServiceCall` (domain-inferred services + `HA_SERVICE_*` overrides), `capabilities`.
- `store.js` — `VehicleStore`: current vehicle, `diffActivity` (state transitions → timeline entries), Trip A baseline, persistence. Emits `state` / `activity`.
- `mock.js` — `MockVehicle` simulator used when HA isn't configured or `MOCK=1`. Same interfaces as HA mode.
- `history.js` — pure aggregation of `{t, v}` series (charging/usage per day, usage per hour, distance per day, totals).
- `sse.js`, `static.js` — SSE hub; static serving confined to `public/` (rejects traversal and dotfiles).

To add a vehicle field: add the key to `ENTITY_KEYS`, read it in `normalizeVehicle`, add it to `MockVehicle.state`, and document it in `.env.example`/README. To add a command: add it to `COMMANDS` (+ service resolution if not a bool), handle it in `MockVehicle.apply`, and label it in `public/js/actions.js`.

### Frontend (`public/`)

Native ES modules, no framework. `index.html` holds the shell (topbar, status strip, `#view`, toast, confirm `<dialog>`, car SVG fallback `<template>`).

- `js/main.js` — boot, hash router (`#/home` … `#/trip`), shell rendering, alerts tray, keyboard shortcuts, live connection.
- `js/store.js` — `createStore` (explicit `set()`, subscribers batched per frame with a timer fallback for hidden tabs). Optimistic command values live in `state.pending` and are overlaid by `effectiveVehicle()` until the server confirms or they expire (`reconcilePending`).
- `js/actions.js` — user intents → `api.command` with pending/rollback/toasts; confirmation for unlock and frunk.
- `js/api.js` — fetch wrapper (`ApiError`) and `connectLive` (EventSource + reconnect, polling fallback).
- `js/views/*.js` — each view exports `{ id, mount(root, ctx), update(root, ctx) }`. `mount` runs once per navigation into a fresh root element (so listeners never leak); `update` runs on every state change and only patches `[data-bind]` text, classes and attributes — never rebuild inputs in `update`.
- `js/views/shared.js` — control tiles (`[data-toggle=<command>]`, handled by one delegated listener in `main.js`), charge-limit slider, bar charts, activity list, vehicle image fallback chain.
- `js/format.js`, `js/derive.js` — pure helpers, imported directly by `test/frontend.test.js`.
- `js/icons.js` — inline SVG strings; `renderIcons()` stamps `[data-icon]`, `setIcon()` swaps one.
- `js/image.js` — custom vehicle image, downscaled to WebP and stored in `localStorage` (`teslaDashboard.vehicleImage`).

`ctx` passed to views: `{ state, store, actions, config, snap, v (effective vehicle), caps, now, connectionLabel }`.

## Conventions

- Escape every dynamic string that goes into `innerHTML` (`escapeHtml`) or use `textContent`/`bindText`.
- Render `null` as `DASH` ("—"); show "Not set up" for controls whose capability is false.
- All colors use CSS custom properties from `:root` in `styles.css` (dark only). Never hardcode colors in JS or new CSS rules. `chargeColor()` in `derive.js` picks the battery accent.
- Breakpoints: 1180 px (tablet), 820 px (mobile), 520 px (small phone).
- Range falls back to `battery × 3.21` mi only when no range entity is mapped (labelled "Estimated").
- The home arc and charging ring use `pathLength="100"` / circumference math so dash values map to percentages.
