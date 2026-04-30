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

        // Team assignment (1 or 2, set by game.js after construction)
        this.team = 0;
        this.isClone = false;
        this.isMinion = false;
        this.isDecoy = false;
        this.master = null;
        this.ninjaDecoy = null;

        // All timers in seconds
        // Portal gets a longer startup so Jimbo retreats before first use
        this.abilityCooldown = def.ability === 'Portal' ? 3.5 : 1.0;
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

        // Immunity (CrazedAngelus)
        this.immuneActive = false;

        // SpeedRush (The Gravy Train)
        this.rushStacks = 0;

        // Trail (Tron)
        this.trailTimer = 0;

        // Boomerang (Ball Slayer)
        this.blade = null;
        this.momentumArmor = 0;
        this.boomerangOut = false;

        // Clone (Stick Man)
        this.hasClone = false;

        // Absorb (Dirty Dave)
        this.hasAbsorbed = false;
        this.stolenAbilities = def.stolenAbilities ? [...def.stolenAbilities] : [];
        this.stolenCooldowns = this.stolenAbilities.map(() => 0);
    }

    takeDamage(amount, source, isReflect = false) {
        if (this.intangible > 0) return;
        if (this.immuneActive) return;

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

        if (source && source.ability === 'Vampire' && !isReflect && this.hp > 0) {
            const heal = amount * 0.25;
            source.hp = Math.min(source.maxHp, source.hp + heal);
            emitter.emit('fx:text', { text: '+HP', x: source.x, y: source.y - source.r - 45, color: '#10b981' });
        }

        if (this.ability === 'Reflect' && source && !isReflect && this.hp > 0) {
            const reflected = amount * 0.3;
            source.takeDamage(reflected, this, true);
            emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#14b8a6', count: 5, speed: 2 });
        }

        // SpeedRush: gain a stack each time hit
        if (this.ability === 'SpeedRush' || this.stolenAbilities.includes('SpeedRush')) {
            this.rushStacks++;
            emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#ef4444', count: 4, speed: 3 });
        }

        this.flash = 0.083;
        emitter.emit('ball:hit', { defender: this, attacker: source, damage: amount, isReflect });
    }

    update(enemy, width, height, dt) {
        const F = dt * 60;

        if (this.isDecoy) {
            this.decoyLifetime -= dt;
            if (this.decoyLifetime <= 0) this.hp = 0;
        }

        if (this.abilityCooldown > 0) {
            if (this.ability === 'Shield' && this.shield > 0) {
                // paused
            } else {
                this.abilityCooldown -= dt;
            }
        }
        for (let _i = 0; _i < this.stolenCooldowns.length; _i++) {
            if (this.stolenCooldowns[_i] > 0) this.stolenCooldowns[_i] -= dt;
        }
        if (this.hitCooldown > 0) this.hitCooldown  -= dt;
        if (this.intangible  > 0) this.intangible   -= dt;
        if (this.pulseVisual > 0) this.pulseVisual   -= dt;
        if (this.flash       > 0) this.flash         -= dt;

        // Momentum armor decay
        if (this.momentumArmor > 0) {
            this.momentumArmor = Math.max(0, this.momentumArmor - dt * 0.12);
        }

        if (this.poisoned > 0) {
            this.poisoned        -= dt;
            this.poisonTickTimer += dt;
            if (this.poisonTickTimer >= 0.25) {
                this.poisonTickTimer -= 0.25;
                this.takeDamage(1.5, null);
                emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#22c55e', count: 2, speed: 1 });
            }
        } else {
            this.poisonTickTimer = 0;
        }

        // Trail: spawn segment frequently to form a solid connected wall
        if (this.ability === 'Trail' || this.stolenAbilities.includes('Trail')) {
            this.trailTimer -= dt;
            if (this.trailTimer <= 0) {
                this.trailTimer = 0.08;
                if (state.trails.length < 200) {
                    state.trails.push(new TrailSegment(this.x, this.y, this));
                }
            }
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
                } else if (this.ability === 'Boomerang') {
                    // Strafe perpendicular after throw; retreat when blade is returning
                    if (this.boomerangOut) {
                        this.behaviorState = 'FLANKING';
                    } else if (abilityReady) {
                        this.behaviorState = dist < 400 ? 'AGGRESSIVE' : 'FLANKING';
                    } else {
                        this.behaviorState = 'RETREATING';
                    }
                } else if (this.ability === 'SpeedRush') {
                    // Charge in — wants to get hit to build stacks
                    this.behaviorState = 'AGGRESSIVE';
                } else if (this.ability === 'Immunity') {
                    this.behaviorState = (this.immuneActive || abilityReady) ? 'AGGRESSIVE' : 'FLANKING';
                } else if (this.ability === 'Trail') {
                    this.behaviorState = dist > (this.r + enemy.r + 150) ? 'AGGRESSIVE' : 'RETREATING';
                } else if (this.ability === 'Portal') {
                    // Retreat while no portals are up; once portals are placed charge through them
                    const hasPortal = state.portals.some(p => p.source === this && p.active);
                    this.behaviorState = hasPortal ? 'AGGRESSIVE' : 'RETREATING';
                } else if (this.ability === 'Clone' || this.ability === 'Summon') {
                    this.behaviorState = abilityReady ? 'FLANKING' : 'AGGRESSIVE';
                } else if (this.ability === 'Absorb') {
                    const wantsAbsorb = !this.hasAbsorbed && this.stolenAbilities.length < 3;
                    this.behaviorState = (wantsAbsorb && dist < 175) ? 'AGGRESSIVE'
                                       : wantsAbsorb ? 'FLANKING'
                                       : 'AGGRESSIVE';
                } else if (this.ability === 'BlackPanther') {
                    this.behaviorState = hpRatio > 0.6 && Math.random() > 0.4 ? 'AGGRESSIVE' : 'FLANKING';
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
                // Steer around obstacles that block the retreat path.
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
            if (this.ability === 'Berserk') activeSpeed *= 1 + ((this.maxHp - this.hp) / this.maxHp) * 0.2;
            if (this.ability === 'SpeedRush' || this.stolenAbilities.includes('SpeedRush')) activeSpeed += Math.min(this.rushStacks * 0.4, 3.0);

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

        if (this.abilityCooldown <= 0 && (state.gameState === 'FIGHTING' || state.gameState === 'CUSTOM_1V1')) {
            if (this.ability === 'Dash' && Math.abs(normalizeAngle(this.angle - Math.atan2(dy, dx))) < 0.3) {
                this.vx += Math.cos(this.angle) * 18;
                this.vy += Math.sin(this.angle) * 18;
                this.abilityCooldown = 1.7;
                emitter.emit('ability:used', { ball: this, ability: 'Dash', x: this.x, y: this.y });

            } else if (this.ability === 'Charge' && Math.abs(normalizeAngle(this.angle - Math.atan2(dy, dx))) < 0.3) {
                this.charging        = 1.0;
                this.abilityCooldown = 2.5;
                emitter.emit('ability:used', { ball: this, ability: 'Charge', x: this.x, y: this.y });

            } else if (this.ability === 'Grapple' && dist < 350) {
                this.grappling       = 1.0;
                this.abilityCooldown = 2.3;
                emitter.emit('ability:used', { ball: this, ability: 'Grapple', x: this.x, y: this.y });

            } else if (this.ability === 'Phase') {
                const angleToMe     = Math.atan2(this.y - enemy.y, this.x - enemy.x);
                const enemyAimDiff  = Math.abs(normalizeAngle(enemy.angle - angleToMe));
                const isMeleeThreat = dist < (this.r + enemy.r + 120) && enemyAimDiff < 0.8 && enemy.intangible <= 0;
                const isProjThreat  = state.projectiles.some(p => p.target === this && Math.hypot(p.x - this.x, p.y - this.y) < (this.r + 100));
                if (isMeleeThreat || isProjThreat) {
                    this.intangible      = 1.7;
                    this.abilityCooldown = 3.0;
                    emitter.emit('ability:used', { ball: this, ability: 'Phase', x: this.x, y: this.y });
                }

            } else if (this.ability === 'Pulse' && dist < (this.r + enemy.r + 120) && enemy.intangible <= 0) {
                this.abilityCooldown = 3.0;
                this.pulseVisual     = 0.5;
                enemy.takeDamage(12, this);
                enemy.vx += (dx / dist) * 14;
                enemy.vy += (dy / dist) * 14;
                emitter.emit('ability:used', { ball: this, ability: 'Pulse', x: this.x, y: this.y });

            } else if (this.ability === 'Teleport' && dist < 350) {
                const oldX = this.x, oldY = this.y;

                // Expire previous decoy before spawning a new one
                if (this.ninjaDecoy && this.ninjaDecoy.hp > 0) {
                    this.ninjaDecoy.hp = 0;
                }

                emitter.emit('fx:particles', { x: this.x, y: this.y, color: this.color, count: 20, speed: 2 });
                const tpDistance = enemy.r + this.r + 30;
                const targetX    = enemy.x - Math.cos(enemy.angle) * tpDistance;
                const targetY    = enemy.y - Math.sin(enemy.angle) * tpDistance;
                this.x           = Math.max(this.r, Math.min(width - this.r, targetX));
                this.y           = Math.max(this.r, Math.min(height - this.r, targetY));
                this.angle       = enemy.angle;
                this.abilityCooldown = 3.0;
                emitter.emit('ability:used', { ball: this, ability: 'Teleport', x: this.x, y: this.y });

                // Spawn decoy at old position — acts as bait for the opponent
                const decoyDef = {
                    name: this.name, color: this.color, ability: 'none',
                    hp: 1, maxHp: 1, damage: 0,
                    r: this.r, mass: this.mass, speed: 0,
                };
                const decoy = new Ball(decoyDef);
                decoy.x    = oldX;
                decoy.y    = oldY;
                decoy.angle = this.angle;
                decoy.team  = this.team;
                decoy.isDecoy = true;
                decoy.master  = this;
                decoy.decoyHitsRemaining = 1;
                decoy.decoyLifetime = 2;
                state.balls.push(decoy);
                this.ninjaDecoy = decoy;
                emitter.emit('fx:particles', { x: oldX, y: oldY, color: this.color, count: 12, speed: 1 });

            } else if (this.ability === 'Shield') {
                this.shield          = 35;
                this.abilityCooldown = 8.5;
                emitter.emit('ability:used', { ball: this, ability: 'Shield', x: this.x, y: this.y });

            } else if (this.ability === 'Missile') {
                const px = this.x + Math.cos(this.angle) * (this.r + 10);
                const py = this.y + Math.sin(this.angle) * (this.r + 10);
                state.projectiles.push(new Projectile(px, py, enemy, this, this.angle, true, 8, 10));
                this.abilityCooldown = 1.2;

            } else if (this.ability === 'Laser' && Math.abs(normalizeAngle(this.angle - laserLeadAngle)) < 0.15) {
                const px = this.x + Math.cos(this.angle) * (this.r + 10);
                const py = this.y + Math.sin(this.angle) * (this.r + 10);
                state.projectiles.push(new Projectile(px, py, enemy, this, this.angle, false, 18, 20));
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

            } else if (this.ability === 'Immunity') {
                this.immuneActive = true;
                this.abilityCooldown = 5.0;
                const self = this;
                setTimeout(() => { self.immuneActive = false; }, 1500);
                emitter.emit('fx:text', { text: 'IMMUNE!', x: this.x, y: this.y - this.r - 45, color: '#fbbf24' });
                emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#fbbf24', count: 20, speed: 3 });

            } else if (this.ability === 'Absorb' && !this.hasAbsorbed && dist < 175
                    && enemy.ability && this.stolenAbilities.length < 3) {
                const UNSTEALABLE = new Set(['Absorb']);
                const raw = enemy.def ? enemy.def.ability : enemy.ability;
                const toSteal = (raw && !UNSTEALABLE.has(raw)) ? raw : null;
                if (toSteal && !this.stolenAbilities.includes(toSteal)) {
                    this.stolenAbilities.push(toSteal);
                    this.stolenCooldowns.push(1.0);
                    this.def.stolenAbilities = [...this.stolenAbilities];
                }
                this.hasAbsorbed = true;
                this.abilityCooldown = 3.0;
                emitter.emit('fx:text', { text: 'ABSORBED!', x: this.x, y: this.y - this.r - 45, color: this.color });
                emitter.emit('fx:particles', { x: this.x, y: this.y, color: this.color, count: 20, speed: 4 });

            } else if (this.ability === 'Trail') {
                // Trail is always-on; abilityCooldown stays blocked to prevent repeated check
                this.abilityCooldown = 9999;

            } else if (this.ability === 'Boomerang' && !this.blade) {
                const angle = Math.atan2(dy, dx);
                const blade = new BoomerangBlade(
                    this.x + Math.cos(angle) * (this.r + 12),
                    this.y + Math.sin(angle) * (this.r + 12),
                    angle, this, enemy
                );
                this.blade = blade;
                state.boomerangs.push(blade);
                this.momentumArmor = 0.3;
                this.boomerangOut = true;
                // cooldown is set when blade returns

            } else if (this.ability === 'SpeedRush') {
                // Passive — no active trigger; keep cooldown reset so we don't spam
                this.abilityCooldown = 9999;

            } else if (this.ability === 'Portal'
                       && dist > 250
                       && !state.portals.some(p => p.source === this && p.active)) {
                // Portal A: at Jimbo's own position — he steps through it immediately
                const ax = this.x;
                const ay = this.y;
                // Portal B: behind the enemy — same direction as Jimbo→enemy, past the enemy
                const toEnemy = Math.atan2(dy, dx);
                const bx = Math.max(60, Math.min(width - 60,
                    enemy.x + Math.cos(toEnemy) * (enemy.r + 55)));
                const by = Math.max(60, Math.min(height - 60,
                    enemy.y + Math.sin(toEnemy) * (enemy.r + 55)));

                state.portals.push(new PortalPair(ax, ay, bx, by, this));

                this.abilityCooldown = 5.5;
                emitter.emit('fx:particles', { x: ax, y: ay, color: this.color, count: 20, speed: 3 });
                emitter.emit('fx:particles', { x: bx, y: by, color: this.color, count: 20, speed: 3 });

            } else if (this.ability === 'Clone' && !this.hasClone) {
                const cloneDef = {
                    ...this.def,
                    hp:     Math.floor(this.maxHp),
                    maxHp:  Math.floor(this.maxHp),
                    damage: Math.floor(this.baseDamage),
                    name:   this.name + ' (Clone)',
                    ability: 'Berserk',  // clones never re-clone
                };
                const clone = new Ball(cloneDef);
                // Spawn on the opposite flank
                const spawnAngle = Math.atan2(dy, dx) + Math.PI / 2;
                clone.x = Math.max(clone.r, Math.min(width - clone.r,
                    this.x + Math.cos(spawnAngle) * (this.r * 2 + 40)));
                clone.y = Math.max(clone.r, Math.min(height - clone.r,
                    this.y + Math.sin(spawnAngle) * (this.r * 2 + 40)));
                clone.team = this.team;
                clone.isClone = true;
                clone.master = this;
                clone.behaviorState = 'FLANKING';
                clone.flankDir = -this.flankDir;
                state.balls.push(clone);
                this.hasClone = true;
                this.abilityCooldown = 9999;
                emitter.emit('fx:text', { text: 'CLONE!', x: this.x, y: this.y - this.r - 45, color: this.color });
                emitter.emit('fx:particles', { x: clone.x, y: clone.y, color: this.color, count: 20, speed: 3 });

            } else if (this.ability === 'Summon') {
                const minionCount = state.balls.filter(b => b.isMinion && b.master === this && b.hp > 0).length;
                if (minionCount < 3) {
                    const mDef = {
                        ...this.def,
                        hp:      Math.max(1, Math.floor(this.maxHp * 0.18)),
                        maxHp:   Math.max(1, Math.floor(this.maxHp * 0.18)),
                        damage:  Math.max(1, Math.floor(this.baseDamage * 0.18)),
                        r: 28, mass: 0.4, speed: 4.5, name: 'Minion',
                        ability: 'Berserk',  // minions never summon more minions
                    };
                    const minion = new Ball(mDef);
                    const spawnAngle = Math.random() * Math.PI * 2;
                    minion.x = Math.max(minion.r, Math.min(width - minion.r,
                        this.x + Math.cos(spawnAngle) * (this.r + 50)));
                    minion.y = Math.max(minion.r, Math.min(height - minion.r,
                        this.y + Math.sin(spawnAngle) * (this.r + 50)));
                    minion.team = this.team;
                    minion.isMinion = true;
                    minion.master = this;
                    minion.behaviorState = 'AGGRESSIVE';
                    state.balls.push(minion);
                    emitter.emit('fx:particles', { x: minion.x, y: minion.y, color: this.color, count: 12, speed: 2 });
                }
                this.abilityCooldown = 7.0;

            } else if (this.ability === 'BlackPanther') {
                // Speed burst when flanking close to enemy
                if (dist < this.r + enemy.r + 80) {
                    this.vx += Math.cos(this.angle + Math.PI / 2 * this.flankDir) * 12;
                    this.vy += Math.sin(this.angle + Math.PI / 2 * this.flankDir) * 12;
                    this.abilityCooldown = 1.4;
                    emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#6b21a8', count: 8, speed: 4 });
                }
            }
        }

        // Dirty Dave: fire each stolen ability on its own independent cooldown
        if (this.stolenAbilities.length > 0 &&
                (state.gameState === 'FIGHTING' || state.gameState === 'CUSTOM_1V1')) {
            for (let _i = 0; _i < this.stolenAbilities.length; _i++) {
                if (this.stolenCooldowns[_i] > 0) continue;
                const _sa = this.stolenAbilities[_i];
                if (_sa === 'Dash' && Math.abs(normalizeAngle(this.angle - Math.atan2(dy, dx))) < 0.3) {
                    this.vx += Math.cos(this.angle) * 18;
                    this.vy += Math.sin(this.angle) * 18;
                    this.stolenCooldowns[_i] = 1.7;
                } else if (_sa === 'Charge' && Math.abs(normalizeAngle(this.angle - Math.atan2(dy, dx))) < 0.3) {
                    this.charging = 1.0;
                    this.stolenCooldowns[_i] = 2.5;
                } else if (_sa === 'Grapple' && dist < 350) {
                    this.grappling = 1.0;
                    this.stolenCooldowns[_i] = 2.3;
                } else if (_sa === 'Phase' && dist < this.r + enemy.r + 120) {
                    this.intangible = 1.7;
                    this.stolenCooldowns[_i] = 3.0;
                } else if (_sa === 'Pulse' && dist < this.r + enemy.r + 120 && enemy.intangible <= 0) {
                    this.pulseVisual = 0.5;
                    enemy.takeDamage(12, this);
                    enemy.vx += (dx / dist) * 14;
                    enemy.vy += (dy / dist) * 14;
                    this.stolenCooldowns[_i] = 3.0;
                } else if (_sa === 'Teleport' && dist < 350) {
                    emitter.emit('fx:particles', { x: this.x, y: this.y, color: this.color, count: 20, speed: 2 });
                    const tpDistance = enemy.r + this.r + 30;
                    const targetX = enemy.x - Math.cos(enemy.angle) * tpDistance;
                    const targetY = enemy.y - Math.sin(enemy.angle) * tpDistance;
                    this.x = Math.max(this.r, Math.min(width - this.r, targetX));
                    this.y = Math.max(this.r, Math.min(height - this.r, targetY));
                    this.angle = enemy.angle;
                    this.stolenCooldowns[_i] = 3.0;
                } else if (_sa === 'Shield') {
                    this.shield = 35;
                    this.stolenCooldowns[_i] = 8.5;
                } else if (_sa === 'Missile') {
                    const px = this.x + Math.cos(this.angle) * (this.r + 10);
                    const py = this.y + Math.sin(this.angle) * (this.r + 10);
                    state.projectiles.push(new Projectile(px, py, enemy, this, this.angle, true, 8, 10));
                    this.stolenCooldowns[_i] = 1.2;
                } else if (_sa === 'Laser') {
                    const px = this.x + Math.cos(this.angle) * (this.r + 10);
                    const py = this.y + Math.sin(this.angle) * (this.r + 10);
                    state.projectiles.push(new Projectile(px, py, enemy, this, this.angle, false, 18, 20));
                    this.stolenCooldowns[_i] = 1.33;
                    emitter.emit('fx:particles', { x: px, y: py, color: this.color, count: 10, speed: 2 });
                } else if (_sa === 'Minion') {
                    const px = this.x + Math.cos(this.angle) * (this.r + 10);
                    const py = this.y + Math.sin(this.angle) * (this.r + 10);
                    const spread = (Math.random() - 0.5) * 1.5;
                    const p = new Projectile(px, py, enemy, this, this.angle + spread, true, 4.5, 2);
                    p.isSwarm = true; p.r = 5.25; p.life = 5.0;
                    state.projectiles.push(p);
                    this.stolenCooldowns[_i] = 0.25;
                } else if (_sa === 'Trap') {
                    state.hazards.push(new Hazard(this.x, this.y, this));
                    this.stolenCooldowns[_i] = 1.67;
                } else if (_sa === 'Immunity') {
                    this.immuneActive = true;
                    this.stolenCooldowns[_i] = 5.0;
                    const _self = this;
                    setTimeout(() => { _self.immuneActive = false; }, 1500);
                    emitter.emit('fx:text', { text: 'IMMUNE!', x: this.x, y: this.y - this.r - 45, color: '#fbbf24' });
                    emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#fbbf24', count: 20, speed: 3 });
                } else if (_sa === 'BlackPanther' && dist < this.r + enemy.r + 80) {
                    this.vx += Math.cos(this.angle + Math.PI / 2 * this.flankDir) * 12;
                    this.vy += Math.sin(this.angle + Math.PI / 2 * this.flankDir) * 12;
                    this.stolenCooldowns[_i] = 1.4;
                    emitter.emit('fx:particles', { x: this.x, y: this.y, color: '#6b21a8', count: 8, speed: 4 });
                } else if (_sa === 'SpeedRush') {
                    // Passive — stacks accumulate via takeDamage; just block this slot permanently
                    this.stolenCooldowns[_i] = 9999;
                } else if (_sa === 'Trail') {
                    // Passive — trail spawning is handled in the update loop above; block slot
                    this.stolenCooldowns[_i] = 9999;
                } else if (_sa === 'Boomerang' && !this.blade) {
                    const _bAngle = Math.atan2(dy, dx);
                    const blade = new BoomerangBlade(
                        this.x + Math.cos(_bAngle) * (this.r + 12),
                        this.y + Math.sin(_bAngle) * (this.r + 12),
                        _bAngle, this, enemy
                    );
                    blade.stolenSlot = _i;
                    this.blade = blade;
                    state.boomerangs.push(blade);
                    this.momentumArmor = 0.3;
                    this.boomerangOut = true;
                    // cooldown is set by _catch() when blade returns
                } else if (_sa === 'Portal'
                        && dist > 250
                        && !state.portals.some(p => p.source === this && p.active)) {
                    const _toEnemy = Math.atan2(dy, dx);
                    const _ax = this.x, _ay = this.y;
                    const _bx = Math.max(60, Math.min(width - 60, enemy.x + Math.cos(_toEnemy) * (enemy.r + 55)));
                    const _by = Math.max(60, Math.min(height - 60, enemy.y + Math.sin(_toEnemy) * (enemy.r + 55)));
                    state.portals.push(new PortalPair(_ax, _ay, _bx, _by, this));
                    this.stolenCooldowns[_i] = 5.5;
                    emitter.emit('fx:particles', { x: _ax, y: _ay, color: this.color, count: 20, speed: 3 });
                    emitter.emit('fx:particles', { x: _bx, y: _by, color: this.color, count: 20, speed: 3 });
                } else if (_sa === 'Summon') {
                    const _minionCount = state.balls.filter(b => b.isMinion && b.master === this && b.hp > 0).length;
                    if (_minionCount < 3) {
                        const mDef = {
                            ...this.def,
                            hp: Math.max(1, Math.floor(this.maxHp * 0.18)),
                            maxHp: Math.max(1, Math.floor(this.maxHp * 0.18)),
                            damage: Math.max(1, Math.floor(this.baseDamage * 0.18)),
                            r: 28, mass: 0.4, speed: 4.5, name: 'Minion',
                            ability: 'Berserk',
                            stolenAbilities: [],
                        };
                        const minion = new Ball(mDef);
                        const _spawnAngle = Math.random() * Math.PI * 2;
                        minion.x = Math.max(minion.r, Math.min(width - minion.r, this.x + Math.cos(_spawnAngle) * (this.r + 50)));
                        minion.y = Math.max(minion.r, Math.min(height - minion.r, this.y + Math.sin(_spawnAngle) * (this.r + 50)));
                        minion.team = this.team;
                        minion.isMinion = true;
                        minion.master = this;
                        minion.behaviorState = 'AGGRESSIVE';
                        state.balls.push(minion);
                        emitter.emit('fx:particles', { x: minion.x, y: minion.y, color: this.color, count: 12, speed: 2 });
                    }
                    this.stolenCooldowns[_i] = 7.0;
                } else if (_sa === 'Clone' && !this.hasClone) {
                    const cloneDef = {
                        ...this.def,
                        hp: Math.floor(this.maxHp),
                        maxHp: Math.floor(this.maxHp),
                        damage: Math.floor(this.baseDamage),
                        name: this.name + ' (Clone)',
                        ability: 'Berserk',
                        stolenAbilities: [],
                    };
                    const clone = new Ball(cloneDef);
                    const spawnAngle = Math.atan2(dy, dx) + Math.PI / 2;
                    clone.x = Math.max(clone.r, Math.min(width - clone.r, this.x + Math.cos(spawnAngle) * (this.r * 2 + 40)));
                    clone.y = Math.max(clone.r, Math.min(height - clone.r, this.y + Math.sin(spawnAngle) * (this.r * 2 + 40)));
                    clone.team = this.team;
                    clone.isClone = true;
                    clone.master = this;
                    clone.behaviorState = 'FLANKING';
                    clone.flankDir = -this.flankDir;
                    state.balls.push(clone);
                    this.hasClone = true;
                    this.stolenCooldowns[_i] = 9999;
                    emitter.emit('fx:text', { text: 'CLONE!', x: this.x, y: this.y - this.r - 45, color: this.color });
                    emitter.emit('fx:particles', { x: clone.x, y: clone.y, color: this.color, count: 20, speed: 3 });
                }
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

export class TrailSegment {
    constructor(x, y, source) {
        this.x = x; this.y = y; this.source = source;
        this.r = 16;
        this.active = true;
        this.life = 6.0;
        this.maxLife = 6.0;
        this.tickTimer = 0;
        this.damage = 8;
    }
    update(enemy, dt) {
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
    constructor(ax, ay, bx, by, source) {
        this.ax = ax; this.ay = ay;  // portal A position
        this.bx = bx; this.by = by;  // portal B position
        this.r = 45;                  // entrance radius
        this.source = source;
        this.active = true;
        this.life = 8.0;
        this.recentlyTeleported = new Map(); // ball -> remaining cooldown (s)
    }

    update(balls, dt) {
        this.life -= dt;
        if (this.life <= 0) { this.active = false; return; }

        // Decrement per-ball re-entry cooldowns
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
                // Enter A → exit B
                ball.x = this.bx;
                ball.y = this.by;
                // Preserve velocity direction, give a small forward nudge
                const speed = Math.hypot(ball.vx, ball.vy);
                if (speed > 0.1) {
                    ball.vx = (ball.vx / speed) * Math.max(speed, 4);
                    ball.vy = (ball.vy / speed) * Math.max(speed, 4);
                }
                this.recentlyTeleported.set(ball, 0.75);
                emitter.emit('fx:particles', { x: this.bx, y: this.by, color: this.source.color, count: 20, speed: 4 });
                emitter.emit('fx:particles', { x: this.ax, y: this.ay, color: this.source.color, count: 8, speed: 2 });
            } else if (distB < this.r + ball.r * 0.5) {
                // Enter B → exit A
                ball.x = this.ax;
                ball.y = this.ay;
                const speed = Math.hypot(ball.vx, ball.vy);
                if (speed > 0.1) {
                    ball.vx = (ball.vx / speed) * Math.max(speed, 4);
                    ball.vy = (ball.vy / speed) * Math.max(speed, 4);
                }
                this.recentlyTeleported.set(ball, 0.75);
                emitter.emit('fx:particles', { x: this.ax, y: this.ay, color: this.source.color, count: 20, speed: 4 });
                emitter.emit('fx:particles', { x: this.bx, y: this.by, color: this.source.color, count: 8, speed: 2 });
            }
        }
    }
}

export class BoomerangBlade {
    constructor(x, y, angle, source, target) {
        this.x = x; this.y = y;
        this.source = source;
        this.target = target;
        this.speed = 11;
        this.r = 22;
        this.damage = source.baseDamage * 1.35;
        this.color = source.color;
        this.active = true;
        this.phase = 'OUTGOING';
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.life = 4.0;
        // Per-pass hit cooldown — allows one hit outgoing and one hit returning
        // without the blade deactivating between passes
        this.hitCooldown = 0;
        this.maxDistFromSource = 0;
    }
    update(dt) {
        this.life -= dt;
        if (this.life <= 0) { this._catch(); return; }

        if (this.hitCooldown > 0) this.hitCooldown -= dt;

        const distFromSource = Math.hypot(this.x - this.source.x, this.y - this.source.y);

        if (this.phase === 'OUTGOING') {
            // Perpendicular curve for boomerang arc feel
            const perpX = -this.vy / this.speed;
            const perpY =  this.vx / this.speed;
            this.vx += perpX * 0.3 * dt * 60;
            this.vy += perpY * 0.3 * dt * 60;
            const v = Math.hypot(this.vx, this.vy);
            if (v > this.speed) { this.vx = (this.vx / v) * this.speed; this.vy = (this.vy / v) * this.speed; }

            // Track furthest point; switch to returning once blade starts coming back
            // or reaches max range (~380px)
            this.maxDistFromSource = Math.max(this.maxDistFromSource, distFromSource);
            if (distFromSource > 380 || (this.maxDistFromSource > 80 && distFromSource < this.maxDistFromSource * 0.75)) {
                this.phase = 'RETURNING';
            }

            // Outgoing hit — one hit allowed per pass (cooldown resets between passes)
            if (this.hitCooldown <= 0 && this.target.hp > 0) {
                const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
                if (d < this.target.r + this.r && this.target.intangible <= 0 && !this.target.immuneActive) {
                    this.target.takeDamage(this.damage, this.source);
                    this.hitCooldown = 0.5;
                    emitter.emit('fx:particles', { x: this.x, y: this.y, color: this.color, count: 14, speed: 4 });
                }
            }
        } else {
            // Home back to source
            const dx = this.source.x - this.x;
            const dy = this.source.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist < this.source.r + this.r) { this._catch(); return; }
            this.vx += (dx / dist) * 2.2 * dt * 60;
            this.vy += (dy / dist) * 2.2 * dt * 60;
            const v = Math.hypot(this.vx, this.vy);
            if (v > this.speed * 1.4) { this.vx = (this.vx / v) * this.speed * 1.4; this.vy = (this.vy / v) * this.speed * 1.4; }

            // Return hit — full damage, independent of outgoing hit
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
    _catch() {
        this.active = false;
        this.source.blade = null;
        this.source.boomerangOut = false;
        this.source.momentumArmor = 0;
        if (this.stolenSlot !== undefined) {
            this.source.stolenCooldowns[this.stolenSlot] = 2.8;
        } else {
            this.source.abilityCooldown = 2.8;
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
