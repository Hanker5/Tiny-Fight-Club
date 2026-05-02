import { normalizeAngle } from './utils';
import { emitter } from './events';

function hasAbility(ball, name) {
    return ball.abilityName === name || (ball.stolenAbilities && ball.stolenAbilities.some(a => a.name === name));
}

export function resolveCollision(b1, b2) {
    if (b1.intangible > 0 || b2.intangible > 0) return;

    const dx      = b2.x - b1.x;
    const dy      = b2.y - b1.y;
    const dist    = Math.hypot(dx, dy);
    const minDist = b1.r + b2.r;

    if (dist < minDist) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        const totalMass = b1.mass + b2.mass;
        b1.x -= nx * overlap * (b2.mass / totalMass);
        b1.y -= ny * overlap * (b2.mass / totalMass);
        b2.x += nx * overlap * (b1.mass / totalMass);
        b2.y += ny * overlap * (b1.mass / totalMass);

        const rvx            = b2.vx - b1.vx;
        const rvy            = b2.vy - b1.vy;
        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal < 0) {
            const e = 0.8;
            let j   = -(1 + e) * velAlongNormal / (1 / b1.mass + 1 / b2.mass);

            b1.vx -= (nx * j) / b1.mass;
            b1.vy -= (ny * j) / b1.mass;
            b2.vx += (nx * j) / b2.mass;
            b2.vy += (ny * j) / b2.mass;

            const diff1 = Math.abs(normalizeAngle(b1.angle - Math.atan2(ny, nx)));
            const diff2 = Math.abs(normalizeAngle(b2.angle - Math.atan2(-ny, -nx)));

            const b1WeaponHits = b1.abilityName === 'RapidSpin' ? true : diff1 < 1.05;
            const b2WeaponHits = b2.abilityName === 'RapidSpin' ? true : diff2 < 1.05;

            if (b1.hitCooldown <= 0 && b2.hitCooldown <= 0) {
                const impactForce = Math.abs(j);

                let dmg1 = b2.baseDamage + impactForce * 0.4;
                let dmg2 = b1.baseDamage + impactForce * 0.4;

                if (b1.abilityName === 'RapidSpin') {
                    const b1Speed = Math.hypot(b1.vx, b1.vy);
                    const headOn = b1Speed > 0 ? Math.abs((b1.vx * nx + b1.vy * ny) / b1Speed) : 0;
                    dmg2 *= 1 + headOn * 1.2;
                }
                if (b2.abilityName === 'RapidSpin') {
                    const b2Speed = Math.hypot(b2.vx, b2.vy);
                    const headOn = b2Speed > 0 ? Math.abs((b2.vx * -nx + b2.vy * -ny) / b2Speed) : 0;
                    dmg1 *= 1 + headOn * 1.2;
                }

                if (hasAbility(b2, 'Berserk')) dmg1 *= 1 + ((b2.maxHp - b2.hp) / b2.maxHp) * 0.6;
                if (hasAbility(b1, 'Berserk')) dmg2 *= 1 + ((b1.maxHp - b1.hp) / b1.maxHp) * 0.6;

                let validHitOccurred = false;

                if (b1WeaponHits) {
                    if (b2.isDecoy) {
                        b2.decoyHitsRemaining--;
                        if (b2.decoyHitsRemaining <= 0) {
                            b2.hp = 0;
                            emitter.emit('fx:particles', { x: b2.x, y: b2.y, color: b2.color, count: 20, speed: 3 });
                            emitter.emit('fx:text', { text: 'DECOY!', x: b2.x, y: b2.y - b2.r - 45, color: b2.color });
                        }
                    } else {
                        b2.takeDamage(dmg2, b1);
                        if (hasAbility(b1, 'Poison')) {
                            b2.poisoned = 2.8;
                            emitter.emit('ball:poisoned', { ball: b2 });
                        }
                    }
                    emitter.emit('fx:particles', { x: b1.x + nx * b1.r, y: b1.y + ny * b1.r, color: '#ef4444', count: 8, speed: 4 });
                    validHitOccurred = true;
                }

                // Decoys are static dummies â€” they don't deal damage back
                if (b2WeaponHits && !b2.isDecoy) {
                    if (b1.isDecoy) {
                        b1.decoyHitsRemaining--;
                        if (b1.decoyHitsRemaining <= 0) {
                            b1.hp = 0;
                            emitter.emit('fx:particles', { x: b1.x, y: b1.y, color: b1.color, count: 20, speed: 3 });
                            emitter.emit('fx:text', { text: 'DECOY!', x: b1.x, y: b1.y - b1.r - 45, color: b1.color });
                        }
                    } else {
                        b1.takeDamage(dmg1, b2);
                        if (hasAbility(b2, 'Poison')) {
                            b1.poisoned = 2.8;
                            emitter.emit('ball:poisoned', { ball: b1 });
                        }
                    }
                    emitter.emit('fx:particles', { x: b1.x + nx * b1.r, y: b1.y + ny * b1.r, color: '#ef4444', count: 8, speed: 4 });
                    validHitOccurred = true;
                }

                if (!validHitOccurred) {
                    emitter.emit('fx:particles', { x: b1.x + nx * b1.r, y: b1.y + ny * b1.r, color: '#94a3b8', count: 4, speed: 2 });
                }

                if (validHitOccurred) {
                    b1.hitCooldown = 0.25; // was 15 frames
                    b2.hitCooldown = 0.25;
                    b1.vx -= nx * 4;
                    b1.vy -= ny * 4;
                    b2.vx += nx * 4;
                    b2.vy += ny * 4;
                }
            }
        }
    }
}

export function resolveObstacleCollision(ball, obs) {
    if (ball.intangible > 0) return;
    const dx   = ball.x - obs.x;
    const dy   = ball.y - obs.y;
    const dist = Math.hypot(dx, dy);
    const min  = ball.r + obs.r;
    if (dist < min && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        ball.x += nx * (min - dist);
        ball.y += ny * (min - dist);
        const velN = ball.vx * nx + ball.vy * ny;
        if (velN < 0) {
            ball.vx -= 2 * velN * nx;
            ball.vy -= 2 * velN * ny;
            ball.vx += -ny * (Math.random() - 0.5) * 2;
            ball.vy +=  nx * (Math.random() - 0.5) * 2;
        }
    }
}
