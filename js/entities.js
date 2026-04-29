import { state } from './state.js';
import { normalizeAngle } from './utils.js';
import { emitter } from './events.js';

// Pure simulation — no canvas, no DOM, no direct FX calls.
// Visual effects are triggered by emitting events; fx.js subscribes.

export class Ball {
    constructor(def) {
        this.def = def;
        this.name = def.name;
        this.color = def.color;
        this.ability = def.ability;
        this.maxHp = def.maxHp;
        this.hp = def.hp;
        this.r = def.r;
        this.mass = def.mass;
        this.speed = def.speed;
        this.baseDamage = def.damage;

        this.x = 0; this.y = 0;
        this.vx = 0; this.vy = 0;
        this.angle = 0;

        // All timers in seconds
        this.abilityCooldown = 1.0;
        this.hitCooldown     = 0;
        this.poisoned        = 0;
        this.shield          = 0;
        this.flash           = 0;

        this.intangible  = 0;
        this.grappling   = 0;
        this.charging    = 0;
        this.pulseVisual = 0;

        this.behaviorState = 'AGGRESSIVE';
        this.behaviorTimer = 0;
        this.flankDir      = 1;

        this.lastBehaviorState = 'AGGRESSIVE';
        this.stateTime         = 0;

        this.poisonTickTimer = 0;
    }

    takeDamage(amount, source, isReflect = false) {
        if (this.intangible > 0) return;

        if (this.shield > 0) {
            this.shield -= amount;
            if (this.shield < 0) {
                this.hp += this.shield;
                this.shield = 0;
            }
        } else {
            this.hp -= amount;
        }

        if (source && source.ability === 'Vampire' && !isReflect && this.hp > 0) {
            const heal = amount * 0.5;
            source.hp = Math.min(source.maxHp, source.hp + heal);
            emitter.emit('fx:text', { text: '+HP', x: source.x, y: source.y - source.r - 45, color: '#10b981' });
        }

        if (this.ability === 'Reflect' && source && !isReflect && this.hp > 0) {
            const reflected = amount * 0.4;
            source.takeDamage(reflected, this, true);
            emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#14b8a6', count: 5, speed: 2 });
        }

        this.flash = 0.083;
        emitter.emit('ball:hit', { defender: this, attacker: source, damage: amount, isReflect });
    }

    update(enemy, width, height, dt) {
        const F = dt * 60;

        if (this.abilityCooldown > 0) {
            if (this.ability === 'Shield' && this.shield > 0) {
                // paused
            } else {
                this.abilityCooldown -= dt;
            }
        }
        if (this.hitCooldown > 0) this.hitCooldown  -= dt;
        if (this.intangible  > 0) this.intangible   -= dt;
        if (this.pulseVisual > 0) this.pulseVisual   -= dt;
        if (this.flash       > 0) this.flash         -= dt;

        if (this.poisoned > 0) {
            this.poisoned        -= dt;
            this.poisonTickTimer += dt;
            if (this.poisonTickTimer >= 0.25) {
                this.poisonTickTimer -= 0.25;
                this.takeDamage(1, null);
                emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#22c55e', count: 2, speed: 1 });
            }
        } else {
            this.poisonTickTimer = 0;
        }

        const dx   = enemy.x - this.x;
        const dy   = enemy.y - this.y;
        const dist = Math.hypot(dx, dy);

        let laserLeadAngle = Math.atan2(dy, dx);
        if (this.ability === 'Laser' && dist > 0) {
            const travelFrames = dist / 15;
            laserLeadAngle = Math.atan2(
                enemy.y + enemy.vy * travelFrames - this.y,
                enemy.x + enemy.vx * travelFrames - this.x
            );
        }

        if (this.grappling > 0 && enemy.intangible <= 0) {
            this.grappling -= dt;
            enemy.vx -= (dx / dist) * 1.2 * F;
            enemy.vy -= (dy / dist) * 1.2 * F;
            emitter.emit('fx:particles', { x: this.x + dx / 2, y: this.y + dy / 2, color: '#8b5cf6', count: 1, speed: 0, size: 2 });
        }

        if (this.charging > 0) {
            this.charging -= dt;
            this.vx += Math.cos(this.angle) * 0.6 * F;
            this.vy += Math.sin(this.angle) * 0.6 * F;
            if (Math.random() < 0.33 * F) emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#fb923c', count: 2, speed: 1, size: 4 });
        }

        if (dist > 0 && this.charging <= 0) {
            if (this.flash > 0.07) this.behaviorTimer = 0;
            if (dist < this.r + enemy.r + 60 && this.behaviorState === 'FLANKING') this.behaviorTimer = 0;

            this.behaviorTimer -= dt;
            if (this.behaviorTimer <= 0) {
                this.behaviorTimer = 0.5 + Math.random() * 0.67;

                const hpRatio      = this.hp / this.maxHp;
                const enemyHpRatio = enemy.hp / enemy.maxHp;
                const abilityReady = this.abilityCooldown <= 0.5;

                if (this.ability === 'Laser') {
                    this.behaviorState = abilityReady ? 'SNIPING' : ((dist < 350) ? 'RETREATING' : 'FLANKING');
                } else if (this.ability === 'Missile') {
                    this.behaviorState = (dist < 350) ? 'RETREATING' : 'FLANKING';
                } else if (this.ability === 'Trap') {
                    this.behaviorState = 'FLANKING';
                } else if (this.ability === 'Minion') {
                    this.behaviorState = (dist < 200) ? 'RETREATING' : 'FLANKING';
                } else if (this.ability === 'Berserk') {
                    this.behaviorState = 'AGGRESSIVE';
                } else if (this.ability === 'Poison') {
                    if (enemy.poisoned > 0) {
                        this.behaviorState = dist < 280 ? 'RETREATING' : 'FLANKING';
                    } else if (abilityReady) {
                        this.behaviorState = 'AGGRESSIVE';
                    } else {
                        this.behaviorState = hpRatio < 0.35 ? 'RETREATING' : 'FLANKING';
                    }
                } else if (this.ability === 'Dash' || this.ability === 'Charge') {
                    this.behaviorState = abilityReady ? 'AGGRESSIVE' : 'FLANKING';
                } else if (this.ability === 'Shield') {
                    if (this.shield > 0) this.behaviorState = 'AGGRESSIVE';
                    else if (hpRatio < 0.4 && !abilityReady) this.behaviorState = 'RETREATING';
                    else this.behaviorState = 'AGGRESSIVE';
                } else if (this.ability === 'Vampire' || this.ability === 'Reflect') {
                    this.behaviorState = hpRatio < 0.5 ? 'AGGRESSIVE' : (Math.random() > 0.2 ? 'AGGRESSIVE' : 'FLANKING');
                } else if (this.ability === 'Teleport' || this.ability === 'Phase' || this.ability === 'Pulse') {
                    this.behaviorState = abilityReady ? 'AGGRESSIVE' : 'FLANKING';
                } else if (this.ability === 'Grapple') {
                    this.behaviorState = (dist > 300) ? 'AGGRESSIVE' : 'FLANKING';
                } else if (this.ability === 'Heavy') {
                    this.behaviorState = dist > 250 ? 'AGGRESSIVE' : 'FLANKING';
                } else {
                    if (hpRatio < 0.25 && enemyHpRatio > 0.5) this.behaviorState = 'RETREATING';
                    else if (this.hp > enemy.hp) this.behaviorState = 'AGGRESSIVE';
                    else this.behaviorState = Math.random() > 0.3 ? 'AGGRESSIVE' : 'FLANKING';
                }

                if (Math.random() > 0.5) this.flankDir = Math.random() > 0.5 ? 1 : -1;
            }

            if (this.behaviorState === this.lastBehaviorState) {
                this.stateTime += dt;
            } else {
                this.stateTime         = 0;
                this.lastBehaviorState = this.behaviorState;
            }

            if (this.stateTime > 4.0) {
                if (this.ability === 'Berserk') {
                    this.vx += (Math.random() - 0.5) * 15;
                    this.vy += (Math.random() - 0.5) * 15;
                    this.stateTime = 0;
                } else {
                    let possibleStates = ['AGGRESSIVE', 'FLANKING', 'RETREATING'].filter(s => s !== this.behaviorState);
                    this.behaviorState     = possibleStates[Math.floor(Math.random() * possibleStates.length)];
                    this.behaviorTimer     = 2.0;
                    this.stateTime         = 0;
                    this.lastBehaviorState = this.behaviorState;
                    this.flankDir         *= -1;
                    this.vx += (Math.random() - 0.5) * 10;
                    this.vy += (Math.random() - 0.5) * 10;
                }
            }

            let targetAngle = (this.ability === 'Laser' && this.behaviorState === 'SNIPING')
                ? laserLeadAngle
                : Math.atan2(dy, dx);
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
            }

            let activeSpeed = this.speed;
            if (this.ability === 'Berserk') activeSpeed *= 1 + ((this.maxHp - this.hp) / this.maxHp) * 0.3;

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

        if (this.abilityCooldown <= 0 && state.gameState === 'FIGHTING') {
            if (this.ability === 'Dash' && Math.abs(normalizeAngle(this.angle - Math.atan2(dy, dx))) < 0.3) {
                this.vx += Math.cos(this.angle) * 16;
                this.vy += Math.sin(this.angle) * 16;
                this.abilityCooldown = 2.0;
                emitter.emit('ability:used', { ball: this, ability: 'Dash', x: this.x, y: this.y });

            } else if (this.ability === 'Charge' && Math.abs(normalizeAngle(this.angle - Math.atan2(dy, dx))) < 0.2) {
                this.charging        = 0.75;
                this.abilityCooldown = 3.0;
                emitter.emit('ability:used', { ball: this, ability: 'Charge', x: this.x, y: this.y });

            } else if (this.ability === 'Grapple' && dist < 350) {
                this.grappling       = 0.75;
                this.abilityCooldown = 2.67;
                emitter.emit('ability:used', { ball: this, ability: 'Grapple', x: this.x, y: this.y });

            } else if (this.ability === 'Phase') {
                const angleToMe     = Math.atan2(this.y - enemy.y, this.x - enemy.x);
                const enemyAimDiff  = Math.abs(normalizeAngle(enemy.angle - angleToMe));
                const isMeleeThreat = dist < (this.r + enemy.r + 120) && enemyAimDiff < 0.8 && enemy.intangible <= 0;
                const isProjThreat  = state.projectiles.some(p => p.target === this && Math.hypot(p.x - this.x, p.y - this.y) < (this.r + 100));
                if (isMeleeThreat || isProjThreat) {
                    this.intangible      = 1.5;
                    this.abilityCooldown = 3.67;
                    emitter.emit('ability:used', { ball: this, ability: 'Phase', x: this.x, y: this.y });
                }

            } else if (this.ability === 'Pulse' && dist < (this.r + enemy.r + 120) && enemy.intangible <= 0) {
                this.abilityCooldown = 2.5;
                this.pulseVisual     = 0.25;
                enemy.takeDamage(15, this);
                enemy.vx += (dx / dist) * 18;
                enemy.vy += (dy / dist) * 18;
                emitter.emit('ability:used', { ball: this, ability: 'Pulse', x: this.x, y: this.y });

            } else if (this.ability === 'Teleport' && dist < 350) {
                emitter.emit('fx:particles', { x: this.x, y: this.y, color: this.color, count: 20, speed: 2 });
                const tpDistance = enemy.r + this.r + 30;
                const targetX    = enemy.x - Math.cos(enemy.angle) * tpDistance;
                const targetY    = enemy.y - Math.sin(enemy.angle) * tpDistance;
                this.x           = Math.max(this.r, Math.min(width - this.r, targetX));
                this.y           = Math.max(this.r, Math.min(height - this.r, targetY));
                this.angle       = enemy.angle;
                this.abilityCooldown = 3.0;
                emitter.emit('ability:used', { ball: this, ability: 'Teleport', x: this.x, y: this.y });

            } else if (this.ability === 'Shield') {
                this.shield          = 50;
                this.abilityCooldown = 7.0;
                emitter.emit('ability:used', { ball: this, ability: 'Shield', x: this.x, y: this.y });

            } else if (this.ability === 'Missile' && Math.abs(normalizeAngle(this.angle - Math.atan2(dy, dx))) < 0.4) {
                const px = this.x + Math.cos(this.angle) * (this.r + 10);
                const py = this.y + Math.sin(this.angle) * (this.r + 10);
                state.projectiles.push(new Projectile(px, py, enemy, this, this.angle, true, 7, 10));
                this.abilityCooldown = 1.5;

            } else if (this.ability === 'Laser' && Math.abs(normalizeAngle(this.angle - laserLeadAngle)) < 0.15) {
                const px = this.x + Math.cos(this.angle) * (this.r + 10);
                const py = this.y + Math.sin(this.angle) * (this.r + 10);
                state.projectiles.push(new Projectile(px, py, enemy, this, this.angle, false, 18, 15));
                this.abilityCooldown = 1.33;
                this.behaviorState   = 'RETREATING';
                this.behaviorTimer   = 0.67;
                emitter.emit('fx:particles', { x: px, y: py, color: this.color, count: 10, speed: 2 });

            } else if (this.ability === 'Minion') {
                const px     = this.x + Math.cos(this.angle) * (this.r + 10);
                const py     = this.y + Math.sin(this.angle) * (this.r + 10);
                const spread = (Math.random() - 0.5) * 1.5;
                const p      = new Projectile(px, py, enemy, this, this.angle + spread, true, 4.5, 2);
                p.isSwarm        = true;
                p.r              = 5.25;
                p.life           = 5.0;
                state.projectiles.push(p);
                this.abilityCooldown = 0.25;

            } else if (this.ability === 'Trap') {
                state.hazards.push(new Hazard(this.x, this.y, this));
                this.abilityCooldown = 1.67;
            }
        }

        this.vx *= Math.pow(0.95, F);
        this.vy *= Math.pow(0.95, F);
        this.x  += this.vx * F;
        this.y  += this.vy * F;

        if (this.x - this.r < 0)      { this.x = this.r;         this.vx *= -1; this.vy += (Math.random() - 0.5) * 2; }
        if (this.x + this.r > width)  { this.x = width - this.r; this.vx *= -1; this.vy += (Math.random() - 0.5) * 2; }
        if (this.y - this.r < 0)      { this.y = this.r;          this.vy *= -1; this.vx += (Math.random() - 0.5) * 2; }
        if (this.y + this.r > height) { this.y = height - this.r; this.vy *= -1; this.vx += (Math.random() - 0.5) * 2; }
    }
}

export class Hazard {
    constructor(x, y, source) {
        this.x = x; this.y = y; this.source = source;
        this.r      = 24.5;
        this.active = true;
        this.life   = 7.0;
        this.damage = 18;
    }
    update(enemy, dt) {
        this.life -= dt;
        if (this.life <= 0) { this.active = false; return; }
        const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
        if (dist < enemy.r + this.r && enemy.intangible <= 0) {
            enemy.takeDamage(this.damage, this.source);
            emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#d97706', count: 25, speed: 5 });
            this.active = false;
        }
    }
}

export class Projectile {
    constructor(x, y, target, source, startAngle, homing = true, speed = 8, damage = 10) {
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
    update(dt) {
        this.life -= dt;
        if (this.life <= 0) { this.active = false; return; }

        const dx   = this.target.x - this.x;
        const dy   = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < this.target.r + this.r && this.target.intangible <= 0) {
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
            if (v > this.speed) {
                this.vx = (this.vx / v) * this.speed;
                this.vy = (this.vy / v) * this.speed;
            }
        }

        this.x += this.vx * dt * 60;
        this.y += this.vy * dt * 60;

        if (Math.random() < 0.5 * dt * 60) {
            emitter.emit('fx:particles', { x: this.x, y: this.y, color: this.color, count: 1, speed: 0.5, size: 2 });
        }
    }
}
