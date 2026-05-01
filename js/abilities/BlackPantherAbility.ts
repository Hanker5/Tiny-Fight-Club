import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { emitter } from '../events';

export class BlackPantherAbility extends Ability {
    readonly name = 'BlackPanther';
    readonly cooldownDuration = 1.4;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        const hpRatio = ball.hp / ball.maxHp;
        return hpRatio > 0.6 && Math.random() > 0.4 ? 'AGGRESSIVE' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        if (Math.hypot(dx, dy) >= ball.r + enemy.r + 80) return null;
        ball.vx += Math.cos(ball.angle + Math.PI / 2 * ball.flankDir) * 12;
        ball.vy += Math.sin(ball.angle + Math.PI / 2 * ball.flankDir) * 12;
        emitter.emit('fx:particles', { x: ball.x, y: ball.y, color: '#6b21a8', count: 8, speed: 4 });
        return this.cooldownDuration;
    }
}
