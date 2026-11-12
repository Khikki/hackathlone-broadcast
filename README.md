# HackAthlone Broadcast Studio

A local production control panel and transparent OBS graphics package for HackAthlone 2026. It runs on Node.js 22+ with no third-party runtime dependencies and no build step.

## Start

Double-click `start.cmd`, or run this in the project folder:

```sh
npm start
```

Open the control panel at http://127.0.0.1:3131.

In OBS, add a **Browser Source** using `http://127.0.0.1:3131/overlay` at **2560 × 1440 (2K)**. Place it above the camera or programme source. Disable **Shutdown source when not visible** so timers and automatic hiding continue to work. The server must remain running during the broadcast; the control-panel window itself may be closed.

Set the `PORT` environment variable to use another port. Generated OBS URLs automatically follow the current origin. The server listens only on the local computer.

## Operator guide

- **Guest lower third:** enter a name, role and organisation, then press **Take live**. Draft changes stay local until that button is pressed. Auto-hide can be manual or 8–30 seconds.
- **Scenes:** switch between transparent live graphics, starting soon, intermission and closing slates. Full-screen slates hide the corner mark, lower third, agenda and compact timer.
- **Countdown:** enter a duration in minutes and press **Start**. Pause/Resume preserves the remaining time; Reset restores the original duration.
- **Partner strip:** upload PNG, JPEG or WebP logos up to 1 MB and reorder them with the arrow control. The sequence is duplicated for a seamless broadcast loop.
- **Agenda:** select the current item and take the agenda live. The overlay shows that item plus the next two.
- **Announcement ticker:** edit its label and message, update it, then use the separate layer toggle.
- **Esc / Hide all:** clears every layer and returns to the transparent live scene. The timer keeps counting until paused.
- **Settings:** edit event copy, choose an official brand accent, set safe margins and marquee speed, and enable preview-only safe-area guides.
- **Backups:** export or import JSON. Importing hides all graphics and pauses the timer before restoring data.

## Individual OBS sources

The combined `/overlay` source contains every layer. Use these URLs only when individual placement is required:

| URL | Layer |
| --- | --- |
| `/overlay?layer=lower` | Guest lower third |
| `/overlay?layer=partners` | Partner strip |
| `/overlay?layer=bug` | Event corner mark |
| `/overlay?layer=ticker` | Announcement ticker |
| `/overlay?layer=timer` | Countdown |
| `/overlay?layer=agenda` | Agenda |
| `/overlay?layer=slate` | Full-screen slates |

All clients share one server-side state. Do not use the combined source and the same individual layer together, or the graphic will appear twice.

## Brand system

The interface follows the [official HackAthlone brand kit](https://hackathlone.com/brand): white and light-blue surfaces, Electric Blue `#0042a6`, Rocket Red `#db240b`, Flame Orange `#ff883e`, Forest Green `#0b5d3b`, Neon Lime `#eafe07` and black `#111`. It uses official logo assets without recolouring, cropping, rotation or effects. Full-colour logos are used on white or light-blue surfaces; reversed logos are used on Electric Blue. Overpass and Inter are bundled for offline production use.

The design workflow also uses the narrowest relevant guidance from [MengTo/Skills](https://github.com/MengTo/Skills): `design-first-ui-prompting`, `beautiful-shadows`, `animation-systems` and `marquee-loop`. Motion respects `prefers-reduced-motion`.

Starter guest roles come from the [HackAthlone team page](https://hackathlone.com/team). Starter schedule entries come from the [HackAthlone 2026 event page](https://hackathlone.com/) and must be verified before broadcast. All times use Europe/Dublin.

## Structure and verification

- `dist/` — control panel, overlays and bundled brand assets
- `server.mjs` — HTTP server, Server-Sent Events and persistence
- `defaults.mjs` — starter event data
- `data/state.json` — automatically persisted local state; do not commit personal data

Run the integration suite with:

```sh
npm test
```

The tests cover static assets, state updates, SSE delivery, automatic hiding and restart persistence. Always perform a final visual check in the intended OBS scene before going live.
