import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { emitter } from '../events';
import { normalizeAngle } from '../utils';

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

        // Don't grapple if enemy is outside Hook's weapon arc — they'd collide into Hook's rear
        const angleToEnemy = Math.atan2(dy, dx);
        if (Math.abs(normalizeAngle(ball.angle - angleToEnemy)) >= 1.05) return null;

        // Don't grapple if enemy's weapon is aimed at Hook — pulling them in gives them a free weapon hit
        const angleEnemyToHook = Math.atan2(-dy, -dx);
        if (Math.abs(normalizeAngle(enemy.angle - angleEnemyToHook)) < 1.05) return null;

        ball.grappling = 1.0;
        emitter.emit('ability:used', { ball, ability: 'Grapple', x: ball.x, y: ball.y });
        return this.cooldownDuration;
    }
}
