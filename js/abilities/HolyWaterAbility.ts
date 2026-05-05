import { Ability } from './Ability';
import type { Ball } from '../entities';
import { Projectile } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';
import { emitter } from '../events';

export class HolyWaterAbility extends Ability {
    readonly name = 'HolyWater';
    readonly cooldownDuration = 1.8;
    private justFired = false;
    private fireTimer = 0;

    tick(ball: Ball, enemy: Ball, arena: ArenaSize, dt: number): void {
        // Reset justFired flag after a short window (enough time for projectile hit)
        if (this.justFired) {
            this.fireTimer -= dt;
            if (this.fireTimer <= 0) {
                this.justFired = false;
            }
        }
    }

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        const dist = Math.hypot(enemy.x - ball.x, enemy.y - ball.y);
        const abilityReady = ball.abilityCooldown <= 0.5;
        // Need to be close (< 150px) to use ability effectively
        if (abilityReady && dist < 350) return 'AGGRESSIVE';
        // Always aggressive when trying to get in range
        if (abilityReady) return 'AGGRESSIVE';
        return dist < 250 ? 'RETREATING' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x;
        const dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 350) return null;

        // Actual direction toward enemy — more accurate than ball.angle
        const splashAngle = Math.atan2(dy, dx);
        const spread = 0.85; // radians — wide enough to look like a splash

        // 10 projectiles, varying speed and slight jitter so it looks chaotic like water
        const count = 10;
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            const offset = (t - 0.5) * spread + (Math.random() - 0.5) * 0.1;
            const speed = 13 + Math.random() * 9; // 13–22 px/frame
            const angle = splashAngle + offset;
            const px = ball.x + Math.cos(angle) * (ball.r + 10);
            const py = ball.y + Math.sin(angle) * (ball.r + 10);
            const proj = new Projectile(px, py, enemy, ball, angle, false, speed, 8, '#38bdf8');
            proj.life = 0.22;
            state.projectiles.push(proj);
        }

        // Fine spray flying toward enemy
        emitter.emit('fx:particles', {
            x: ball.x, y: ball.y, color: '#7dd3fc',
            count: 28, speed: 10, size: 1.2,
            direction: splashAngle, spread: 0.75
        });

        // Pre-emptive impact cloud at enemy position — wide backwards fan
        emitter.emit('fx:particles', {
            x: enemy.x, y: enemy.y, color: '#bae6fd',
            count: 18, speed: 5, size: 1.5,
            direction: splashAngle + Math.PI, spread: Math.PI * 1.3
        });

        this.justFired = true;
        this.fireTimer = 0.3;

        ball.behaviorState = 'AGGRESSIVE';
        ball.behaviorTimer = 0.8;
        emitter.emit('ability:used', { ball, ability: 'HolyWater', x: ball.x, y: ball.y });

        return this.cooldownDuration;
    }

    onHitDealt(attacker: Ball, defender: Ball, amount: number): void {
        if (this.justFired && amount === 8) {
            defender.abilityCooldown = 9999;
            attacker.abilityCooldown = 9999;

            // Big impact burst — water splashing back from the hit
            const angle = Math.atan2(defender.y - attacker.y, defender.x - attacker.x);
            emitter.emit('fx:particles', {
                x: defender.x, y: defender.y, color: '#0ea5e9',
                count: 22, speed: 7, size: 2,
                direction: angle + Math.PI, spread: Math.PI * 1.5
            });

            emitter.emit('fx:text', {
                text: 'BLESSED!',
                x: defender.x,
                y: defender.y - defender.r - 45,
                color: '#38bdf8'
            });
        }
    }
}
