import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { BehaviorMode } from '../types';

export class HeavyAbility extends Ability {
    readonly name = 'Heavy';
    readonly cooldownDuration = 9999;
    readonly isPassive = true;

    getBehaviorHint(_ball: Ball, enemy: Ball): BehaviorMode | null {
        const dx = enemy.x - _ball.x, dy = enemy.y - _ball.y;
        return Math.hypot(dx, dy) > 250 ? 'AGGRESSIVE' : 'FLANKING';
    }
}
