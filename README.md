# Tesla Dashboard for Home Assistant

A fast, self-hosted Tesla dashboard that reads your car through Home Assistant
and pushes changes to the browser live. Zero dependencies: a small Node server
plus a vanilla-JS frontend, no build step.

- **Live**: subscribes to Home Assistant's WebSocket and streams changes to the
  browser over Server-Sent Events (falls back to REST polling).
- **Honest data**: anything Home Assistant doesn't report shows as "—" or
  "Not set up" — never a made-up number. Demo data only appears in demo mode.
- **Real controls**: lock, frunk, charging, charge limit, climate and target
  temperature, defrost, seat heat, Sentry, hazards and scheduled departure —
  with confirmation for unlock/frunk, pending states and rollback on failure.
- **History**: 7-day charging, 24-hour energy use, efficiency and daily distance,
  derived from Home Assistant's recorder history.
- **Activity timeline** built from real state changes, persisted on the server.
- Works on desktop, wall tablets and phones; installable as a home-screen app;
  embeddable in an HA iframe panel.

## Quick start

Requires **Node.js 22+**.

```bash
npm run demo        # demo mode with a simulated car — no setup needed
```

Open <http://127.0.0.1:4173>.

To use your car:

```bash
cp .env.example .env    # then fill in HA_URL, HA_TOKEN and your entity ids
npm start
```

## Configuration

All settings live in `.env` (see [.env.example](.env.example) for every option).

1. **Token** — in Home Assistant open your profile → *Security* → *Long-lived
   access tokens*, create one and set `HA_TOKEN`. Set `HA_URL` to your HA
   address, e.g. `http://homeassistant.local:8123`.
2. **Entities** — map `HA_ENTITY_*` to your entity ids. Start the server and
   open <http://127.0.0.1:4173/api/entities?q=tesla,model%20y> to list likely
   candidates (the token never leaves the server). Every entity is optional.
3. **Vehicle** — `BATTERY_CAPACITY_KWH` and `ELECTRICITY_RATE` drive energy and
   cost estimates.

| Dashboard feature | Variable | Typical entity |
| --- | --- | --- |
| Battery % | `HA_ENTITY_BATTERY` | `sensor.*_battery_level` |
| Range | `HA_ENTITY_RANGE` | `sensor.*_battery_range` |
| Charging on/off | `HA_ENTITY_CHARGING` | `switch.*_charge` |
| Cable connected | `HA_ENTITY_CHARGER_CONNECTED` | `binary_sensor.*_charge_cable` |
| Charge power / rate | `HA_ENTITY_CHARGE_POWER`, `HA_ENTITY_CHARGE_RATE` | `sensor.*` |
| Charge limit | `HA_ENTITY_CHARGE_LIMIT` | `number.*_charge_limit` |
| Energy added | `HA_ENTITY_ENERGY_ADDED` | `sensor.*_charge_energy_added` |
| Lock | `HA_ENTITY_LOCK` | `lock.*` |
| Climate + target temp | `HA_ENTITY_CLIMATE` | `climate.*` |
| Inside / outside temp | `HA_ENTITY_CABIN_TEMP`, `HA_ENTITY_OUTSIDE_TEMP` | `sensor.*` |
| Seat heat | `HA_ENTITY_SEAT_HEAT_DRIVER`, `..._PASSENGER` | `select.*_seat_heater_*` |
| Defrost | `HA_ENTITY_DEFROST`, `HA_ENTITY_DEFROST_REAR` | `switch.*` |
| Frunk | `HA_ENTITY_FRUNK` | `cover.*_frunk` or `button.*` |
| Sentry | `HA_ENTITY_SENTRY` | `switch.*_sentry_mode` |
| Hazards / flash | `HA_ENTITY_HAZARD` | `switch.*` or `button.*_flash_lights` |
| Odometer | `HA_ENTITY_ODOMETER` | `sensor.*_odometer` |
| Software | `HA_ENTITY_SOFTWARE_UPDATE` | `update.*` |
| Location | `HA_ENTITY_LOCATION` | `device_tracker.*` |
| Departure | `HA_ENTITY_DEPARTURE_ENABLED`, `HA_ENTITY_DEPARTURE_TIME` | `switch.*`, `time.*` |

Services are inferred from the entity domain (`lock.lock`, `switch.turn_on`,
`number.set_value`, `select.select_option`, `climate.set_temperature`,
`button.press`, …). If your integration differs, set an `HA_SERVICE_*`
override, e.g. `HA_SERVICE_SENTRY_ON=script.enable_sentry`.

Units (mi/km, °F/°C) are detected from the entities' units of measurement.

## Using it on other devices

By default the server only listens on `127.0.0.1`. To reach it from a tablet
or phone on your network:

```ini
HOST=0.0.0.0
DASHBOARD_ACCESS_TOKEN=<long random string>
```

The server refuses to start on a non-loopback address without a token. Open
`http://<server>:4173/?token=<token>` once per device; it sets an HttpOnly
cookie and removes the token from the address bar.

**Embed in Home Assistant**: add a *Webpage* dashboard or `panel_iframe`
pointing at the dashboard URL. Framing is allowed from your `HA_URL` origin.

## Docker

```bash
docker build -t tesla-dashboard .
docker run -d --name tesla-dashboard --env-file .env \
  -e DASHBOARD_ACCESS_TOKEN=<long random string> \
  -p 4173:4173 -v tesla-dashboard-data:/app/data tesla-dashboard
```

The container listens on `0.0.0.0`, so it needs `DASHBOARD_ACCESS_TOKEN`. If you
publish the port only to the host (`-p 127.0.0.1:4173:4173`) or put it behind
an authenticating reverse proxy, you can set `TRUST_NETWORK=1` instead.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Mode, uptime, Home Assistant connection status |
| `GET` | `/api/config` | Mode, vehicle settings, capabilities (which commands are mapped) |
| `GET` | `/api/state` | Normalized vehicle snapshot |
| `GET` | `/api/events` | SSE stream: `state`, `activity`, `activity-log`, `status` |
| `GET` | `/api/history` | 7-day charging/usage/distance, 24-hour usage, totals |
| `GET` | `/api/activity` | Recent activity (last 50) |
| `GET` | `/api/entities?q=` | Entity discovery helper |
| `POST` | `/api/command` | `{ "command": "locked", "value": false }` |
| `POST` | `/api/refresh` | Re-read state from Home Assistant |
| `POST` | `/api/trip/reset` | Start Trip A from the current odometer |

Commands: `locked`, `charging`, `frunk`, `climate`, `defrost`, `defrostRear`,
`sentry`, `hazard`, `departureEnabled` (booleans); `chargeLimit` (50–100),
`targetTemp` (number), `seatHeatDriver` / `seatHeatPassenger` (0–3),
`departureTime` (`HH:MM`).

`POST` requests must be `application/json` and same-origin.

## Keyboard shortcuts

`H` `G` `C` `M` `N` `T` switch views · `L` lock/unlock · `S` Sentry · `R` refresh ·
arrow keys move between tabs.

## Development

```bash
npm run dev     # restart on file changes (Home Assistant or demo per .env)
npm run demo    # demo mode
npm test        # node:test suites (normalizer, commands, history, server, HA client, frontend)
npm run check   # syntax-check all JS
```

See [CLAUDE.md](CLAUDE.md) for the architecture.

## License

[GPL-3.0](LICENSE). Not affiliated with Tesla, Inc.
