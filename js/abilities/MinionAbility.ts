import { Ability } from './Ability';
import type { Ball } from '../entities';
import { Projectile } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';

export class MinionAbility extends Ability {
    readonly name = 'Minion';
    readonly cooldownDuration = 0.27;

    getBehaviorHint(_ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - _ball.x, dy = enemy.y - _ball.y;
        return Math.hypot(dx, dy) < 200 ? 'RETREATING' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const px = ball.x + Math.cos(ball.angle) * (ball.r + 10);
        const py = ball.y + Math.sin(ball.angle) * (ball.r + 10);
        const spread = (Math.random() - 0.5) * 1.5;
        const p = new Projectile(px, py, enemy, ball, ball.angle + spread, true, 4.5, 2);
        (p as any).isSwarm = true;
        p.r = 5.25;
        p.life = 5.0;
        state.projectiles.push(p);
        return this.cooldownDuration;
    }
}
