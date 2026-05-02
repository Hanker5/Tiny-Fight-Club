import { state } from './state';
import { normalizeAngle } from './utils';
import { emitter } from './events';
import { createAbility } from './abilities/AbilityRegistry';
import type { Ability } from './abilities/Ability';
import type { FighterDef, BehaviorMode } from './types';

// Pure simulation — no canvas, no DOM, no direct FX calls.
// Visual effects are triggered by emitting events; fx.ts subscribes.

export class Ball {
    def: FighterDef;
    name: string;
    color: string;
    abilityName: string;
    ability: Ability;
    maxHp: number;
    hp: number;
    r: number;
    mass: number;
    speed: number;
    baseDamage: number;

    x: number; y: number;
    vx: number; vy: number;
    angle: number;
    team: number;
    isClone: boolean;
    isMinion: boolean;
    isDecoy: boolean;
    master: Ball | null;
    ninjaDecoy: Ball | null;

    abilityCooldown: number;
    hitCooldown: number;
    poisoned: number;
    shield: number;
    flash: number;
    intangible: number;
    grappling: number;
    charging: number;
    pulseVisual: number;
    hexed: number;
    stunned: number;
    shriekVisual: number;

    behaviorState: BehaviorMode;
    behaviorTimer: number;
    flankDir: number;
    lastBehaviorState: BehaviorMode;
    stateTime: number;
    poisonTickTimer: number;

    immuneActive: boolean;
    rushStacks: number;
    trailTimer: number;
    blade: BoomerangBlade | null;
    momentumArmor: number;
    boomerangOut: boolean;
    shieldBurstTimer: number;
    shieldBurstActive: boolean;
    hasClone: boolean;
    hasAbsorbed: boolean;
    stolenAbilities: Ability[];

    // Decoy-only fields (set externally after construction)
    decoyLifetime?: number;
    decoyHitsRemaining?: number;

    constructor(def: FighterDef) {
        this.def = def;
        this.name = def.name;
        this.color = def.color;
        this.abilityName = def.ability;
        this.maxHp = def.maxHp;
        this.hp = def.hp;
        this.r = def.r;
        this.mass = def.mass;
        this.speed = def.speed;
        this.baseDamage = def.damage;

        this.x = 0; this.y = 0;
        this.vx = 0; this.vy = 0;
        this.angle = 0;
        this.team = 0;
        this.isClone = false;
        this.isMinion = false;
        this.isDecoy = false;
        this.master = null;
        this.ninjaDecoy = null;

        this.ability = createAbility(def.ability);
        this.stolenAbilities = (def.stolenAbilities ?? []).map(name => createAbility(name));

        // Portal gets a longer startup so Jimbo retreats before first use
        this.abilityCooldown = def.ability === 'Portal' ? 3.5 : 1.0;
        this.hitCooldown = 0;
        this.poisoned = 0;
        this.shield = 0;
        this.flash = 0;
        this.intangible = 0;
        this.grappling = 0;
        this.charging = 0;
        this.pulseVisual = 0;
        this.hexed = 0;
        this.stunned = 0;
        this.shriekVisual = 0;

        this.behaviorState = 'AGGRESSIVE';
        this.behaviorTimer = 0;
        this.flankDir = 1;
        this.lastBehaviorState = 'AGGRESSIVE';
        this.stateTime = 0;
        this.poisonTickTimer = 0;

        this.immuneActive = false;
        this.rushStacks = 0;
        this.trailTimer = 0;
        this.blade = null;
        this.momentumArmor = 0;
        this.boomerangOut = false;
        this.shieldBurstTimer = 0;
        this.shieldBurstActive = false;
        this.hasClone = false;
        this.hasAbsorbed = false;
    }

    takeDamage(amount: number, source: Ball | null, isReflect = false): void {
        if (this.intangible > 0) return;
        if (this.immuneActive) return;

        // ShieldBurst: an orbiting arc blocks hits from the attacker's direction
        if (source && this.shieldBurstActive && state.shields.length > 0) {
            const attackerAngle = Math.atan2(source.y - this.y, source.x - this.x);
            const blocker = state.shields.find(s =>
                s.source === this && s.active && s.phase === 'ORBITING' &&
                Math.abs(normalizeAngle(s.orbitAngle - attackerAngle)) < Math.PI / 5
            );
            if (blocker) {
                blocker.hp -= amount;
                emitter.emit('fx:particles', { x: blocker.x, y: blocker.y, color: '#C8A0DE', count: 10, speed: 4 });
                if (blocker.hp <= 0) {
                    blocker.active = false;
                    blocker._breakEffect();
                    const remaining = state.shields.filter(s => s.source === this && s.active && s.phase === 'ORBITING');
                    if (!remaining.length) this.shieldBurstActive = false;
                }
                return;
            }
        }

        // Momentum armor reduction (Ball Slayer)
        if (this.momentumArmor > 0) {
            amount = amount * (1 - this.momentumArmor);
        }

        if (this.shield > 0) {
            this.shield -= amount;
            if (this.shield < 0) {
                this.hp += this.shield;
                this.shield = 0;
            }
        } else {
            this.hp -= amount;
        }

        // Ability hit effects — skipped for reflected damage to prevent loops
        if (!isReflect && this.hp > 0) {
            if (source) {
                source.ability.onHitDealt(source, this, amount);
                for (const sa of source.stolenAbilities) sa.onHitDealt(source, this, amount);
            }
            this.ability.onHitReceived(this, source, amount);
            for (const sa of this.stolenAbilities) sa.onHitReceived(this, source, amount);
        }

        this.flash = 0.083;
        emitter.emit('ball:hit', { defender: this, attacker: source, damage: amount, isReflect });
    }

    update(enemy: Ball, width: number, height: number, dt: number): void {
        const F = dt * 60;

        if (this.isDecoy) {
            this.decoyLifetime! -= dt;
            if (this.decoyLifetime! <= 0) this.hp = 0;
        }

        // Tick primary ability cooldown (Shield pauses while shield is active)
        if (this.abilityCooldown > 0) {
            if (!(this.abilityName === 'Shield' && this.shield > 0)) {
                this.abilityCooldown -= dt;
            }
        }

        // Tick stolen ability cooldowns
        for (const sa of this.stolenAbilities) {
            if (sa.cooldown > 0) sa.cooldown -= dt;
        }

        if (this.hitCooldown > 0) this.hitCooldown  -= dt;
        if (this.intangible  > 0) this.intangible   -= dt;
        if (this.pulseVisual  > 0) this.pulseVisual   -= dt;
        if (this.flash        > 0) this.flash         -= dt;
        if (this.hexed        > 0) this.hexed         -= dt;
        if (this.stunned      > 0) this.stunned       -= dt;
        if (this.shriekVisual > 0) this.shriekVisual  -= dt;

        if (this.shieldBurstTimer > 0) {
            this.shieldBurstTimer -= dt;
            if (this.shieldBurstTimer <= 0 && this.shieldBurstActive) {
                state.shields
                    .filter(s => s.source === this && s.active && s.phase === 'ORBITING')
                    .forEach(s => s.release());
                this.shieldBurstActive = false;
            }
        }

        if (this.momentumArmor > 0) {
            this.momentumArmor = Math.max(0, this.momentumArmor - dt * 0.12);
        }

        if (this.poisoned > 0) {
            this.poisoned        -= dt;
            this.poisonTickTimer += dt;
            if (this.poisonTickTimer >= 0.25) {
                this.poisonTickTimer -= 0.25;
                this.takeDamage(1.45, null);
                emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#22c55e', count: 2, speed: 1 });
            }
        } else {
            this.poisonTickTimer = 0;
        }

        // Passive ability ticks (Trail spawning, etc.)
        this.ability.tick(this, enemy, { width, height }, dt);
        for (const sa of this.stolenAbilities) sa.tick(this, enemy, { width, height }, dt);

        const dx   = enemy.x - this.x;
        const dy   = enemy.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (this.grappling > 0 && enemy.intangible <= 0) {
            this.grappling -= dt;
            enemy.vx -= (dx / dist) * 1.5 * F;
            enemy.vy -= (dy / dist) * 1.5 * F;
            emitter.emit('fx:particles', { x: this.x + dx / 2, y: this.y + dy / 2, color: '#8b5cf6', count: 1, speed: 0, size: 2 });
        }

        if (this.charging > 0) {
            this.charging -= dt;
            this.vx += Math.cos(this.angle) * 0.9 * F;
            this.vy += Math.sin(this.angle) * 0.9 * F;
            if (Math.random() < 0.33 * F) emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#fb923c', count: 2, speed: 1, size: 4 });
        }

        if (this.stunned > 0) {
            this.vx *= Math.pow(0.7, F);
            this.vy *= Math.pow(0.7, F);
        }

        if (dist > 0 && this.charging <= 0 && this.abilityName !== 'RapidSpin' && this.stunned <= 0) {
            if (this.flash > 0.07) this.behaviorTimer = 0;
            if (dist < this.r + enemy.r + 60 && this.behaviorState === 'FLANKING') this.behaviorTimer = 0;

            this.behaviorTimer -= dt;
            if (this.behaviorTimer <= 0) {
                this.behaviorTimer = 0.5 + Math.random() * 0.67;
                const hint = this.ability.getBehaviorHint(this, enemy);
                this.behaviorState = hint ?? this._defaultBehavior(enemy);
                if (Math.random() > 0.5) this.flankDir = Math.random() > 0.5 ? 1 : -1;
            }

            if (this.behaviorState === this.lastBehaviorState) {
                this.stateTime += dt;
            } else {
                this.stateTime         = 0;
                this.lastBehaviorState = this.behaviorState;
            }

            if (this.stateTime > 4.0) {
                if (this.abilityName === 'Berserk') {
                    this.vx += (Math.random() - 0.5) * 15;
                    this.vy += (Math.random() - 0.5) * 15;
                    this.stateTime = 0;
                } else {
                    const possibleStates = (['AGGRESSIVE', 'FLANKING', 'RETREATING'] as BehaviorMode[])
                        .filter(s => s !== this.behaviorState);
                    this.behaviorState     = possibleStates[Math.floor(Math.random() * possibleStates.length)];
                    this.behaviorTimer     = 2.0;
                    this.stateTime         = 0;
                    this.lastBehaviorState = this.behaviorState;
                    this.flankDir         *= -1;
                    this.vx += (Math.random() - 0.5) * 10;
                    this.vy += (Math.random() - 0.5) * 10;
                }
            }

            let targetAngle = this.ability.getTargetAngle(this, enemy, dist, Math.atan2(dy, dx));

            if (this.behaviorState === 'FLANKING') {
                const wallMargin = 100;
                const flankAngle = targetAngle + (Math.PI / 2.5) * this.flankDir;
                const fx = Math.cos(flankAngle), fy = Math.sin(flankAngle);
                const towardWall = (this.x < wallMargin && fx < 0) || (this.x > width - wallMargin && fx > 0)
                                || (this.y < wallMargin && fy < 0) || (this.y > height - wallMargin && fy > 0);
                if (towardWall) this.flankDir *= -1;
                targetAngle += (Math.PI / 2.5) * this.flankDir;
            } else if (this.behaviorState === 'RETREATING') {
                targetAngle += Math.PI;
                const margin = 160;
                if (this.x < margin || this.x > width - margin || this.y < margin || this.y > height - margin) {
                    targetAngle = Math.atan2(height / 2 - this.y, width / 2 - this.x);
                }
                const lookahead = 150;
                const clearance = this.r + 48;
                for (const obs of state.obstacles) {
                    const odx = obs.x - this.x, ody = obs.y - this.y;
                    if (Math.hypot(odx, ody) > lookahead + obs.r) continue;
                    const rx = Math.cos(targetAngle), ry = Math.sin(targetAngle);
                    const proj = odx * rx + ody * ry;
                    if (proj < 0) continue;
                    const perpDist = Math.abs(odx * ry - ody * rx);
                    if (perpDist < clearance + obs.r) {
                        const cross = dx * ry - dy * rx;
                        targetAngle += (cross >= 0 ? -1 : 1) * (Math.PI / 2.5);
                        break;
                    }
                }
            }

            let activeSpeed = this.speed;
            if (this.abilityName === 'Berserk') activeSpeed *= 1 + ((this.maxHp - this.hp) / this.maxHp) * 0.2;
            if (this.rushStacks > 0) activeSpeed += Math.min(this.rushStacks * 0.5, 3.5);
            if (this.hexed > 0) activeSpeed *= 0.5;

            const angleDiff = normalizeAngle(targetAngle - this.angle);
            let turnSpeed = 0.05 * (activeSpeed / 4) * F;
            if (this.behaviorState === 'SNIPING') turnSpeed *= 2;

            if (angleDiff > turnSpeed) this.angle += turnSpeed;
            else if (angleDiff < -turnSpeed) this.angle -= turnSpeed;
            else this.angle = targetAngle;
            this.angle = normalizeAngle(this.angle);

            if (this.behaviorState === 'SNIPING') {
                this.vx *= Math.pow(0.85, F);
                this.vy *= Math.pow(0.85, F);
            } else if (this.behaviorState === 'RETREATING' && Math.hypot(this.vx, this.vy) > activeSpeed * 3) {
                // already moving fast while retreating — don't pile on more acceleration
            } else {
                this.vx += Math.cos(this.angle) * activeSpeed * 0.1 * F;
                this.vy += Math.sin(this.angle) * activeSpeed * 0.1 * F;
            }
        }

        const fighting = state.gameState === 'FIGHTING' || state.gameState === 'CUSTOM_1V1';
        const arena = { width, height };

        // Primary ability trigger
        if (this.abilityCooldown <= 0 && !this.ability.isPassive && fighting && this.stunned <= 0) {
            const cd = this.ability.tryTrigger(this, enemy, arena, dt);
            if (cd !== null) this.abilityCooldown = cd;
        }

        // Stolen ability triggers (Dirty Dave)
        if (fighting && this.stolenAbilities.length > 0) {
            for (const sa of this.stolenAbilities) {
                if (sa.cooldown <= 0 && !sa.isPassive && this.stunned <= 0) {
                    const cd = sa.tryTrigger(this, enemy, arena, dt);
                    if (cd !== null) sa.cooldown = cd;
                }
            }
        }

        if (this.abilityName !== 'RapidSpin') {
            this.vx *= Math.pow(0.95, F);
            this.vy *= Math.pow(0.95, F);
        }
        this.x  += this.vx * F;
        this.y  += this.vy * F;

        if (this.x - this.r < 0)      { this.x = this.r;         this.vx *= -1; this.vy += (Math.random() - 0.5) * 2; }
        if (this.x + this.r > width)  { this.x = width - this.r; this.vx *= -1; this.vy += (Math.random() - 0.5) * 2; }
        if (this.y - this.r < 0)      { this.y = this.r;          this.vy *= -1; this.vx += (Math.random() - 0.5) * 2; }
        if (this.y + this.r > height) { this.y = height - this.r; this.vy *= -1; this.vx += (Math.random() - 0.5) * 2; }
    }

    private _defaultBehavior(enemy: Ball): BehaviorMode {
        const hpRatio      = this.hp / this.maxHp;
        const enemyHpRatio = enemy.hp / enemy.maxHp;
        if (hpRatio < 0.25 && enemyHpRatio > 0.5) return 'RETREATING';
        if (this.hp > enemy.hp) return 'AGGRESSIVE';
        return Math.random() > 0.3 ? 'AGGRESSIVE' : 'FLANKING';
    }
}

export class Hazard {
    x: number; y: number; source: Ball;
    r: number; active: boolean; life: number; damage: number;

    constructor(x: number, y: number, source: Ball) {
        this.x = x; this.y = y; this.source = source;
        this.r      = 24.5;
        this.active = true;
        this.life   = 7.0;
        this.damage = 18;
    }

    update(enemy: Ball, dt: number): void {
        this.life -= dt;
        if (this.life <= 0) { this.active = false; return; }
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist < enemy.r + this.r && enemy.intangible <= 0) {
            enemy.takeDamage(this.damage, this.source);
            emitter.emit('fx:particles', { x: this.x, y: this.y, color: this.source.color, count: 25, speed: 5 });
            this.active = false;
        }
    }
}

export class TrailSegment {
    x: number; y: number; source: Ball;
    r: number; active: boolean; life: number; maxLife: number; tickTimer: number; damage: number;

    constructor(x: number, y: number, source: Ball) {
        this.x = x; this.y = y; this.source = source;
        this.r = 16;
        this.active = true;
        this.life = 6.0;
        this.maxLife = 6.0;
        this.tickTimer = 0;
        this.damage = 8;
    }

    update(enemy: Ball, dt: number): void {
        this.life -= dt;
        if (this.life <= 0) { this.active = false; return; }
        if (enemy.intangible > 0 || enemy.immuneActive) return;
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist < enemy.r + this.r) {
            this.tickTimer += dt;
            if (this.tickTimer >= 0.25) {
                this.tickTimer -= 0.25;
                enemy.takeDamage(this.damage, this.source);
            }
        } else {
            this.tickTimer = 0;
        }
    }
}

export class PortalPair {
    ax: number; ay: number;
    bx: number; by: number;
    r: number; source: Ball; active: boolean; life: number;
    recentlyTeleported: Map<Ball, number>;

    constructor(ax: number, ay: number, bx: number, by: number, source: Ball) {
        this.ax = ax; this.ay = ay;
        this.bx = bx; this.by = by;
        this.r = 45;
        this.source = source;
        this.active = true;
        this.life = 8.0;
        this.recentlyTeleported = new Map();
    }

    update(balls: Ball[], dt: number): void {
        this.life -= dt;
        if (this.life <= 0) { this.active = false; return; }

        for (const [ball, cd] of this.recentlyTeleported) {
            const next = cd - dt;
            if (next <= 0) this.recentlyTeleported.delete(ball);
            else this.recentlyTeleported.set(ball, next);
        }

        for (const ball of balls) {
            if (ball.hp <= 0) continue;
            if (this.recentlyTeleported.has(ball)) continue;

            const distA = Math.hypot(ball.x - this.ax, ball.y - this.ay);
            const distB = Math.hypot(ball.x - this.bx, ball.y - this.by);

            if (distA < this.r + ball.r * 0.5) {
                ball.x = this.bx; ball.y = this.by;
                const speed = Math.hypot(ball.vx, ball.vy);
                if (speed > 0.1) { ball.vx = (ball.vx / speed) * Math.max(speed, 4); ball.vy = (ball.vy / speed) * Math.max(speed, 4); }
                this.recentlyTeleported.set(ball, 0.75);
                emitter.emit('fx:particles', { x: this.bx, y: this.by, color: this.source.color, count: 20, speed: 4 });
                emitter.emit('fx:particles', { x: this.ax, y: this.ay, color: this.source.color, count: 8,  speed: 2 });
            } else if (distB < this.r + ball.r * 0.5) {
                ball.x = this.ax; ball.y = this.ay;
                const speed = Math.hypot(ball.vx, ball.vy);
                if (speed > 0.1) { ball.vx = (ball.vx / speed) * Math.max(speed, 4); ball.vy = (ball.vy / speed) * Math.max(speed, 4); }
                this.recentlyTeleported.set(ball, 0.75);
                emitter.emit('fx:particles', { x: this.ax, y: this.ay, color: this.source.color, count: 20, speed: 4 });
                emitter.emit('fx:particles', { x: this.bx, y: this.by, color: this.source.color, count: 8,  speed: 2 });
            }
        }
    }
}

export class BoomerangBlade {
    x: number; y: number;
    source: Ball; target: Ball;
    speed: number; r: number; damage: number; color: string;
    active: boolean; phase: string;
    vx: number; vy: number;
    life: number; hitCooldown: number; maxDistFromSource: number;
    abilityRef: Ability | null = null;

    constructor(x: number, y: number, angle: number, source: Ball, target: Ball) {
        this.x = x; this.y = y;
        this.source = source;
        this.target = target;
        this.speed = 11;
        this.r = 22;
        this.damage = source.baseDamage * 1.15;
        this.color = source.color;
        this.active = true;
        this.phase = 'OUTGOING';
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.life = 4.0;
        this.hitCooldown = 0;
        this.maxDistFromSource = 0;
    }

    update(dt: number): void {
        this.life -= dt;
        if (this.life <= 0) { this._catch(); return; }

        if (this.hitCooldown > 0) this.hitCooldown -= dt;

        const distFromSource = Math.hypot(this.x - this.source.x, this.y - this.source.y);

        if (this.phase === 'OUTGOING') {
            const perpX = -this.vy / this.speed;
            const perpY =  this.vx / this.speed;
            this.vx += perpX * 0.3 * dt * 60;
            this.vy += perpY * 0.3 * dt * 60;
            const v = Math.hypot(this.vx, this.vy);
            if (v > this.speed) { this.vx = (this.vx / v) * this.speed; this.vy = (this.vy / v) * this.speed; }

            this.maxDistFromSource = Math.max(this.maxDistFromSource, distFromSource);
            if (distFromSource > 380 || (this.maxDistFromSource > 80 && distFromSource < this.maxDistFromSource * 0.75)) {
                this.phase = 'RETURNING';
            }

            if (this.hitCooldown <= 0 && this.target.hp > 0) {
                const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
                if (d < this.target.r + this.r && this.target.intangible <= 0 && !this.target.immuneActive) {
                    this.target.takeDamage(this.damage, this.source);
                    this.hitCooldown = 0.5;
                    emitter.emit('fx:particles', { x: this.x, y: this.y, color: this.color, count: 14, speed: 4 });
                }
            }
        } else {
            const dx = this.source.x - this.x;
            const dy = this.source.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist < this.source.r + this.r) { this._catch(); return; }
            this.vx += (dx / dist) * 2.2 * dt * 60;
            this.vy += (dy / dist) * 2.2 * dt * 60;
            const v = Math.hypot(this.vx, this.vy);
            if (v > this.speed * 1.4) { this.vx = (this.vx / v) * this.speed * 1.4; this.vy = (this.vy / v) * this.speed * 1.4; }

            if (this.hitCooldown <= 0 && this.target.hp > 0) {
                const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
                if (d < this.target.r + this.r && this.target.intangible <= 0 && !this.target.immuneActive) {
                    this.target.takeDamage(this.damage, this.source);
                    this.hitCooldown = 0.5;
                    emitter.emit('fx:particles', { x: this.x, y: this.y, color: this.color, count: 14, speed: 4 });
                    this._catch();
                    return;
                }
            }
        }

        this.x += this.vx * dt * 60;
        this.y += this.vy * dt * 60;
    }

    _catch(): void {
        this.active = false;
        this.source.blade = null;
        this.source.boomerangOut = false;
        this.source.momentumArmor = 0;
        // Reset the correct cooldown slot (primary or stolen ability)
        if (this.abilityRef && this.abilityRef !== this.source.ability) {
            this.abilityRef.cooldown = 2.6;
        } else {
            this.source.abilityCooldown = 2.6;
        }
    }
}

export class OrbitalShield {
    source: Ball; target: Ball;
    orbitAngle: number; orbitRadius: number; orbitSpeed: number;
    r: number; hp: number; maxHp: number;
    phase: string; active: boolean;
    vx: number; vy: number;
    damage: number; hitCooldown: number; life: number;
    chargeTime: number; chargeDuration: number;
    x: number; y: number;

    constructor(source: Ball, orbitAngle: number, target: Ball) {
        this.source      = source;
        this.target      = target;
        this.orbitAngle  = orbitAngle;
        this.orbitRadius = source.r + 32;
        this.orbitSpeed  = 0.8;
        this.r           = 13;
        this.hp          = 13;
        this.maxHp       = 13;
        this.phase       = 'ORBITING';
        this.active      = true;
        this.vx          = 0;
        this.vy          = 0;
        this.damage        = 22;
        this.hitCooldown   = 0;
        this.life          = 8.0;
        this.chargeTime    = 0;
        this.chargeDuration = 5.0;
        this.x = source.x + Math.cos(orbitAngle) * this.orbitRadius;
        this.y = source.y + Math.sin(orbitAngle) * this.orbitRadius;
    }

    release(): void {
        if (this.phase !== 'ORBITING') return;
        this.phase = 'PROJECTILE';
        const angle = Math.atan2(this.y - this.source.y, this.x - this.source.x);
        const speed = 9;
        this.vx   = Math.cos(angle) * speed;
        this.vy   = Math.sin(angle) * speed;
        this.life = 3.0;
        emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#ADD8E6', count: 10, speed: 3 });
    }

    update(dt: number): void {
        this.life -= dt;
        if (this.life <= 0) { this.active = false; return; }
        if (this.hitCooldown > 0) this.hitCooldown -= dt;

        if (this.phase === 'ORBITING') {
            this.chargeTime = Math.min(this.chargeDuration, this.chargeTime + dt);
            this.orbitAngle += this.orbitSpeed * dt;
            this.x = this.source.x + Math.cos(this.orbitAngle) * this.orbitRadius;
            this.y = this.source.y + Math.sin(this.orbitAngle) * this.orbitRadius;
            if (this.source.hp <= 0) { this.release(); return; }
        } else {
            this.x += this.vx * dt * 60;
            this.y += this.vy * dt * 60;

            if (this.target && this.target.hp > 0 && this.hitCooldown <= 0) {
                const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
                if (d < this.target.r + this.r && this.target.intangible <= 0 && !this.target.immuneActive) {
                    this.target.takeDamage(this.damage, this.source);
                    this.active = false;
                    emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#ADD8E6', count: 16, speed: 5 });
                    return;
                }
            }

            if (Math.random() < 0.4 * dt * 60) {
                emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#ADD8E6', count: 1, speed: 0.5, size: 2 });
            }
        }
    }

    _breakEffect(): void {
        emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#C8A0DE', count: 14, speed: 5 });
        emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#ADD8E6', count: 6,  speed: 3 });
        emitter.emit('fx:text',      { text: 'BREAK!', x: this.x, y: this.y - 20, color: '#C8A0DE' });
    }
}

export class Projectile {
    x: number; y: number;
    target: Ball; source: Ball;
    homing: boolean; speed: number; r: number; damage: number; color: string;
    vx: number; vy: number;
    active: boolean; life: number; isSwarm: boolean;

    constructor(x: number, y: number, target: Ball, source: Ball, startAngle: number, homing = true, speed = 8, damage = 10) {
        this.x = x; this.y = y;
        this.target  = target;
        this.source  = source;
        this.homing  = homing;
        this.speed   = speed;
        this.r       = homing ? 10.5 : 7;
        this.damage  = damage;
        this.color   = source.color;
        this.vx      = Math.cos(startAngle) * speed;
        this.vy      = Math.sin(startAngle) * speed;
        this.active  = true;
        this.life    = homing ? 4.0 : 1.33;
        this.isSwarm = false;
    }

    update(dt: number): void {
        this.life -= dt;
        if (this.life <= 0) { this.active = false; return; }

        const dx   = this.target.x - this.x;
        const dy   = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (this.target.shieldBurstActive && state.shields.length > 0) {
            const projAngle = Math.atan2(-dy, -dx);
            const hitShield = state.shields.find(s =>
                s.source === this.target && s.active && s.phase === 'ORBITING' &&
                dist > s.orbitRadius - 10 - this.r &&
                dist < s.orbitRadius + 10 + this.r &&
                Math.abs(normalizeAngle(s.orbitAngle - projAngle)) < Math.PI / 5
            );
            if (hitShield) {
                hitShield.hp -= this.damage;
                this.active = false;
                emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#C8A0DE', count: 12, speed: 3 });
                if (hitShield.hp <= 0) {
                    hitShield.active = false;
                    hitShield._breakEffect();
                    const orbitingLeft = state.shields.filter(s => s.source === this.target && s.active && s.phase === 'ORBITING');
                    if (!orbitingLeft.length) this.target.shieldBurstActive = false;
                }
                return;
            }
        }

        if (dist < this.target.r + this.r && this.target.intangible <= 0 && !this.target.immuneActive) {
            this.target.takeDamage(this.damage, this.source);
            this.active = false;
            emitter.emit('fx:particles', { x: this.x, y: this.y, color: this.color, count: 12, speed: 3 });
            return;
        }

        if (this.homing) {
            const turnRate = this.isSwarm ? 0.8 : 1.2;
            this.vx += (dx / dist) * turnRate * dt * 60;
            this.vy += (dy / dist) * turnRate * dt * 60;

            if (this.isSwarm) {
                this.vx += (Math.random() - 0.5) * 2.5 * dt * 60;
                this.vy += (Math.random() - 0.5) * 2.5 * dt * 60;
            }

            const v = Math.hypot(this.vx, this.vy);
            if (v > this.speed) { this.vx = (this.vx / v) * this.speed; this.vy = (this.vy / v) * this.speed; }
        }

        this.x += this.vx * dt * 60;
        this.y += this.vy * dt * 60;

        if (Math.random() < 0.5 * dt * 60) {
            emitter.emit('fx:particles', { x: this.x, y: this.y, color: this.color, count: 1, speed: 0.5, size: 2 });
        }
    }
}

export class HexZone {
    x: number; y: number; source: Ball;
    r: number; active: boolean; life: number; tickTimer: number; damage: number;

    constructor(x: number, y: number, source: Ball) {
        this.x = x; this.y = y; this.source = source;
        this.r = 150;
        this.active = true;
        this.life = 3.0;
        this.tickTimer = 0;
        this.damage = 8;
    }

    update(enemy: Ball, dt: number): void {
        this.life -= dt;
        if (this.life <= 0) { this.active = false; return; }
        if (enemy.intangible > 0 || enemy.immuneActive) return;
        const dx = enemy.x - this.x, dy = enemy.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < enemy.r + this.r) {
            enemy.hexed = 0.15;
            const nx = (this.x - enemy.x) / (dist || 1);
            const ny = (this.y - enemy.y) / (dist || 1);
            enemy.vx += nx * 90 * dt;
            enemy.vy += ny * 90 * dt;
            this.tickTimer += dt;
            if (this.tickTimer >= 0.5) {
                this.tickTimer -= 0.5;
                enemy.takeDamage(this.damage, this.source);
                emitter.emit('fx:particles', { x: enemy.x, y: enemy.y, color: '#dc143c', count: 6, speed: 3, size: 3 });
            }
        }
    }
}

export class HexProjectile {
    x: number; y: number; source: Ball;
    r: number; active: boolean; life: number;
    vx: number; vy: number; passThroughBalls: boolean; hadBallInRange: boolean;

    constructor(x: number, y: number, targetX: number, targetY: number, source: Ball) {
        this.x = x; this.y = y;
        this.source = source;
        this.r = 25;
        this.active = true;
        this.life = 3.0;
        this.passThroughBalls = false;
        this.hadBallInRange = false;
        const angle = Math.atan2(targetY - y, targetX - x);
        const speed = 7;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
    }

    _land(): void {
        this.active = false;
        state.hexZones.push(new HexZone(this.x, this.y, this.source));
        emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#dc143c', count: 18, speed: 5, size: 3 });
    }

    update(dt: number, balls: Ball[], width: number, height: number): void {
        this.life -= dt;
        if (this.life <= 0) { this._land(); return; }

        this.x += this.vx * dt * 60;
        this.y += this.vy * dt * 60;
        emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#dc143c', count: 1, speed: 1, size: 2 });

        if (this.x - this.r < 0 || this.x + this.r > width ||
            this.y - this.r < 0 || this.y + this.r > height) {
            this.x = Math.max(this.r, Math.min(width  - this.r, this.x));
            this.y = Math.max(this.r, Math.min(height - this.r, this.y));
            this._land();
            return;
        }

        for (const obs of state.obstacles) {
            if (Math.hypot(obs.x - this.x, obs.y - this.y) < obs.r + this.r) {
                this._land();
                return;
            }
        }

        const HEX_ZONE_R = 150;
        let anyBallInZone = false;
        for (const ball of balls) {
            if (ball.team === this.source.team || ball.hp <= 0 || ball.intangible > 0) continue;
            if (Math.hypot(ball.x - this.x, ball.y - this.y) < HEX_ZONE_R) {
                anyBallInZone = true;
                break;
            }
        }

        if (anyBallInZone) {
            this.hadBallInRange = true;
            this.passThroughBalls = true;
        } else {
            this.passThroughBalls = false;
            if (this.hadBallInRange) {
                this._land();
                return;
            }
        }
    }
}
