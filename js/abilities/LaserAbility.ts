import { Ability } from './Ability';
import type { Ball } from '../entities';
import { Projectile } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { normalizeAngle } from '../utils';
import { state } from '../state';
import { emitter } from '../events';

export class LaserAbility extends Ability {
    readonly name = 'Laser';
    readonly cooldownDuration = 1.36;

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        const abilityReady = ball.abilityCooldown <= 0.5;
        return abilityReady ? 'SNIPING' : (dist < 350 ? 'RETREATING' : 'FLANKING');
    }

    getTargetAngle(ball: Ball, enemy: Ball, dist: number, defaultAngle: number): number {
        if (ball.behaviorState !== 'SNIPING') return defaultAngle;
        const travelFrames = dist / 15;
        return Math.atan2(
            enemy.y + enemy.vy * travelFrames - ball.y,
            enemy.x + enemy.vx * travelFrames - ball.x
        );
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        const travelFrames = dist / 15;
        const leadAngle = Math.atan2(
            enemy.y + enemy.vy * travelFrames - ball.y,
            enemy.x + enemy.vx * travelFrames - ball.x
        );
        if (Math.abs(normalizeAngle(ball.angle - leadAngle)) >= 0.15) return null;
        const px = ball.x + Math.cos(ball.angle) * (ball.r + 10);
        const py = ball.y + Math.sin(ball.angle) * (ball.r + 10);
        state.projectiles.push(new Projectile(px, py, enemy, ball, ball.angle, false, 18, 19));
        ball.behaviorState = 'RETREATING';
        ball.behaviorTimer = 0.67;
        emitter.emit('fx:particles', { x: px, y: py, color: ball.color, count: 10, speed: 2 });
        return this.cooldownDuration;
    }
}
