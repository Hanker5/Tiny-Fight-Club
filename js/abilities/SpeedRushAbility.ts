import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { emitter } from '../events';

export class SpeedRushAbility extends Ability {
    readonly name = 'SpeedRush';
    readonly cooldownDuration = 9999;
    readonly isPassive = true;

    getBehaviorHint(_ball: Ball, _enemy: Ball): BehaviorMode | null {
        return 'AGGRESSIVE';
    }

    onHitReceived(defender: Ball, _attacker: Ball | null, _amount: number): void {
        defender.rushStacks++;
        emitter.emit('fx:particles', { x: defender.x, y: defender.y, color: '#ef4444', count: 4, speed: 3 });
    }
}
