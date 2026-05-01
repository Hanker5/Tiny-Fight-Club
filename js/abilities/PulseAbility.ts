import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { emitter } from '../events';

export class PulseAbility extends Ability {
    readonly name = 'Pulse';
    readonly cooldownDuration = 3.0;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        return ball.abilityCooldown <= 0.5 ? 'AGGRESSIVE' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= ball.r + enemy.r + 120 || enemy.intangible > 0) return null;
        ball.pulseVisual = 0.5;
        enemy.takeDamage(12, ball);
        enemy.vx += (dx / dist) * 14;
        enemy.vy += (dy / dist) * 14;
        emitter.emit('ability:used', { ball, ability: 'Pulse', x: ball.x, y: ball.y });
        return this.cooldownDuration;
    }
}
