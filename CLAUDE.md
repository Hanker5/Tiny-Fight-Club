# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tiny Fight Club is a browser-based 2D tournament simulator where 29 AI-controlled ball fighters compete in a single-elimination bracket. Players watch matches unfold — there is no player input during fights. The game is written in TypeScript + Canvas, built with Vite, with a small Vercel serverless API for persistent leaderboard/history tracking.

## Running Locally

```bash
npm install
npm run dev      # Vite dev server — open http://localhost:5173
npm run build    # production bundle → dist/
npm run typecheck  # tsc --noEmit
```

The `/api/*` endpoints require Vercel KV environment variables (`KV_REST_API_URL`, `KV_REST_API_TOKEN`). The game runs fine without them — API calls are fire-and-forget and failures are silently swallowed.

To test API endpoints locally:
```bash
npx vercel dev   # serves both static files and serverless functions
```

## Architecture

The codebase uses a hybrid ECS-adjacent + event-driven pattern. The main loop in `game.ts` drives simulation, then fires events that `ui.ts` and `fx.ts` react to independently.

### Data Flow

```
game.ts (requestAnimationFrame loop)
  ├── entities.ts  — Ball.update() runs AI decision tree + physics per frame
  ├── systems.ts   — resolveCollision() handles impact, damage, and special interactions
  ├── renderer.ts  — Stateless draw functions, called after simulation each frame
  │
  └── On match events, emits via events.ts:
        ├── fx.ts subscribes → spawns particles / floating text
        ├── ui.ts subscribes → updates bracket DOM, overlays, leaderboard
        └── game.ts itself subscribes → POSTs to /api/record-match (fire-and-forget)
```

### Key Files

| File | Responsibility |
|------|---------------|
| `js/game.ts` | Main game loop, tournament state machine, canvas/HiDPI setup |
| `js/state.ts` | Central singleton: bracket structure, active entities, game phase |
| `js/entities.ts` | `Ball` class — physics, HP, cooldowns, AI behavior; all other entity classes (Projectile, Hazard, TrailSegment, BoomerangBlade, OrbitalShield, PortalPair, HexZone, HexProjectile) |
| `js/abilities/` | One file per ability — see Ability System below |
| `js/systems.ts` | `resolveCollision()` — elastic collision math, weapon hit detection, damage application |
| `js/renderer.ts` | Pure canvas draw functions (no state mutation) |
| `js/ui.ts` | DOM: bracket visualization, roster, leaderboard, overlay modal |
| `js/fx.ts` | Particle system, floating damage text — event-driven spawning |
| `js/events.ts` | Tiny custom `EventEmitter` singleton (`emitter`) |
| `js/sound.ts` | `SoundManager` — loads `.wav` files from `/sounds/`, subscribes to game events, plays ability/hit/death audio |
| `js/data.ts` | 29 fighter stat/ability definitions (`FighterDef[]`) |
| `js/types.ts` | Shared TypeScript types: `FighterDef`, `BehaviorMode`, `ArenaSize`, `GamePhase` |
| `js/sim.ts` | `SimEngine` — runs batch simulations between all fighter pairs |
| `js/utils.ts` | Utility functions (e.g., `normalizeAngle`) |
| `api/*.js` | Vercel serverless: record-match (POST), leaderboard (GET), history (GET) |

### Game State Machine

`state.gameState` cycles through: `BRACKET → FIGHTING → ANIMATING_WIN → BRACKET → ...`

The tournament is 4 rounds (8→4→2→1 matches). `state.ts` holds the full bracket array; `game.ts` tracks current round/match pointers.

### Ability System

Each fighter's unique behavior lives in its own file under `js/abilities/`. All abilities extend the `Ability` abstract base class (`js/abilities/Ability.ts`):

```
js/abilities/
  Ability.ts          — abstract base class
  AbilityRegistry.ts  — createAbility(name) factory
  DashAbility.ts
  ChargeAbility.ts
  ... (one file per ability)
```

**`Ability` API:**

| Method | When called | Purpose |
|--------|-------------|---------|
| `tryTrigger(ball, enemy, arena, dt)` | When `ball.abilityCooldown <= 0` | Fire the ability; return cooldown seconds or `null` if conditions not met |
| `getBehaviorHint(ball, enemy)` | Every ~0.5–1.2s | Return a `BehaviorMode` override, or `null` to use default logic |
| `getTargetAngle(ball, enemy, dist, defaultAngle)` | Every frame | Override the steering target angle (used by Laser for lead aim) |
| `tick(ball, enemy, arena, dt)` | Every frame | Passive per-frame effects (Trail segment spawning, etc.) |
| `onHitDealt(attacker, defender, amount)` | On weapon hit | Source-side hit effects (Vampire healing) |
| `onHitReceived(defender, attacker, amount)` | On taking damage | Receiver-side hit effects (Reflect, SpeedRush stacks) |

**Adding a new fighter:**
1. Create `js/abilities/MyAbility.ts` extending `Ability`
2. Register it in `js/abilities/AbilityRegistry.ts` (one line in the Map)
3. Add a `FighterDef` entry to `js/data.ts`

No changes to `Ball` or any other file are needed.

### Ball class

`Ball` in `entities.ts` holds physics, status timers, and delegates all ability logic to its `ability: Ability` instance. Key properties:

- `ball.abilityName: string` — the string name (e.g. `'Dash'`)
- `ball.ability: Ability` — the live ability instance
- `ball.stolenAbilities: Ability[]` — Dirty Dave's absorbed abilities (full instances with independent `.cooldown`)
- `ball.abilityCooldown: number` — primary ability cooldown (ticked by Ball, set by `tryTrigger` return value)

### Collision & Damage

`resolveCollision()` in `systems.ts` checks if the impact angle is within the attacking ball's weapon arc before dealing weapon damage (otherwise it's a body collision). Berserk scales damage by HP-loss percentage. Vampire, Reflect, and SpeedRush effects are handled via `onHitDealt`/`onHitReceived` hooks on their respective ability classes.

### Canvas Scaling

`game.ts` sets up HiDPI scaling using `devicePixelRatio` and CSS transform scaling to fit the arena in the viewport. All game coordinates are in logical pixels; the canvas physical size is multiplied by DPR.

### Sound System

`sound.ts` exports a `SoundManager` singleton that loads `.wav` files from `/sounds/` via the Web Audio API and plays them in response to game events:

| Event | Sound(s) |
|-------|----------|
| `ability:used` | Per-ability sound (Absorb, Boomerang, Dash, Grapple, Hex, Laser, Minion, Phase, Portal, Pulse, Shield, Shriek ×4 variants, Teleport, Tempo) |
| `ball:hit` | `BallHurt1` or `BallHurt2` (random; throttled to once per 150 ms; skips minions/decoys/clones) |
| `ball:die` | `BallDie` (skips minions/decoys/clones) |
| `ball:poisoned` | `Poison` |
| `hex:zone:land` | `HexZone` |

The Minion ability sound is additionally throttled to once per 2 s to avoid rapid-fire repetition. The context is lazily resumed on first play to satisfy browser autoplay policy.

## TypeScript Notes

- `strict: false` — types are loose; tighten incrementally
- `fx.ts`, `sim.ts`, `ui.ts` have `// @ts-nocheck` — pre-existing JS class patterns not yet typed
- `skipLibCheck: true` — suppresses Vite/Rollup declaration file errors

## Planned Feature Areas

See [PLANNED IMPROVEMENTS.md](PLANNED IMPROVEMENTS.md) for the full roadmap. High-priority items not yet implemented:
- Particle object pool (current approach allocates `new Particle()` each frame — GC pressure at high particle counts)

### Completed

- ~~HiDPI canvas scaling~~ ✅ — Implemented via `devicePixelRatio` in `resizeCanvas()`
- ~~`performance.now()` instead of `Date.now()`~~ ✅ — Applied during project restructure
- ~~Match timer / Sudden Death~~ ✅ — Arena shrinks after 60s
- ~~Speed multiplier toggle~~ ✅ — 1×/2×/4× button during matches
- ~~Arena obstacles~~ ✅ — 4 static pillars placed symmetrically
- ~~TypeScript migration~~ ✅ — Vite + tsc, `strict: false`
- ~~Ability system refactor~~ ✅ — Each ability is its own class in `js/abilities/`
- ~~Sound effects~~ ✅ — `SoundManager` in `sound.ts`; Web Audio API, per-ability + hit/death sounds
