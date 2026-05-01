import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { emitter } from '../events';

export class ShieldAbility extends Ability {
    readonly name = 'Shield';
    readonly cooldownDuration = 8.5;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        const hpRatio = ball.hp / ball.maxHp;
        if (ball.shield > 0) return 'AGGRESSIVE';
        if (hpRatio < 0.4 && ball.abilityCooldown > 0.5) return 'RETREATING';
        return 'AGGRESSIVE';
    }

    tryTrigger(ball: Ball, _enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        ball.shield = 35;
        emitter.emit('ability:used', { ball, ability: 'Shield', x: ball.x, y: ball.y });
        return this.cooldownDuration;
    }
}
