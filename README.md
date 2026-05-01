# Tiny Fight Club

A browser-based 2D tournament simulator where 30 AI-controlled ball fighters compete in a single-elimination bracket. Sit back and watch — there's no player input during fights.

**[Play it live →](https://tiny-fight-club.vercel.app)**

## Fighters

30 unique fighters, each with a distinct ability:

| Fighter | Ability | Playstyle |
|---------|---------|-----------|
| Dash | Dash | High speed, dashes forward to strike |
| Titan | Heavy | Massive, high HP, turns slowly |
| Dracula | Vampire | Heals 25% of damage dealt by its weapon |
| Ninja | Teleport | Periodically teleports behind the opponent |
| Zerk | Berserk | Damage and speed increase as HP drops |
| Paladin | Shield | Periodically regenerates a protective shield |
| Venom | Poison | Frontal strikes apply dangerous Damage-Over-Time |
| Mage | Missile | Stays away and fires homing magic missiles |
| Spike | Trap | Leaves volatile traps behind |
| Sniper | Laser | Fires fast, non-homing piercing shots |
| Hook | Grapple | Violently pulls the enemy towards itself |
| Ghost | Phase | Periodically becomes intangible to attacks |
| Pulsar | Pulse | Emits a repelling, damaging energy shockwave |
| Swarm | Minion | Spawns small homing drones to harass |
| Thorn | Reflect | Reflects 30% of taken damage back to attacker |
| Comet | Charge | Builds massive momentum in a straight line |
| Lil Lethal | Vampire | Heals 25% of damage dealt by its weapon |
| Stick Man | Clone | Spawns a clone that flanks from the opposite side |
| Legion | Summon | Periodically summons small minions |
| CrazedAngelus | Immunity | Periodically becomes completely immune to all damage |
| Dirty Dave | Absorb | Absorbs an enemy ability each round (up to 3 stolen) |
| Tron | Trail | Leaves a damaging neon trail that walls off the arena |
| Ball Slayer | Boomerang | Hurls a boomerang blade that damages on throw and return |
| The Gravy Train | SpeedRush | Gains speed every time it gets hit |
| Jimbo | Portal | Creates portals to teleport behind the enemy |
| TinyDancer | Dash | High speed, dashes forward to strike |
| Black Panther | BlackPanther | High speed, high damage. Master flanker |
| KayeeK | Phase | Periodically becomes intangible to attacks |
| Snickerdoodle | Hex | Throws a hex zone — slows, pulls, and scorches enemies inside |
| Bombastic Bubbles | ShieldBurst | Orbiting shields absorb damage, then launch as projectiles |

## Running Locally

```bash
npm install
npm run dev      # Vite dev server → http://localhost:5173
```

### With API (leaderboard/history)

The `/api/*` endpoints use Vercel KV. To test them locally:

```bash
npx vercel dev
```

You'll need `KV_REST_API_URL` and `KV_REST_API_TOKEN` set in your environment. The game runs fine without them — API calls are fire-and-forget.

## Architecture

TypeScript + Canvas, built with Vite. Hybrid ECS-adjacent + event-driven pattern.

```
game.ts (requestAnimationFrame loop)
  ├── entities.ts  — Ball.update(): AI decision tree + physics per frame
  ├── systems.ts   — resolveCollision(): impact, damage, special interactions
  ├── renderer.ts  — Stateless draw functions
  │
  └── On match events, emits via events.ts:
        ├── fx.ts      → particles, floating damage text
        ├── ui.ts      → bracket DOM, overlays, leaderboard
        └── game.ts    → POST /api/record-match (fire-and-forget)
```

### Key Files

| File | Responsibility |
|------|----------------|
| `js/game.ts` | Main loop, tournament state machine, canvas/HiDPI setup |
| `js/state.ts` | Central singleton: bracket, active entities, game phase |
| `js/entities.ts` | `Ball` class + all entity classes (Projectile, Hazard, BoomerangBlade, etc.) |
| `js/abilities/` | One TypeScript file per ability — see below |
| `js/systems.ts` | `resolveCollision()` — elastic collision math, weapon hit detection, damage |
| `js/renderer.ts` | Pure canvas draw functions (no state mutation) |
| `js/ui.ts` | DOM: bracket visualization, roster, leaderboard, overlay modal |
| `js/fx.ts` | Particle system, floating damage text |
| `js/events.ts` | Tiny `EventEmitter` singleton (`emitter`) |
| `js/data.ts` | 30 fighter stat/ability definitions |
| `js/types.ts` | Shared types: `FighterDef`, `BehaviorMode`, `ArenaSize`, `GamePhase` |
| `js/sim.ts` | `SimEngine` — batch simulations between all fighter pairs |
| `js/utils.ts` | Utility functions (e.g., `normalizeAngle`) |
| `api/*.js` | Vercel serverless: record-match, leaderboard, history |

### Ability System

Each fighter's unique logic lives in its own file under `js/abilities/`, extending the `Ability` base class. Adding a new fighter requires:

1. Create `js/abilities/MyAbility.ts`
2. Register it in `js/abilities/AbilityRegistry.ts` (one line)
3. Add a `FighterDef` to `js/data.ts`

No changes to `Ball` or any other file needed.

### Game State Machine

`state.gameState` cycles: `BRACKET → FIGHTING → ANIMATING_WIN → BRACKET → ...`

4 rounds (8 → 4 → 2 → 1 matches) per tournament.

## Batch Simulation

The project includes a `SimEngine` for running batch simulations:

```typescript
// Run N matches between every pair of fighters
const sim = new SimEngine(baseBalls, 10);
sim.start(
    (progress) => console.log(`${progress.done}/${progress.total}`),
    (results) => console.log(results)
);
```

## Deployment

Deployed on Vercel. Push to `main` triggers a deploy. The static files are served as-is; `api/` functions run as Vercel serverless functions.
