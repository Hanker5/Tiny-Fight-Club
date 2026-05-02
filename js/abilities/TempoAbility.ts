import { Ability } from './Ability';
import type { Ball } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { emitter } from '../events';

const MAX_STACKS = 2;
const BURST_DURATION = 4.5;   // seconds the burst lasts
const BURST_COOLDOWN = 8.5;   // total cooldown after burst fires (includes burst window)
const SPEED_BOOST = 3.0;      // added to ball.speed during burst
const REGEN_PER_SEC = 27;     // HP per second during burst

export class TempoAbility extends Ability {
    readonly name = 'Tempo';
    readonly cooldownDuration = BURST_COOLDOWN;
    readonly isPassive = false;

    private stacks = 0;
    private burstActive = false;
    private burstTimer = 0;
    private savedSpeed: number | null = null;
    private resetTimer = 0;

    tick(ball: Ball, _enemy: Ball, _arena: ArenaSize, dt: number): void {
        if (this.resetTimer > 0) this.resetTimer -= dt;

        if (this.burstActive) {
            this.burstTimer -= dt;
            if (this.burstTimer <= 0) {
                this._endBurst(ball);
            } else {
                ball.hp = Math.min(ball.maxHp, ball.hp + REGEN_PER_SEC * dt);
                if (Math.random() < 0.15) {
                    emitter.emit('fx:particles', { x: ball.x, y: ball.y, color: '#e8c99a', count: 3, speed: 4 });
                }
            }
        }
    }

    tryTrigger(ball: Ball, _enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        if (this.stacks < MAX_STACKS) return null;
        this.burstActive = true;
        this.burstTimer = BURST_DURATION;
        this.stacks = 0;
        this.savedSpeed = ball.speed;
        ball.speed += SPEED_BOOST;
        emitter.emit('ability:used', { ball, ability: 'Tempo', x: ball.x, y: ball.y });
        emitter.emit('fx:particles', { x: ball.x, y: ball.y, color: '#e8c99a', count: 25, speed: 6 });
        emitter.emit('fx:text', { text: 'BURST', x: ball.x, y: ball.y - ball.r - 45, color: '#fbbf24' });
        return BURST_COOLDOWN;
    }

    getBehaviorHint(_ball: Ball, _enemy: Ball): BehaviorMode | null {
        if (this.burstActive) return 'AGGRESSIVE';
        if (this.resetTimer > 0) return 'RETREATING';
        if (this.stacks >= MAX_STACKS - 1) return 'AGGRESSIVE';
        if (this.stacks >= 1) return 'FLANKING';
        return null;
    }

    onHitDealt(attacker: Ball, _defender: Ball, _amount: number): void {
        if (this.burstActive) return;
        this.stacks = Math.min(MAX_STACKS, this.stacks + 1);
        emitter.emit('fx:particles', { x: attacker.x, y: attacker.y, color: '#e8c99a', count: 4, speed: 3 });
        if (this.stacks === 2) {
            emitter.emit('fx:text', { text: 'TEMPO', x: attacker.x, y: attacker.y - attacker.r - 45, color: '#e8c99a' });
        }
    }

    onHitReceived(defender: Ball, _attacker: Ball | null, _amount: number): void {
        if (this.stacks > 0 || this.burstActive) {
            this.stacks = Math.max(0, this.stacks - 1);
            this.resetTimer = 0.45;
            this._endBurst(defender);
        }
    }

    private _endBurst(ball: Ball): void {
        if (!this.burstActive) return;
        this.burstActive = false;
        this.burstTimer = 0;
        if (this.savedSpeed !== null) {
            ball.speed = this.savedSpeed;
            this.savedSpeed = null;
        }
    }
}
