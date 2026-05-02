import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { BehaviorMode } from '../types';
import { emitter } from '../events';

export class ReflectAbility extends Ability {
    readonly name = 'Reflect';
    readonly cooldownDuration = 9999;
    readonly isPassive = true;

    getBehaviorHint(ball: Ball, _enemy: Ball): BehaviorMode | null {
        const hpRatio = ball.hp / ball.maxHp;
        return hpRatio < 0.5 ? 'AGGRESSIVE' : (Math.random() > 0.2 ? 'AGGRESSIVE' : 'FLANKING');
    }

    onHitReceived(defender: Ball, attacker: Ball | null, amount: number): void {
        if (!attacker || defender.hp <= 0) return;
        const reflected = amount * 0.35;
        attacker.takeDamage(reflected, defender, true);
        emitter.emit('fx:particles', { x: defender.x, y: defender.y, color: '#14b8a6', count: 5, speed: 2 });
    }
}
