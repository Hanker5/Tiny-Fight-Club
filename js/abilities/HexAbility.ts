import { Ability } from './Ability';
import type { Ball } from '../entities';
import { HexProjectile } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { normalizeAngle } from '../utils';
import { state } from '../state';
import { emitter } from '../events';

export class HexAbility extends Ability {
    readonly name = 'Hex';
    readonly cooldownDuration = 7.0;

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        const abilityReady = ball.abilityCooldown <= 0.5;
        if (abilityReady) return dist < 500 ? 'SNIPING' : 'FLANKING';
        return dist < 400 ? 'RETREATING' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= 700 || Math.abs(normalizeAngle(ball.angle - Math.atan2(dy, dx))) >= 0.5) return null;
        state.hexProjectiles.push(new HexProjectile(ball.x, ball.y, enemy.x, enemy.y, ball));
        emitter.emit('ability:used', { ball, ability: 'Hex', x: ball.x, y: ball.y });
        return this.cooldownDuration;
    }
}
