import { Ability } from './Ability';
import type { Ball } from '../entities';
import { TrailSegment } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';

export class TrailAbility extends Ability {
    readonly name = 'Trail';
    readonly cooldownDuration = 9999;
    readonly isPassive = true;

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        return dist > (ball.r + enemy.r + 150) ? 'AGGRESSIVE' : 'RETREATING';
    }

    tick(ball: Ball, _enemy: Ball, _arena: ArenaSize, dt: number): void {
        ball.trailTimer -= dt;
        if (ball.trailTimer <= 0) {
            ball.trailTimer = 0.08;
            if (state.trails.length < 200) {
                state.trails.push(new TrailSegment(ball.x, ball.y, ball));
            }
        }
    }
}
