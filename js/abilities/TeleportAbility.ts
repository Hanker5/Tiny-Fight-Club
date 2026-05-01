import { Ability } from './Ability';
import { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';
import { emitter } from '../events';

export class TeleportAbility extends Ability {
    readonly name = 'Teleport';
    readonly cooldownDuration = 3.0;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        return ball.abilityCooldown <= 0.5 ? 'AGGRESSIVE' : 'FLANKING';
    }

    tryTrigger(ball: Ball, enemy: Ball, arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        if (Math.hypot(dx, dy) >= 350) return null;

        const oldX = ball.x, oldY = ball.y;

        if (ball.ninjaDecoy && ball.ninjaDecoy.hp > 0) ball.ninjaDecoy.hp = 0;

        emitter.emit('fx:particles', { x: ball.x, y: ball.y, color: ball.color, count: 20, speed: 2 });
        const tpDistance = enemy.r + ball.r + 30;
        ball.x = Math.max(ball.r, Math.min(arena.width  - ball.r, enemy.x - Math.cos(enemy.angle) * tpDistance));
        ball.y = Math.max(ball.r, Math.min(arena.height - ball.r, enemy.y - Math.sin(enemy.angle) * tpDistance));
        ball.angle = enemy.angle;
        emitter.emit('ability:used', { ball, ability: 'Teleport', x: ball.x, y: ball.y });

        const decoyDef = {
            name: ball.name, color: ball.color, ability: 'none',
            hp: 1, maxHp: 1, damage: 0,
            r: ball.r, mass: ball.mass, speed: 0,
        };
        const decoy = new Ball(decoyDef as any);
        decoy.x = oldX;
        decoy.y = oldY;
        decoy.angle = ball.angle;
        decoy.team = ball.team;
        decoy.isDecoy = true;
        decoy.master = ball;
        (decoy as any).decoyHitsRemaining = 1;
        (decoy as any).decoyLifetime = 2;
        state.balls.push(decoy);
        ball.ninjaDecoy = decoy;
        emitter.emit('fx:particles', { x: oldX, y: oldY, color: ball.color, count: 12, speed: 1 });

        return this.cooldownDuration;
    }
}
