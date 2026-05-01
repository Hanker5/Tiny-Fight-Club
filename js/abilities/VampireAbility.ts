import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { BehaviorMode } from '../types';
import { emitter } from '../events';

export class VampireAbility extends Ability {
    readonly name = 'Vampire';
    readonly cooldownDuration = 9999;
    readonly isPassive = true;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        const hpRatio = ball.hp / ball.maxHp;
        return hpRatio < 0.5 ? 'AGGRESSIVE' : (Math.random() > 0.2 ? 'AGGRESSIVE' : 'FLANKING');
    }

    onHitDealt(attacker: Ball, _defender: Ball, amount: number): void {
        const heal = amount * 0.25;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
        emitter.emit('fx:text', { text: '+HP', x: attacker.x, y: attacker.y - attacker.r - 45, color: '#10b981' });
    }
}
