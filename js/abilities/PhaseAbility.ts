import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { normalizeAngle } from '../utils';
import { state } from '../state';
import { emitter } from '../events';

export class PhaseAbility extends Ability {
    readonly name = 'Phase';
    readonly cooldownDuration = 3.0;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        return ball.abilityCooldown <= 0.5 ? 'AGGRESSIVE' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        const angleToMe = Math.atan2(ball.y - enemy.y, ball.x - enemy.x);
        const enemyAimDiff = Math.abs(normalizeAngle(enemy.angle - angleToMe));
        const isMeleeThreat = dist < (ball.r + enemy.r + 120) && enemyAimDiff < 0.8 && enemy.intangible <= 0;
        const isProjThreat = state.projectiles.some(p => p.target === ball && Math.hypot(p.x - ball.x, p.y - ball.y) < (ball.r + 100));
        if (!isMeleeThreat && !isProjThreat) return null;
        ball.intangible = 1.7;
        emitter.emit('ability:used', { ball, ability: 'Phase', x: ball.x, y: ball.y });
        return this.cooldownDuration;
    }
}
