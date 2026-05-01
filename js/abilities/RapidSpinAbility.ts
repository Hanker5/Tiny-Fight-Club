import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize } from '../types';

export class RapidSpinAbility extends Ability {
    readonly name = 'RapidSpin';
    readonly cooldownDuration = 9999;
    readonly isPassive = true;

    private spinAngle = 0;
    private initialized = false;

    tick(ball: Ball, _enemy: Ball, _arena: ArenaSize, dt: number): void {
        if (!this.initialized) {
            this.initialized = true;
            this.spinAngle = Math.random() * Math.PI * 2;
            const angle = Math.random() * Math.PI * 2;
            ball.vx = Math.cos(angle) * 14;
            ball.vy = Math.sin(angle) * 14;
        }
        this.spinAngle += 6 * dt;
        ball.angle = this.spinAngle;

        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > 0) {
            ball.vx = (ball.vx / speed) * 14;
            ball.vy = (ball.vy / speed) * 14;
        }
    }

    getTargetAngle(ball: Ball, _enemy: Ball, _dist: number, _defaultAngle: number): number {
        // Lock steering to the current spin angle — AI cannot redirect Beyblade
        return ball.angle;
    }
}
