import { Ability } from './Ability';
import type { Ball } from '../entities';
import { OrbitalShield } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';
import { emitter } from '../events';

export class ShieldBurstAbility extends Ability {
    readonly name = 'ShieldBurst';
    readonly cooldownDuration = 8.5;

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        if (ball.shieldBurstActive) return dist < 300 ? 'RETREATING' : 'FLANKING';
        if (ball.abilityCooldown <= 0.5) return 'AGGRESSIVE';
        return dist < 350 ? 'RETREATING' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        if (ball.shieldBurstActive) return null;
        for (let i = 0; i < 5; i++) {
            state.shields.push(new OrbitalShield(ball, (i / 5) * Math.PI * 2, enemy));
        }
        ball.shieldBurstActive = true;
        ball.shieldBurstTimer = 5.0;
        emitter.emit('ability:used', { ball, ability: 'ShieldBurst', x: ball.x, y: ball.y });
        emitter.emit('fx:particles', { x: ball.x, y: ball.y, color: '#C8A0DE', count: 25, speed: 4 });
        return this.cooldownDuration;
    }
}
