import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { BehaviorMode } from '../types';

export class BerserkAbility extends Ability {
    readonly name = 'Berserk';
    readonly cooldownDuration = 9999;
    readonly isPassive = true;

    getBehaviorHint(_ball: Ball, _enemy: Ball): BehaviorMode | null {
        return 'AGGRESSIVE';
    }
}
