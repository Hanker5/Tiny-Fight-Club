import { Ability } from './Ability';
import type { Ball } from '../entities';
import { TrailSegment } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';
import { normalizeAngle } from '../utils';

const HALF_PI = Math.PI / 2;
const MIN_DIRECTION_TIME = 0.4; // seconds Tron must hold a direction before switching

export class TrailAbility extends Ability {
    readonly name = 'Trail';
    readonly cooldownDuration = 9999;
    readonly isPassive = true;

    private lockedAngle: number = 0;
    private dirTimer: number = 0;

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        return dist > (ball.r + enemy.r + 150) ? 'AGGRESSIVE' : 'RETREATING';
    }

    getTargetAngle(_ball: Ball, _enemy: Ball, _dist: number, defaultAngle: number): number {
        return Math.round(defaultAngle / HALF_PI) * HALF_PI;
    }

    tick(ball: Ball, enemy: Ball, arena: ArenaSize, dt: number): void {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        const approaching = dist > (ball.r + enemy.r + 150);

        const margin = 160;
        const nearWall = ball.x < margin || ball.x > arena.width - margin
                      || ball.y < margin || ball.y > arena.height - margin;

        let rawAngle: number;
        if (approaching) {
            rawAngle = Math.atan2(dy, dx);
        } else if (nearWall) {
            rawAngle = Math.atan2(arena.height / 2 - ball.y, arena.width / 2 - ball.x);
        } else {
            rawAngle = Math.atan2(dy, dx) + Math.PI;
        }
        const desired = Math.round(rawAngle / HALF_PI) * HALF_PI;

        // Only switch direction after holding the current one for MIN_DIRECTION_TIME.
        // This prevents jitter when the enemy sits near a 45° snap boundary.
        this.dirTimer -= dt;
        const turnDiff = normalizeAngle(desired - this.lockedAngle);
        if (this.dirTimer <= 0 && Math.abs(turnDiff) > 0.1) {
            if (Math.abs(Math.abs(turnDiff) - Math.PI) < 0.1) {
                // 180° reversal — not allowed. Take the 90° turn on whichever side
                // brings us closer to the target (cross product of heading vs enemy dir).
                const cross = Math.cos(this.lockedAngle) * dy - Math.sin(this.lockedAngle) * dx;
                this.lockedAngle = normalizeAngle(this.lockedAngle + (cross >= 0 ? 1 : -1) * HALF_PI);
            } else {
                this.lockedAngle = desired;
            }
            this.dirTimer = MIN_DIRECTION_TIME;
        }

        // Seed velocity at the physics equilibrium value (speed × 2) so friction and
        // acceleration cancel out each frame, giving a consistent rigid speed.
        const terminalSpeed = ball.speed * 2;
        ball.vx = Math.cos(this.lockedAngle) * terminalSpeed;
        ball.vy = Math.sin(this.lockedAngle) * terminalSpeed;
        ball.angle = this.lockedAngle;

        ball.trailTimer -= dt;
        if (ball.trailTimer <= 0) {
            ball.trailTimer = 0.08;
            if (state.trails.length < 200) {
                state.trails.push(new TrailSegment(ball.x, ball.y, ball));
            }
        }
    }
}
