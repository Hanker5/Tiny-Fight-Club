import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { normalizeAngle } from '../utils';
import { emitter } from '../events';

export class DashAbility extends Ability {
    readonly name = 'Dash';
    readonly cooldownDuration = 1.7;

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        return ball.abilityCooldown <= 0.5 ? 'AGGRESSIVE' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        if (Math.abs(normalizeAngle(ball.angle - Math.atan2(dy, dx))) >= 0.3) return null;
        ball.vx += Math.cos(ball.angle) * 18;
        ball.vy += Math.sin(ball.angle) * 18;
        emitter.emit('ability:used', { ball, ability: 'Dash', x: ball.x, y: ball.y });
        return this.cooldownDuration;
    }
}
