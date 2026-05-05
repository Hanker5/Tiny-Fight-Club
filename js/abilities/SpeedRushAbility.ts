import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';

const MAX_SPEED_BONUS = 5.0;

export class SpeedRushAbility extends Ability {
    readonly name = 'SpeedRush';
    readonly cooldownDuration = 9999;
    readonly isPassive = true;

    getBehaviorHint(_ball: Ball, _enemy: Ball): BehaviorMode | null {
        return 'AGGRESSIVE';
    }

    tick(ball: Ball, _enemy: Ball, _arena: ArenaSize, _dt: number): void {
        ball.rushStacks = (1 - ball.hp / ball.maxHp) * MAX_SPEED_BONUS;
    }
}
