import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';
import { emitter } from '../events';

const SHRIEK_RANGE = 190;
const STUN_DURATION = 1.4;
const NOTES = ['♩', '♪', '♫', '♬'];

export class ShriekAbility extends Ability {
    readonly name = 'Shriek';
    readonly cooldownDuration = 9.0;

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        if (enemy.stunned > 0) return 'AGGRESSIVE';
        if (ball.abilityCooldown <= 3.0) return 'AGGRESSIVE';  // start closing in early enough to guarantee range
        return null;  // default AI between shrieks — fights normally instead of orbiting away
    }

    getTargetAngle(ball: Ball, enemy: Ball, _dist: number, defaultAngle: number): number {
        if (enemy.stunned <= 0) return defaultAngle;
        // Steer toward a point behind the enemy (opposite their facing direction).
        // This ensures Son of Provo arrives from outside the enemy's weapon arc.
        const rearAngle = enemy.angle + Math.PI;
        const rearX = enemy.x + Math.cos(rearAngle) * (enemy.r * 1.5 + 20);
        const rearY = enemy.y + Math.sin(rearAngle) * (enemy.r * 1.5 + 20);
        return Math.atan2(rearY - ball.y, rearX - ball.x);
    }

    tryTrigger(ball: Ball, _enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const targets = state.balls.filter(b =>
            b !== ball &&
            b.hp > 0 &&
            b.team !== ball.team &&
            !b.isDecoy &&
            Math.hypot(b.x - ball.x, b.y - ball.y) <= SHRIEK_RANGE + ball.r
        );
        if (targets.length === 0) return null;

        ball.shriekVisual = 0.8;
        emitter.emit('ability:used', { ball, ability: 'Shriek', x: ball.x, y: ball.y });
        emitter.emit('fx:particles', { x: ball.x, y: ball.y, color: '#006eb6', count: 22, speed: 6 });
        emitter.emit('fx:text', { text: 'SHRIEK!', x: ball.x, y: ball.y - ball.r - 45, color: '#7dd3fc' });

        emitter.emit('fx:notes', {
            notes: Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2;
                return {
                    text:  NOTES[i % NOTES.length],
                    x:     ball.x + Math.cos(a) * (ball.r + 10),
                    y:     ball.y + Math.sin(a) * (ball.r + 10),
                    angle: a,
                    color: i % 2 === 0 ? '#7dd3fc' : '#bae6fd',
                };
            }),
        });

        for (const t of targets) {
            if (t.intangible > 0 || t.immuneActive) continue;
            t.stunned = STUN_DURATION;
            emitter.emit('fx:particles', { x: t.x, y: t.y, color: '#fde68a', count: 14, speed: 3 });
        }

        return this.cooldownDuration;
    }
}
