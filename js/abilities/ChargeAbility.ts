import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { normalizeAngle } from '../utils';
import { emitter } from '../events';

export class ChargeAbility extends Ability {
    readonly name = 'Charge';
    readonly cooldownDuration = 2.5;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        return ball.abilityCooldown <= 0.5 ? 'AGGRESSIVE' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        if (Math.abs(normalizeAngle(ball.angle - Math.atan2(dy, dx))) >= 0.3) return null;
        ball.charging = 1.0;
        emitter.emit('ability:used', { ball, ability: 'Charge', x: ball.x, y: ball.y });
        return this.cooldownDuration;
    }
}
