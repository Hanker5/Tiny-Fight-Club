import { Ability } from './Ability';
import type { Ball } from '../entities';
import { Projectile } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';

export class MissileAbility extends Ability {
    readonly name = 'Missile';
    readonly cooldownDuration = 1.2;

    getBehaviorHint(_ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - _ball.x, dy = enemy.y - _ball.y;
        return Math.hypot(dx, dy) < 350 ? 'RETREATING' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const px = ball.x + Math.cos(ball.angle) * (ball.r + 10);
        const py = ball.y + Math.sin(ball.angle) * (ball.r + 10);
        state.projectiles.push(new Projectile(px, py, enemy, ball, ball.angle, true, 8, 10));
        return this.cooldownDuration;
    }
}
