import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { BehaviorMode } from '../types';

export class PoisonAbility extends Ability {
    readonly name = 'Poison';
    readonly cooldownDuration = 9999;
    readonly isPassive = true;

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        const abilityReady = ball.abilityCooldown <= 0.5;
        const hpRatio = ball.hp / ball.maxHp;
        if (enemy.poisoned > 0) return dist < 280 ? 'RETREATING' : 'FLANKING';
        if (abilityReady) return 'AGGRESSIVE';
        return hpRatio < 0.35 ? 'RETREATING' : 'FLANKING';
    }
}
