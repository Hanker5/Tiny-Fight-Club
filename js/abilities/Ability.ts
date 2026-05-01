import type { Ball } from '../entities';
import type { BehaviorMode, ArenaSize } from '../types';

export type { BehaviorMode, ArenaSize };

export abstract class Ability {
    abstract readonly name: string;
    abstract readonly cooldownDuration: number;

    /** True for passive abilities that never fire via the cooldown trigger system. */
    readonly isPassive: boolean = false;

    /** Per-instance cooldown used only when this ability is in a stolen slot. */
    cooldown: number = 0;

    /**
     * Called every frame regardless of cooldown state.
     * Use for passive/continuous effects (Trail spawning, etc.).
     */
    tick(_ball: Ball, _enemy: Ball, _arena: ArenaSize, _dt: number): void {}

    /**
     * Called when cooldown has expired and the game is in a fighting state.
     * Return the cooldown (seconds) to apply, or null if conditions weren't met.
     * Ball.update() applies the returned value to abilityCooldown (primary) or
     * sa.cooldown (stolen slot).
     */
    tryTrigger(_ball: Ball, _enemy: Ball, _arena: ArenaSize, _dt: number): number | null {
        return null;
    }

    /**
     * Return the desired BehaviorMode this frame, or null to use Ball's default logic.
     */
    getBehaviorHint(_ball: Ball, _enemy: Ball): BehaviorMode | null {
        return null;
    }

    /**
     * Override the targeting angle used for movement steering.
     * Default is Math.atan2(dy, dx) toward the enemy.
     */
    getTargetAngle(_ball: Ball, _enemy: Ball, _dist: number, defaultAngle: number): number {
        return defaultAngle;
    }

    /**
     * Called when this ball's weapon lands a hit on a defender.
     * Not called for reflected damage (isReflect = true).
     */
    onHitDealt(_attacker: Ball, _defender: Ball, _amount: number): void {}

    /**
     * Called when this ball receives weapon damage from an attacker.
     */
    onHitReceived(_defender: Ball, _attacker: Ball | null, _amount: number): void {}
}
