import { Ability } from './Ability';
import { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';
import { emitter } from '../events';

export class SummonAbility extends Ability {
    readonly name = 'Summon';
    readonly cooldownDuration = 7.0;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        return ball.abilityCooldown <= 0.5 ? 'FLANKING' : 'AGGRESSIVE';
    }

    tryTrigger(ball: Ball, _enemy: Ball, arena: ArenaSize, _dt: number): number | null {
        const minionCount = state.balls.filter(b => b.isMinion && b.master === ball && b.hp > 0).length;
        if (minionCount >= 3) return null;

        const mDef = {
            ...ball.def,
            hp:     Math.max(1, Math.floor(ball.maxHp * 0.18)),
            maxHp:  Math.max(1, Math.floor(ball.maxHp * 0.18)),
            damage: Math.max(1, Math.floor(ball.baseDamage * 0.18)),
            r: 28, mass: 0.4, speed: 4.5, name: 'Minion',
            ability: 'Berserk',
            stolenAbilities: [],
        };
        const minion = new Ball(mDef as any);
        const spawnAngle = Math.random() * Math.PI * 2;
        minion.x = Math.max(minion.r, Math.min(arena.width  - minion.r, ball.x + Math.cos(spawnAngle) * (ball.r + 50)));
        minion.y = Math.max(minion.r, Math.min(arena.height - minion.r, ball.y + Math.sin(spawnAngle) * (ball.r + 50)));
        minion.team = ball.team;
        minion.isMinion = true;
        minion.master = ball;
        minion.behaviorState = 'AGGRESSIVE';
        state.balls.push(minion);
        emitter.emit('fx:particles', { x: minion.x, y: minion.y, color: ball.color, count: 12, speed: 2 });
        return this.cooldownDuration;
    }
}
