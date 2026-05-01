import { Ability } from './Ability';
import type { Ball } from '../entities';
import { PortalPair } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';
import { emitter } from '../events';

export class PortalAbility extends Ability {
    readonly name = 'Portal';
    readonly cooldownDuration = 5.5;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        const hasPortal = state.portals.some(p => p.source === ball && p.active);
        return hasPortal ? 'AGGRESSIVE' : 'RETREATING';
    }

    tryTrigger(ball: Ball, enemy: Ball, arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 250 || state.portals.some(p => p.source === ball && p.active)) return null;

        const ax = ball.x, ay = ball.y;
        const toEnemy = Math.atan2(dy, dx);
        const bx = Math.max(60, Math.min(arena.width  - 60, enemy.x + Math.cos(toEnemy) * (enemy.r + 55)));
        const by = Math.max(60, Math.min(arena.height - 60, enemy.y + Math.sin(toEnemy) * (enemy.r + 55)));

        state.portals.push(new PortalPair(ax, ay, bx, by, ball));
        emitter.emit('fx:particles', { x: ax, y: ay, color: ball.color, count: 20, speed: 3 });
        emitter.emit('fx:particles', { x: bx, y: by, color: ball.color, count: 20, speed: 3 });
        return this.cooldownDuration;
    }
}
