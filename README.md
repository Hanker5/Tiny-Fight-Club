# Tiny Fight Club

A browser-based 2D tournament simulator where 16 AI-controlled ball fighters compete in a single-elimination bracket. Sit back and watch — there's no player input during fights.

**[Play it live →](https://tiny-fight-club.vercel.app)**

## Fighters

28 unique fighters, each with a distinct ability:

| Fighter | Ability | Playstyle |
|---------|---------|-----------|
| Dash | Dash | High speed, dashes forward to strike |
| Titan | Heavy | Massive, high HP, turns slowly |
| Dracula | Vampire | Heals 28% of damage dealt by its weapon |
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
| Lil Lethal | Vampire | Heals 28% of damage dealt by its weapon |
| Stick Man | Clone | Spawns a clone that flanks from the opposite side |
| Legion | Summon | Periodically summons small minions |
| CrazedAngelus | Immunity | Periodically becomes completely immune to all damage |
| Dirty Dave | Absorb | Absorbs the opponent's ability |
| Tron | Trail | Leaves a damaging neon trail that walls off the arena |
| Ball Slayer | Boomerang | Hurls a boomerang blade that damages on throw and return |
| The Gravy Train | SpeedRush | Gains speed every time it gets hit |
| Jimbo | Portal | Creates portals to teleport behind the enemy |
| TinyDancer | Dash | High speed, dashes forward to strike |
| Black Panther | BlackPanther | High speed, high damage. Master flanker |
| KayeeK | Phase | Periodically becomes intangible to attacks |

## Running Locally

No build step required. Serve `index.html` via a local HTTP server — direct `file://` loading will fail due to ES module CORS restrictions.

```bash
# Option 1: Node http-server
npx http-server .

# Option 2: Python
python -m http.server

# Option 3: VS Code Live Server extension
```

### With API (leaderboard/history)

The `/api/*` endpoints use Vercel KV. To test them locally:

```bash
npm install
npx vercel dev
```

You'll need `KV_REST_API_URL` and `KV_REST_API_TOKEN` set in your environment. The game runs fine without them — API calls are fire-and-forget.

## Architecture

Vanilla JS + Canvas, no framework. Hybrid ECS-adjacent + event-driven pattern.

```
game.js (requestAnimationFrame loop)
  ├── entities.js  — Ball.update(): AI decision tree + physics per frame
  ├── systems.js   — resolveCollision(): impact, damage, special interactions
  ├── renderer.js  — Stateless draw functions
  │
  └── On match events, emits via events.js:
        ├── fx.js      → particles, floating damage text
        ├── ui.js      → bracket DOM, overlays, leaderboard
        └── game.js    → POST /api/record-match (fire-and-forget)
```

### Key Files

| File | Responsibility |
|------|----------------|
| `js/game.js` | Main loop, tournament state machine, canvas/HiDPI setup |
| `js/state.js` | Central singleton: bracket, active entities, game phase |
| `js/entities.js` | `Ball` class — physics, HP, cooldowns, all AI + 16 ability implementations |
| `js/systems.js` | `resolveCollision()` — elastic collision math, weapon hit detection, damage |
| `js/renderer.js` | Pure canvas draw functions (no state mutation) |
| `js/ui.js` | DOM: bracket visualization, roster, leaderboard, overlay modal |
| `js/fx.js` | Particle system, floating damage text |
| `js/events.js` | Tiny `EventEmitter` singleton (`gameEvents`) |
| `js/data.js` | 16 fighter stat/ability definitions |
| `js/sim.js` | `SimEngine` — batch simulations between all fighter pairs |
| `js/utils.js` | Utility functions (e.g., `normalizeAngle`) |
| `api/*.js` | Vercel serverless: record-match, leaderboard, history |

### Game State Machine

`state.gamePhase` cycles: `BRACKET → FIGHTING → ANIMATING_WIN → BRACKET → ...`

4 rounds (8 → 4 → 2 → 1 matches) per tournament.

## Batch Simulation

The project includes a `SimEngine` for running batch simulations:

```javascript
// Run N matches between every pair of fighters
const sim = new SimEngine(baseBalls, 10);
sim.start(
    (progress) => console.log(`${progress.done}/${progress.total}`),
    (results) => console.log(results)
);
```

## Deployment

Deployed on Vercel. Push to `main` triggers a deploy. The static files are served as-is; `api/` functions run as Vercel serverless functions.
