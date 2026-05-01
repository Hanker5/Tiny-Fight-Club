import { Ability } from './Ability';
import type { Ball } from '../entities';
import { Hazard } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';

export class TrapAbility extends Ability {
    readonly name = 'Trap';
    readonly cooldownDuration = 1.67;

    getBehaviorHint(_ball: Ball, _enemy: Ball): BehaviorMode | null {
        return 'FLANKING';
    }

    tryTrigger(ball: Ball, _enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        state.hazards.push(new Hazard(ball.x, ball.y, ball));
        return this.cooldownDuration;
    }
}
