import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { emitter } from '../events';

export class ImmunityAbility extends Ability {
    readonly name = 'Immunity';
    readonly cooldownDuration = 5.0;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        return (ball.immuneActive || ball.abilityCooldown <= 0.5) ? 'AGGRESSIVE' : 'FLANKING';
    }

    tryTrigger(ball: Ball, _enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        ball.immuneActive = true;
        const self = ball;
        setTimeout(() => { self.immuneActive = false; }, 1500);
        emitter.emit('fx:text', { text: 'IMMUNE!', x: ball.x, y: ball.y - ball.r - 45, color: '#fbbf24' });
        emitter.emit('fx:particles', { x: ball.x, y: ball.y, color: '#fbbf24', count: 20, speed: 3 });
        return this.cooldownDuration;
    }
}
