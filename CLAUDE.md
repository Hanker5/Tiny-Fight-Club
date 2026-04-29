# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tiny Fight Club is a browser-based 2D tournament simulator where AI-controlled ball fighters compete in a single-elimination bracket. Players watch matches unfold - there is no player input during fights. The game runs entirely client-side on vanilla JS + Canvas, with a small Vercel serverless API for persistent leaderboard and history tracking.

## Running Locally

No build step. Open `index.html` via a local HTTP server such as VS Code Live Server, `npx http-server`, or Python's `http.server`. Direct `file://` loading will cause CORS issues with ES module imports.

The `/api/*` endpoints require Vercel KV environment variables (`KV_REST_API_URL`, `KV_REST_API_TOKEN`). The game runs fine without them - API calls are fire-and-forget and failures are silently swallowed.

To test API endpoints locally:

```bash
npm install
npx vercel dev
```

## Architecture

The codebase uses a hybrid ECS-adjacent + event-driven pattern. The main loop in `game.js` drives simulation, then fires events that `ui.js` and `fx.js` react to independently.

### Data Flow

```text
game.js (requestAnimationFrame loop)
  |- entities.js  - Ball.update() runs AI decision tree + physics per frame
  |- systems.js   - resolveCollision() handles impact, damage, and special interactions
  |- renderer.js  - Stateless draw functions, called after simulation each frame
  |
  `- On match events, emits via events.js:
       |- fx.js   -> spawns particles / floating text
       |- ui.js   -> updates bracket DOM, active fighters, overlays, leaderboard
       `- game.js -> POSTs to /api/record-match (fire-and-forget)
```

### Key Files

| File | Responsibility |
|------|---------------|
| `js/game.js` | Main game loop, tournament state machine, canvas/HiDPI setup |
| `js/state.js` | Central singleton: bracket structure, round labels, active entities, game phase |
| `js/entities.js` | `Ball` class - physics, HP, cooldowns, all AI behavior and fighter abilities |
| `js/systems.js` | `resolveCollision()` - elastic collision math, weapon hit detection, damage application |
| `js/renderer.js` | Pure canvas draw functions (no state mutation) |
| `js/ui.js` | DOM: bracket visualization, active fighters panel, leaderboard, overlay modal |
| `js/fx.js` | Particle system, floating damage text - event-driven spawning |
| `js/events.js` | Tiny custom `EventEmitter` singleton (`gameEvents`) |
| `js/data.js` | Fighter stat and ability definitions |
| `api/*.js` | Vercel serverless: record-match (POST), leaderboard (GET), history (GET) |

### Game State Machine

`state.gameState` cycles through: `BRACKET -> FIGHTING -> ANIMATING_WIN -> BRACKET -> ...`

The tournament scales to the current roster size and pads to the next power of two with automatic byes. `state.js` holds the full bracket array; `game.js` tracks the current round and match pointers.

### Ball AI

Each `Ball` has a behavior mode (`AGGRESSIVE`, `FLANKING`, `RETREATING`) recalculated each frame based on distance to the enemy, relative HP, and cooldown status. Ability logic lives directly in `Ball.update()` in `entities.js`.

### Collision and Damage

`resolveCollision()` in `systems.js` checks whether the impact angle is within the attacking ball's weapon arc before dealing weapon damage. Berserk and Last Stand scale damage from HP loss; Vampire heals on hit; Reflect redirects incoming damage back; Boomerang grants temporary damage reduction; Brand permanently reduces max HP.

### Canvas Scaling

`game.js` sets up HiDPI scaling using `devicePixelRatio` and CSS transform scaling to fit the arena in the viewport. All game coordinates are in logical pixels; the canvas physical size is multiplied by DPR.

## Planned Feature Areas

See [PLANNED IMPROVEMENTS.md](PLANNED IMPROVEMENTS.md) for the full roadmap. High-priority items not yet implemented:
- Match timer / Sudden Death (arena shrink or damage ramp after 60s)
- Speed multiplier toggle (1x/2x/4x)
- Arena obstacles (static pillars)
- Particle object pool (current approach allocates `new Particle()` each frame, which creates GC pressure at high particle counts)
