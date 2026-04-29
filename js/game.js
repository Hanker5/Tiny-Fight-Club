import { state } from './state.js';
import { baseBalls } from './data.js';
import { Ball } from './entities.js';
import { resolveCollision } from './systems.js';
import { createParticles, createConfetti } from './fx.js';
import { emitter } from './events.js';
import { normalizeAngle } from './utils.js';
import {
    drawBall, drawHazard, drawProjectile,
    drawParticle, drawFloatingText,
    drawGrappleLine, drawArenaBorder, drawConfetti
} from './renderer.js';
// ui.js: imported for side-effects (event subscriptions) + direct overlay/render calls
import { showOverlay, hideOverlay, renderBracket, renderRoster } from './ui.js';

// Record each match result to the backend — fire-and-forget, never throws.
emitter.on('match:end', async ({ winner, loser, round, duration }) => {
    try {
        await fetch('/api/record-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                winnerName:    winner.name,
                loserName:     loser.name,
                winnerAbility: winner.ability,
                loserAbility:  loser.ability,
                round,
                duration
            })
        });
    } catch { /* network failure — game continues unaffected */ }
});

// Canvas and rendering context live here — not in shared game state.
let canvas, ctx;

const VIRTUAL_W = 1056;
const VIRTUAL_H = 1080;

function getRoundLabel(roundIndex, roundCount) {
    const entrants = 2 ** (roundCount - roundIndex);
    if (entrants === 2) return 'Final';
    if (entrants === 4) return 'Semifinal';
    if (entrants === 8) return 'Quarterfinal';
    return `Round of ${entrants}`;
}

function nextPowerOfTwo(n) {
    let value = 1;
    while (value < n) value *= 2;
    return value;
}

function buildBracket(roster) {
    const slots = nextPowerOfTwo(roster.length);
    const rounds = [];
    const firstRound = [];

    for (let i = 0; i < slots; i += 2) {
        firstRound.push({ p1: roster[i] ?? null, p2: roster[i + 1] ?? null, winner: null });
    }
    rounds.push(firstRound);

    let matches = firstRound.length;
    while (matches > 1) {
        matches /= 2;
        rounds.push(Array.from({ length: matches }, () => ({ p1: null, p2: null, winner: null })));
    }

    return rounds;
}

function assignWinner(roundIndex, matchIndex, winnerDef) {
    const match = state.bracket[roundIndex][matchIndex];
    if (match.winner === winnerDef) return;

    match.winner = winnerDef;
    if (roundIndex >= state.bracket.length - 1) {
        state.tourneyWinner = winnerDef;
        return;
    }

    const nextMatch = state.bracket[roundIndex + 1][Math.floor(matchIndex / 2)];
    if (matchIndex % 2 === 0) nextMatch.p1 = winnerDef;
    else nextMatch.p2 = winnerDef;
}

function resolveByes() {
    let changed = true;
    while (changed) {
        changed = false;
        for (let r = 0; r < state.bracket.length; r++) {
            for (let m = 0; m < state.bracket[r].length; m++) {
                const match = state.bracket[r][m];
                if (match.winner) continue;
                if (match.p1 && !match.p2) {
                    assignWinner(r, m, match.p1);
                    changed = true;
                } else if (match.p2 && !match.p1) {
                    assignWinner(r, m, match.p2);
                    changed = true;
                }
            }
        }
    }
}

function selectNextPlayableMatch() {
    for (let r = 0; r < state.bracket.length; r++) {
        for (let m = 0; m < state.bracket[r].length; m++) {
            const match = state.bracket[r][m];
            if (!match.winner && match.p1 && match.p2) {
                state.currentRound = r;
                state.currentMatch = m;
                return match;
            }
        }
    }
    return null;
}

function resizeCanvas() {
    const container = document.getElementById('arena-container');
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = container.clientWidth  * dpr;
    canvas.height = container.clientHeight * dpr;
}

function getViewport() {
    const scale   = Math.min(canvas.width / VIRTUAL_W, canvas.height / VIRTUAL_H);
    const offsetX = (canvas.width  - VIRTUAL_W * scale) / 2;
    const offsetY = (canvas.height - VIRTUAL_H * scale) / 2;
    return { scale, offsetX, offsetY };
}

function initTournament() {
    const roster = baseBalls.map(base => {
        const hpVar    = 0.9 + Math.random() * 0.2;
        const speedVar = 0.9 + Math.random() * 0.2;
        const dmgVar   = 0.9 + Math.random() * 0.2;
        return {
            ...base,
            hp:     Math.floor(base.hp    * hpVar),
            maxHp:  Math.floor(base.maxHp * hpVar),
            speed:  parseFloat((base.speed * speedVar).toFixed(1)),
            damage: Math.floor(base.damage * dmgVar)
        };
    }).sort(() => Math.random() - 0.5);

    state.bracket = buildBracket(roster);
    state.roundLabels = state.bracket.map((_, i) => getRoundLabel(i, state.bracket.length));

    state.currentRound  = 0;
    state.currentMatch  = 0;
    state.tourneyWinner = null;
    state.gameState     = 'BRACKET';

    resolveByes();
    selectNextPlayableMatch();

    renderBracket();
    renderRoster();
    showOverlay('Tiny Fight Club', `${baseBalls.length} unique balls compete. Only one will survive.`, 'Start Tournament', startNextMatch);
}

function startNextMatch() {
    if (state.autoStartTimer) clearTimeout(state.autoStartTimer);

    const match = state.bracket[state.currentRound][state.currentMatch];
    state.ball1 = new Ball(match.p1);
    state.ball2 = new Ball(match.p2);

    const margin = 120;
    const halfW  = VIRTUAL_W / 2;

    state.ball1.x     = margin + Math.random() * (halfW - margin * 2);
    state.ball1.y     = margin + Math.random() * (VIRTUAL_H - margin * 2);
    state.ball1.angle = Math.random() * Math.PI * 2;
    state.ball1.vx    = (Math.random() - 0.5) * 12;
    state.ball1.vy    = (Math.random() - 0.5) * 12;

    state.ball2.x     = halfW + margin + Math.random() * (halfW - margin * 2);
    state.ball2.y     = margin + Math.random() * (VIRTUAL_H - margin * 2);
    state.ball2.angle = Math.random() * Math.PI * 2;
    state.ball2.vx    = (Math.random() - 0.5) * 12;
    state.ball2.vy    = (Math.random() - 0.5) * 12;

    state.projectiles   = [];
    state.particles     = [];
    state.floatingTexts = [];
    state.hazards       = [];
    state.confetti      = [];
    state.gameState     = 'FIGHTING';
    state.matchStartTime = performance.now();

    hideOverlay();
    emitter.emit('match:start', {
        ball1: state.ball1,
        ball2: state.ball2,
        round: state.currentRound,
        matchIndex: state.currentMatch
    });
}

function endMatch(winnerDef, loserDef, duration) {
    const round      = state.currentRound;
    const matchIndex = state.currentMatch;
    assignWinner(round, matchIndex, winnerDef);
    resolveByes();
    const nextMatch = selectNextPlayableMatch();

    state.gameState = 'BRACKET';

    // Emit for subscribers (API recording, stats, etc.)
    emitter.emit('match:end', { winner: winnerDef, loser: loserDef, round, matchIndex, duration });

    if (state.tourneyWinner) {
        emitter.emit('tournament:end', { champion: state.tourneyWinner });
        showOverlay(`${state.tourneyWinner.name} Wins!`, 'The ultimate champion has been crowned.', 'Play Again', initTournament, state.tourneyWinner.color);
        return;
    }

    const match = nextMatch;
    showOverlay(
        `Next: ${state.roundLabels[state.currentRound]}`,
        `${match.p1.name} vs ${match.p2.name} (Auto-starting in 5s...)`,
        'Start Now',
        () => { if (state.autoStartTimer) clearTimeout(state.autoStartTimer); startNextMatch(); }
    );

    state.autoStartTimer = setTimeout(() => {
        if (state.gameState === 'BRACKET') startNextMatch();
    }, 5000);
}

// --- MAIN LOOP ---
// Delta-time loop: no FPS cap, dt in seconds capped at 50ms to prevent spiral.

let then;
let winAnimTime = 0;

function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);

    const dt = Math.min((timestamp - then) / 1000, 0.05);
    then = timestamp;

    // Keep backing store in sync with container + DPR
    const container = document.getElementById('arena-container');
    const dpr = window.devicePixelRatio || 1;
    const expectedW = container.clientWidth  * dpr;
    const expectedH = container.clientHeight * dpr;
    if (canvas.width !== expectedW || canvas.height !== expectedH) resizeCanvas();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { scale, offsetX, offsetY } = getViewport();

    if (state.gameState === 'FIGHTING') {
        // Update
        state.ball1.update(state.ball2, VIRTUAL_W, VIRTUAL_H, dt);
        state.ball2.update(state.ball1, VIRTUAL_W, VIRTUAL_H, dt);
        resolveCollision(state.ball1, state.ball2);

        state.projectiles.forEach(p => p.update(dt));
        state.particles.forEach(p => p.update(dt));
        state.floatingTexts.forEach(ft => ft.update(dt));
        state.hazards.forEach(h => h.update(h.source === state.ball1 ? state.ball2 : state.ball1, dt));

        state.projectiles   = state.projectiles.filter(p => p.active);
        state.particles     = state.particles.filter(p => p.life > 0);
        state.floatingTexts = state.floatingTexts.filter(ft => ft.life > 0);
        state.hazards       = state.hazards.filter(h => h.active);

        // Draw
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);
        ctx.beginPath();
        ctx.rect(0, 0, VIRTUAL_W, VIRTUAL_H);
        ctx.clip();

        state.hazards.forEach(h => drawHazard(ctx, h));

        if (state.ball1.grappling > 0 && state.ball2.intangible <= 0) drawGrappleLine(ctx, state.ball1, state.ball2);
        if (state.ball2.grappling > 0 && state.ball1.intangible <= 0) drawGrappleLine(ctx, state.ball2, state.ball1);

        state.projectiles.forEach(p => drawProjectile(ctx, p));
        state.particles.forEach(p => drawParticle(ctx, p));
        drawBall(ctx, state.ball1);
        drawBall(ctx, state.ball2);
        state.floatingTexts.forEach(ft => drawFloatingText(ctx, ft));

        drawArenaBorder(ctx, VIRTUAL_W, VIRTUAL_H);
        ctx.restore();

        // Win condition
        if (state.ball1.hp <= 0 || state.ball2.hp <= 0) {
            let winner, loser;

            if (state.ball1.hp > 0) {
                winner = state.ball1; loser = state.ball2;
            } else if (state.ball2.hp > 0) {
                winner = state.ball2; loser = state.ball1;
            } else {
                if (state.ball1.hp > state.ball2.hp)      { winner = state.ball1; loser = state.ball2; }
                else if (state.ball2.hp > state.ball1.hp) { winner = state.ball2; loser = state.ball1; }
                else {
                    winner = Math.random() > 0.5 ? state.ball1 : state.ball2;
                    loser  = winner === state.ball1 ? state.ball2 : state.ball1;
                }
                winner.hp = 1;
            }

            createParticles(loser.x, loser.y, loser.color, 80, 8, 5);
            createParticles(loser.x, loser.y, '#ffffff', 20, 10, 2);

            winner.flash = 0;
            loser.flash  = 0;
            winAnimTime  = 0;
            createConfetti(200, VIRTUAL_W);
            state.gameState = 'ANIMATING_WIN';
            const duration = (performance.now() - state.matchStartTime) / 1000;
            setTimeout(() => endMatch(winner.def, loser.def, duration), 3500);
        }

    } else if (state.gameState === 'ANIMATING_WIN') {
        winAnimTime += dt;
        const winner = state.ball1.hp > 0 ? state.ball1 : state.ball2;

        winner.vx += (VIRTUAL_W / 2 - winner.x) * 0.001 * dt * 60;
        winner.vy += (VIRTUAL_H / 2 - winner.y) * 0.001 * dt * 60;
        winner.vx *= Math.pow(0.95, dt * 60);
        winner.vy *= Math.pow(0.95, dt * 60);
        winner.x  += winner.vx * dt * 60;
        winner.y  += winner.vy * dt * 60;

        const angleDiff = normalizeAngle(0 - winner.angle);
        if (Math.abs(angleDiff) > 0.05) {
            winner.angle += (angleDiff > 0 ? 0.05 : -0.05) * dt * 60;
        }

        state.confetti.forEach(c => c.update(dt));
        state.particles.forEach(p => p.update(dt));
        state.floatingTexts.forEach(ft => ft.update(dt));
        state.confetti      = state.confetti.filter(c => c.life > 0);
        state.particles     = state.particles.filter(p => p.life > 0);
        state.floatingTexts = state.floatingTexts.filter(ft => ft.life > 0);

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);
        ctx.beginPath();
        ctx.rect(0, 0, VIRTUAL_W, VIRTUAL_H);
        ctx.clip();

        state.confetti.forEach(c => drawConfetti(ctx, c));
        state.particles.forEach(p => drawParticle(ctx, p));
        drawBall(ctx, winner);
        state.floatingTexts.forEach(ft => drawFloatingText(ctx, ft));

        // Splash text: scale in with slight overshoot
        const t = Math.min(1, winAnimTime / 0.45);
        const textScale = t < 0.75 ? (t / 0.75) * 1.18 : 1.18 - ((t - 0.75) / 0.25) * 0.18;
        ctx.save();
        ctx.translate(VIRTUAL_W / 2, VIRTUAL_H / 2 - 80);
        ctx.scale(textScale, textScale);
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = 'bold 90px "Segoe UI", sans-serif';
        ctx.lineWidth    = 14;
        ctx.strokeStyle  = '#020617';
        ctx.strokeText(`${winner.name} Wins!`, 0, 0);
        ctx.fillStyle    = winner.color;
        ctx.fillText(`${winner.name} Wins!`, 0, 0);
        ctx.restore();

        drawArenaBorder(ctx, VIRTUAL_W, VIRTUAL_H);
        ctx.restore();
    }
}

window.onload = () => {
    canvas = document.getElementById('game-canvas');
    ctx    = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    initTournament();
    then = performance.now();
    requestAnimationFrame(gameLoop);
};
