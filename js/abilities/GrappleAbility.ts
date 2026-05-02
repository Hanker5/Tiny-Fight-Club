import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { emitter } from '../events';

export class GrappleAbility extends Ability {
    readonly name = 'Grapple';
    readonly cooldownDuration = 2.7;

    getBehaviorHint(_ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - _ball.x, dy = enemy.y - _ball.y;
        return Math.hypot(dx, dy) > 300 ? 'AGGRESSIVE' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        if (Math.hypot(dx, dy) >= 350) return null;
        ball.grappling = 1.0;
        emitter.emit('ability:used', { ball, ability: 'Grapple', x: ball.x, y: ball.y });
        return this.cooldownDuration;
    }
}
