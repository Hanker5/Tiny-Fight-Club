import { Ability } from './Ability';
import { createAbility } from './AbilityRegistry';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { emitter } from '../events';

const UNSTEALABLE = new Set(['Absorb', 'RapidSpin']);

export class AbsorbAbility extends Ability {
    readonly name = 'Absorb';
    readonly cooldownDuration = 3.0;

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        const wantsAbsorb = !ball.hasAbsorbed && ball.stolenAbilities.length < 3;
        if (wantsAbsorb && dist < 175) return 'AGGRESSIVE';
        if (wantsAbsorb) return 'FLANKING';
        return 'AGGRESSIVE';
    }

    tryTrigger(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        if (ball.hasAbsorbed || ball.stolenAbilities.length >= 3 || dist >= 175) return null;
        if (enemy.isMinion || enemy.isClone || enemy.isDecoy) return null;
        if (!enemy.ability) return null;

        const raw = enemy.def ? enemy.def.ability : enemy.abilityName;
        const toSteal = (raw && !UNSTEALABLE.has(raw)) ? raw : null;
        if (!toSteal || ball.stolenAbilities.some(a => a.name === toSteal)) return null;

        const newAbility = createAbility(toSteal);
        ball.stolenAbilities.push(newAbility);
        ball.def.stolenAbilities = ball.stolenAbilities.map(a => a.name);
        ball.hasAbsorbed = true;

        emitter.emit('fx:text', { text: 'ABSORBED!', x: ball.x, y: ball.y - ball.r - 45, color: ball.color });
        emitter.emit('fx:particles', { x: ball.x, y: ball.y, color: ball.color, count: 20, speed: 4 });
        return this.cooldownDuration;
    }
}
