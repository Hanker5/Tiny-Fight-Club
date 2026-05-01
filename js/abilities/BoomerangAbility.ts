import { Ability } from './Ability';
import type { Ball } from '../entities';
import { BoomerangBlade } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';

export class BoomerangAbility extends Ability {
    readonly name = 'Boomerang';
    readonly cooldownDuration = 9999; // cooldown is set by _catch() on blade return

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        const abilityReady = ball.abilityCooldown <= 0.5;
        if (ball.boomerangOut) return 'FLANKING';
        if (abilityReady) return dist < 400 ? 'AGGRESSIVE' : 'FLANKING';
        return 'RETREATING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        if (ball.blade) return null;
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const angle = Math.atan2(dy, dx);
        const blade = new BoomerangBlade(
            ball.x + Math.cos(angle) * (ball.r + 12),
            ball.y + Math.sin(angle) * (ball.r + 12),
            angle, ball, enemy
        );
        // Store ability reference so _catch() can reset the right cooldown slot
        blade.abilityRef = this;
        ball.blade = blade;
        state.boomerangs.push(blade);
        ball.momentumArmor = 0.3;
        ball.boomerangOut = true;
        // Cooldown is managed by blade._catch() — return 9999 to block re-triggering
        return this.cooldownDuration;
    }
}
