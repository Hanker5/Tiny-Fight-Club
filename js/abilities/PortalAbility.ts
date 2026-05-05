import { Ability } from './Ability';
import type { Ball } from '../entities';
import { PortalPair } from '../entities';
import type { ArenaSize, BehaviorMode } from '../types';
import { state } from '../state';
import { emitter } from '../events';
import { normalizeAngle } from '../utils';

export class PortalAbility extends Ability {
    readonly name = 'Portal';
    readonly cooldownDuration = 5.0;

    private getActivePortal(ball: Ball): PortalPair | null {
        return state.portals.find(p => p.source === ball && p.active) ?? null;
    }

    private shouldEscape(ball: Ball, enemy: Ball, portal: PortalPair): boolean {
        const enemyDistToA = Math.hypot(enemy.x - portal.ax, enemy.y - portal.ay);
        const enemyBlockingEscape = enemyDistToA < portal.r * 2.5 + enemy.r;
        return ball.hp < ball.maxHp * 0.35 && !enemyBlockingEscape && portal.life > 1.5;
    }

    // True when Jimbo is closer to Portal B (fight zone) than Portal A (safe zone).
    private nearPortalB(ball: Ball, portal: PortalPair): boolean {
        return Math.hypot(ball.x - portal.bx, ball.y - portal.by) <
               Math.hypot(ball.x - portal.ax, ball.y - portal.ay);
    }

    tick(ball: Ball, enemy: Ball, _arena: ArenaSize, _dt: number): void {
        const portal = this.getActivePortal(ball);
        if (!portal || !portal.recentlyTeleported.has(ball)) return;

        // getBehaviorHint is only polled every 0.5–1.17 s, so the ball can be stuck in
        // the wrong mode for a full second after teleporting. Force an immediate correction.
        if (this.nearPortalB(ball, portal) && !this.shouldEscape(ball, enemy, portal)) {
            // Just arrived at Portal B for an attack — switch to AGGRESSIVE now so the
            // Ball AI doesn't add +π to our steering and fight Jimbo's approach momentum.
            if (ball.behaviorState !== 'AGGRESSIVE') {
                ball.behaviorState = 'AGGRESSIVE';
                ball.behaviorTimer = 0.5 + Math.random() * 0.67;
            }
        } else if (!this.nearPortalB(ball, portal) && this.shouldEscape(ball, enemy, portal)) {
            // Just escaped to Portal A — switch to RETREATING now.
            if (ball.behaviorState !== 'RETREATING') {
                ball.behaviorState = 'RETREATING';
                ball.behaviorTimer = 0.5 + Math.random() * 0.67;
            }
        }
    }

    getBehaviorHint(ball: Ball, enemy: Ball): BehaviorMode | null {
        const portal = this.getActivePortal(ball);
        if (!portal) return 'RETREATING';

        if (this.shouldEscape(ball, enemy, portal)) {
            // Near Portal B: charge AGGRESSIVELY into it to escape (RETREATING would invert
            // getTargetAngle and steer Jimbo away from the portal instead of into it).
            // Near Portal A: retreat normally — RETREATING mode will invert defaultAngle
            // away from the enemy on its own.
            return this.nearPortalB(ball, portal) ? 'AGGRESSIVE' : 'RETREATING';
        }

        return 'AGGRESSIVE';
    }

    getTargetAngle(ball: Ball, enemy: Ball, _dist: number, defaultAngle: number): number {
        const portal = this.getActivePortal(ball);
        if (!portal) return defaultAngle;

        // Escape: charge directly into Portal B so Jimbo teleports back to the safe Portal A.
        // Only override when near Portal B; when already at Portal A let RETREATING handle it.
        if (this.shouldEscape(ball, enemy, portal) && this.nearPortalB(ball, portal)) {
            return Math.atan2(portal.by - ball.y, portal.bx - ball.x);
        }

        // Attack / post-escape retreat: let the active behavior mode act on the default angle.
        // AGGRESSIVE will steer toward enemy; RETREATING will invert and flee.
        return defaultAngle;
    }

    // Scores a candidate Portal B position. Higher is better.
    private scoreCandidate(
        x: number, y: number,
        ball: Ball, enemy: Ball, arena: ArenaSize
    ): number {
        let score = 0;

        // Hard veto for pillar overlap
        for (const obs of state.obstacles as Array<{ x: number; y: number; r: number }>) {
            if (Math.hypot(x - obs.x, y - obs.y) < obs.r + ball.r + 20) score -= 200;
        }

        // Penalty for landing in an active hazard
        for (const hz of state.hazards as Array<{ x: number; y: number; r: number; active: boolean }>) {
            if (hz.active && Math.hypot(x - hz.x, y - hz.y) < hz.r + ball.r) score -= 80;
        }

        // Primary: velocity alignment — does Jimbo's preserved momentum carry him toward the enemy
        // the moment he exits the portal? dot(Jimbo velocity dir, dir from Portal B toward enemy).
        // +1 = perfect backstab momentum, −1 = arriving moving away.
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > 0.5) {
            const vx = ball.vx / speed, vy = ball.vy / speed;
            const dToEnemy = Math.hypot(enemy.x - x, enemy.y - y);
            if (dToEnemy > 0) {
                score += (vx * (enemy.x - x) / dToEnemy + vy * (enemy.y - y) / dToEnemy) * 70;
            }
        }

        // Secondary: is Portal B behind the enemy relative to where they're moving?
        const enemySpeed = Math.hypot(enemy.vx, enemy.vy);
        if (enemySpeed > 0.5) {
            const behindAngle = Math.atan2(enemy.vy, enemy.vx) + Math.PI;
            const diff = Math.abs(normalizeAngle(Math.atan2(y - enemy.y, x - enemy.x) - behindAngle));
            score += (1 - diff / Math.PI) * 40;
        }

        // Light wall clearance so Jimbo doesn't teleport into corners
        const inset = (state.shrinkInset as number) ?? 0;
        const margin = Math.min(x - inset, arena.width - inset - x, y - inset, arena.height - inset - y);
        score += margin * 0.01;

        return score;
    }

    tryTrigger(ball: Ball, enemy: Ball, arena: ArenaSize, _dt: number): number | null {
        const dx = enemy.x - ball.x, dy = enemy.y - ball.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 250 || state.portals.some(p => p.source === ball && p.active)) return null;

        const ax = ball.x, ay = ball.y;
        const toEnemy = Math.atan2(dy, dx);
        const OFFSET = enemy.r + 60;
        const WALL   = 60;
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

        // Five angular candidates fanning around the enemy
        const candidates = [
            toEnemy,
            toEnemy + Math.PI / 4,
            toEnemy - Math.PI / 4,
            toEnemy + Math.PI / 2,
            toEnemy - Math.PI / 2,
        ].map(angle => ({
            x: clamp(enemy.x + Math.cos(angle) * OFFSET, WALL, arena.width  - WALL),
            y: clamp(enemy.y + Math.sin(angle) * OFFSET, WALL, arena.height - WALL),
        }));

        // Velocity-aligned backstab: Portal B placed so Jimbo's preserved momentum
        // points at the enemy the instant he exits. Formula: enemy − normalize(v) * OFFSET,
        // because arriving there moving in direction v means the enemy is at −v * OFFSET away.
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > 0.5) {
            candidates.push({
                x: clamp(enemy.x - (ball.vx / speed) * OFFSET, WALL, arena.width  - WALL),
                y: clamp(enemy.y - (ball.vy / speed) * OFFSET, WALL, arena.height - WALL),
            });
        }

        // Enemy-velocity backstab: Portal B behind where the enemy is heading
        const enemySpeed = Math.hypot(enemy.vx, enemy.vy);
        if (enemySpeed > 0.5) {
            const behindAngle = Math.atan2(enemy.vy, enemy.vx) + Math.PI;
            candidates.push({
                x: clamp(enemy.x + Math.cos(behindAngle) * OFFSET, WALL, arena.width  - WALL),
                y: clamp(enemy.y + Math.sin(behindAngle) * OFFSET, WALL, arena.height - WALL),
            });
        }

        let bx = candidates[0].x, by = candidates[0].y, bestScore = -Infinity;
        for (const c of candidates) {
            const s = this.scoreCandidate(c.x, c.y, ball, enemy, arena);
            if (s > bestScore) { bestScore = s; bx = c.x; by = c.y; }
        }

        state.portals.push(new PortalPair(ax, ay, bx, by, ball));
        emitter.emit('ability:used', { ball, ability: 'Portal', x: ax, y: ay });
        emitter.emit('fx:particles', { x: ax, y: ay, color: ball.color, count: 20, speed: 3 });
        emitter.emit('fx:particles', { x: bx, y: by, color: ball.color, count: 20, speed: 3 });
        return this.cooldownDuration;
    }
}
