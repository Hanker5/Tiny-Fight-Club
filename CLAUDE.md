# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tiny Fight Club is a browser-based 2D tournament simulator where 16 AI-controlled ball fighters compete in a single-elimination bracket. Players watch matches unfold — there is no player input during fights. The game runs entirely client-side on vanilla JS + Canvas, with a small Vercel serverless API for persistent leaderboard/history tracking.

## Running Locally

No build step. Open `index.html` via a local HTTP server (e.g., VS Code Live Server, `npx http-server`, or Python's `http.server`). Direct `file://` loading will cause CORS issues with ES module imports.

The `/api/*` endpoints require Vercel KV environment variables (`KV_REST_API_URL`, `KV_REST_API_TOKEN`). The game runs fine without them — API calls are fire-and-forget and failures are silently swallowed.

To test API endpoints locally:
```bash
npm install
npx vercel dev   # serves both static files and serverless functions
```

## Architecture

The codebase uses a hybrid ECS-adjacent + event-driven pattern. The main loop in `game.js` drives simulation, then fires events that `ui.js` and `fx.js` react to independently.

### Data Flow

```
game.js (requestAnimationFrame loop)
  ├── entities.js  — Ball.update() runs AI decision tree + physics per frame
  ├── systems.js   — resolveCollision() handles impact, damage, and special interactions
  ├── renderer.js  — Stateless draw functions, called after simulation each frame
  │
  └── On match events, emits via events.js:
        ├── fx.js subscribes → spawns particles / floating text
        ├── ui.js subscribes → updates bracket DOM, overlays, leaderboard
        └── game.js itself subscribes → POSTs to /api/record-match (fire-and-forget)
```

### Key Files

| File | Responsibility |
|------|---------------|
| `js/game.js` | Main game loop, tournament state machine, canvas/HiDPI setup |
| `js/state.js` | Central singleton: bracket structure, active entities, game phase enum |
| `js/entities.js` | `Ball` class — physics, HP, cooldowns, all AI behavior + 16 ability implementations |
| `js/systems.js` | `resolveCollision()` — elastic collision math, weapon hit detection, damage application |
| `js/renderer.js` | Pure canvas draw functions (no state mutation) |
| `js/ui.js` | DOM: bracket visualization, roster, leaderboard, overlay modal |
| `js/fx.js` | Particle system, floating damage text — event-driven spawning |
| `js/events.js` | Tiny custom `EventEmitter` singleton (`gameEvents`) |
| `js/data.js` | 16 fighter stat/ability definitions |
| `js/sim.js` | `SimEngine` — runs batch simulations between all fighter pairs |
| `js/utils.js` | Utility functions (e.g., `normalizeAngle`) |
| `api/*.js` | Vercel serverless: record-match (POST), leaderboard (GET), history (GET) |

### Game State Machine

`state.gamePhase` cycles through: `BRACKET → FIGHTING → ANIMATING_WIN → BRACKET → ...`

The tournament is 4 rounds (8→4→2→1 matches). `state.js` holds the full bracket array; `game.js` tracks current round/match pointers.

### Ball AI

Each `Ball` has a behavior mode (`AGGRESSIVE`, `FLANKING`, `RETREATING`) recalculated each frame based on distance to enemy, relative HP, and cooldown status. Ability logic lives directly in `Ball.update()` in `entities.js` — each of the 16 fighters has character-specific branches.

### Collision & Damage

`resolveCollision()` in `systems.js` checks if the impact angle is within the attacking ball's weapon arc before dealing weapon damage (otherwise it's a body collision). Berserk scales damage by HP-loss percentage; Vampire heals on hit; Reflect redirects incoming damage back.

### Canvas Scaling

`game.js` sets up HiDPI scaling using `devicePixelRatio` and CSS transform scaling to fit the arena in the viewport. All game coordinates are in logical pixels; the canvas physical size is multiplied by DPR.

## Planned Feature Areas

See [PLANNED IMPROVEMENTS.md](PLANNED IMPROVEMENTS.md) for the full roadmap. High-priority items not yet implemented:
- Match timer / Sudden Death (arena shrink or damage ramp after 60s)
- Speed multiplier toggle (1×/2×/4×)
- Arena obstacles (static pillars)
- Particle object pool (current approach allocates `new Particle()` each frame — GC pressure at high particle counts)

### Completed

- ~~HiDPI canvas scaling~~ ✅ — Implemented via `devicePixelRatio` in `resizeCanvas()`
- ~~`performance.now()` instead of `Date.now()`~~ ✅ — Applied during project restructure
