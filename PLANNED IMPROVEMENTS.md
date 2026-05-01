# Tiny Fight Club — Improvement Ideas

## Medium Impact

5. **Particle object pool** — `new Particle()` is called hundreds of times per second; GC pressure will cause stutters over long sessions. Pre-allocate a fixed array and recycle dead particles.

6. **Bracket round connectors** — The bracket has no lines connecting matches to their successors. Drawing connector lines would make the bracket much easier to read.

7. **Ability cooldown arc** — A small arc drawn around each ball showing cooldown progress would give viewers context for passive behavior (e.g. Ninja waiting to teleport).

8. **Poison/status visual tint** — A persistent green tint or particle trail on a ball while `this.poisoned > 0` would make status effects readable beyond the fading floating text.

## Polish

9. **Berserk rage visual** — Zerk looks identical at 100% and 5% HP. A pulsing red glow or growing spike effect scaled to `(1 - hpRatio)` would make the mechanic feel dangerous.

10. **Winner celebration** — The current win animation just glides the ball to center. A "WINNER!" floating text, confetti particles in the winner's color, and a zoom effect would make it feel like a real event.

11. ~~**`performance.now()` instead of `Date.now()`**~~ ✅ — Already applied during project restructure.
