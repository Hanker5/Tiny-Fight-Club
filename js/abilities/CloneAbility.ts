import { Ability } from './Ability';
import { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';
import { emitter } from '../events';

export class CloneAbility extends Ability {
    readonly name = 'Clone';
    readonly cooldownDuration = 9999;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        return ball.abilityCooldown <= 0.5 ? 'FLANKING' : 'AGGRESSIVE';
    }

    tryTrigger(ball: Ball, enemy: Ball, arena: ArenaSize, _dt: number): number | null {
        if (ball.hasClone) return null;
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const cloneDef = {
            ...ball.def,
            hp:     Math.floor(ball.maxHp),
            maxHp:  Math.floor(ball.maxHp),
            damage: Math.floor(ball.baseDamage),
            name:   ball.name + ' (Clone)',
            ability: 'Berserk',
            stolenAbilities: [],
        };
        const clone = new Ball(cloneDef as any);
        const spawnAngle = Math.atan2(dy, dx) + Math.PI / 2;
        clone.x = Math.max(clone.r, Math.min(arena.width  - clone.r, ball.x + Math.cos(spawnAngle) * (ball.r * 2 + 40)));
        clone.y = Math.max(clone.r, Math.min(arena.height - clone.r, ball.y + Math.sin(spawnAngle) * (ball.r * 2 + 40)));
        clone.team = ball.team;
        clone.isClone = true;
        clone.master = ball;
        clone.behaviorState = 'FLANKING';
        clone.flankDir = -ball.flankDir;
        state.balls.push(clone);
        ball.hasClone = true;
        emitter.emit('fx:text', { text: 'CLONE!', x: ball.x, y: ball.y - ball.r - 45, color: ball.color });
        emitter.emit('fx:particles', { x: clone.x, y: clone.y, color: ball.color, count: 20, speed: 3 });
        return this.cooldownDuration;
    }
}
