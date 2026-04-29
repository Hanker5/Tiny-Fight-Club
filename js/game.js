import { state } from './state.js';
import { baseBalls } from './data.js';
import { Ball } from './entities.js';
import { resolveCollision, resolveObstacleCollision } from './systems.js';
import { createParticles, createConfetti } from './fx.js';
import { emitter } from './events.js';
import { normalizeAngle } from './utils.js';
import {
    drawBall, drawHazard, drawProjectile,
    drawParticle, drawFloatingText,
    drawGrappleLine, drawArenaBorder, drawConfetti,
    drawObstacles, drawSuddenDeathZone
} from './renderer.js';
// ui.js: imported for side-effects (event subscriptions) + direct overlay/render calls
import { showOverlay, hideOverlay, renderBracket, renderRoster, updateMatchTimer } from './ui.js';

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

// Static pillar layout — 4 pillars placed symmetrically, clear of center and spawn zones.
const OBSTACLES = [
    { x: 264, y: 270,  r: 40 },
    { x: 792, y: 270,  r: 40 },
    { x: 264, y: 810,  r: 40 },
    { x: 792, y: 810,  r: 40 }
];

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

    state.bracket = [
        [
            { p1: roster[0],  p2: roster[1],  winner: null },
            { p1: roster[2],  p2: roster[3],  winner: null },
            { p1: roster[4],  p2: roster[5],  winner: null },
            { p1: roster[6],  p2: roster[7],  winner: null },
            { p1: roster[8],  p2: roster[9],  winner: null },
            { p1: roster[10], p2: roster[11], winner: null },
            { p1: roster[12], p2: roster[13], winner: null },
            { p1: roster[14], p2: roster[15], winner: null }
        ],
        [
            { p1: null, p2: null, winner: null },
            { p1: null, p2: null, winner: null },
            { p1: null, p2: null, winner: null },
            { p1: null, p2: null, winner: null }
        ],
        [
            { p1: null, p2: null, winner: null },
            { p1: null, p2: null, winner: null }
        ],
        [
            { p1: null, p2: null, winner: null }
        ]
    ];

    state.currentRound  = 0;
    state.currentMatch  = 0;
    state.tourneyWinner = null;
    state.gameState     = 'BRACKET';

    renderBracket();
    renderRoster();
    showOverlay('Tiny Fight Club', '16 unique balls compete. Only one will survive.', 'Start Tournament', startNextMatch);
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
    state.obstacles     = OBSTACLES;
    state.matchTime     = 0;
    state.suddenDeath   = false;
    state.shrinkInset   = 0;
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
    state.bracket[state.currentRound][state.currentMatch].winner = winnerDef;

    const round      = state.currentRound;
    const matchIndex = state.currentMatch;

    if (state.currentRound < 3) {
        const nextIdx = Math.floor(state.currentMatch / 2);
        const isP1    = state.currentMatch % 2 === 0;
        if (isP1) state.bracket[state.currentRound + 1][nextIdx].p1 = winnerDef;
        else      state.bracket[state.currentRound + 1][nextIdx].p2 = winnerDef;
    } else {
        state.tourneyWinner = winnerDef;
    }

    state.currentMatch++;
    if (state.currentMatch >= state.bracket[state.currentRound].length) {
        state.currentRound++;
        state.currentMatch = 0;
    }

    state.gameState = 'BRACKET';

    // Emit for subscribers (API recording, stats, etc.)
    emitter.emit('match:end', { winner: winnerDef, loser: loserDef, round, matchIndex, duration });

    if (state.tourneyWinner) {
        emitter.emit('tournament:end', { champion: state.tourneyWinner });
        showOverlay(`${state.tourneyWinner.name} Wins!`, 'The ultimate champion has been crowned.', 'Play Again', initTournament, state.tourneyWinner.color);
        return;
    }

    const match  = state.bracket[state.currentRound][state.currentMatch];
    const rNames = ['Round of 16 Match', 'Quarterfinal', 'Semifinal', 'Final Match'];
    showOverlay(
        `Next: ${rNames[state.currentRound]}`,
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
// simDt = dt * speedMultiplier drives all entity updates so speed button scales everything.

let then;
let winAnimTime = 0;

function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);

    const dt    = Math.min((timestamp - then) / 1000, 0.05);
    then        = timestamp;
    const simDt = dt * state.speedMultiplier;

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
        state.matchTime += simDt;

        // Trigger sudden death at 60 simulated seconds
        if (state.matchTime >= 60 && !state.suddenDeath) {
            state.suddenDeath = true;
            emitter.emit('match:suddendeath');
        }

        // Shrink arena during sudden death — zone expands over 60 simulated seconds
        if (state.suddenDeath) {
            const shrinkProgress  = Math.min(1, (state.matchTime - 60) / 60);
            state.shrinkInset     = shrinkProgress * 300;
            const inset           = state.shrinkInset;
            const dps             = 10 + shrinkProgress * 30;
            for (const ball of [state.ball1, state.ball2]) {
                if (ball.x < inset || ball.x > VIRTUAL_W - inset ||
                    ball.y < inset || ball.y > VIRTUAL_H - inset) {
                    ball.hp -= dps * simDt;
                }
            }
        }

        updateMatchTimer(state.matchTime, state.suddenDeath);

        state.ball1.update(state.ball2, VIRTUAL_W, VIRTUAL_H, simDt);
        state.ball2.update(state.ball1, VIRTUAL_W, VIRTUAL_H, simDt);
        resolveCollision(state.ball1, state.ball2);

        state.obstacles.forEach(obs => {
            resolveObstacleCollision(state.ball1, obs);
            resolveObstacleCollision(state.ball2, obs);
        });

        state.projectiles.forEach(p => p.update(simDt));
        state.particles.forEach(p => p.update(simDt));
        state.floatingTexts.forEach(ft => ft.update(simDt));
        state.hazards.forEach(h => h.update(h.source === state.ball1 ? state.ball2 : state.ball1, simDt));

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

        drawObstacles(ctx, state.obstacles);
        state.hazards.forEach(h => drawHazard(ctx, h));

        if (state.ball1.grappling > 0 && state.ball2.intangible <= 0) drawGrappleLine(ctx, state.ball1, state.ball2);
        if (state.ball2.grappling > 0 && state.ball1.intangible <= 0) drawGrappleLine(ctx, state.ball2, state.ball1);

        state.projectiles.forEach(p => drawProjectile(ctx, p));
        state.particles.forEach(p => drawParticle(ctx, p));
        drawBall(ctx, state.ball1);
        drawBall(ctx, state.ball2);
        state.floatingTexts.forEach(ft => drawFloatingText(ctx, ft));

        drawArenaBorder(ctx, VIRTUAL_W, VIRTUAL_H);
        if (state.suddenDeath) drawSuddenDeathZone(ctx, VIRTUAL_W, VIRTUAL_H, state.shrinkInset);
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
            const duration  = state.matchTime;
            const animDelay = Math.round(3500 / state.speedMultiplier);
            setTimeout(() => endMatch(winner.def, loser.def, duration), animDelay);
        }

    } else if (state.gameState === 'ANIMATING_WIN') {
        winAnimTime += simDt;
        const winner = state.ball1.hp > 0 ? state.ball1 : state.ball2;

        winner.vx += (VIRTUAL_W / 2 - winner.x) * 0.001 * simDt * 60;
        winner.vy += (VIRTUAL_H / 2 - winner.y) * 0.001 * simDt * 60;
        winner.vx *= Math.pow(0.95, simDt * 60);
        winner.vy *= Math.pow(0.95, simDt * 60);
        winner.x  += winner.vx * simDt * 60;
        winner.y  += winner.vy * simDt * 60;

        const angleDiff = normalizeAngle(0 - winner.angle);
        if (Math.abs(angleDiff) > 0.05) {
            winner.angle += (angleDiff > 0 ? 0.05 : -0.05) * simDt * 60;
        }

        state.confetti.forEach(c => c.update(simDt));
        state.particles.forEach(p => p.update(simDt));
        state.floatingTexts.forEach(ft => ft.update(simDt));
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

    const speedBtn = document.getElementById('speed-btn');
    speedBtn.addEventListener('click', () => {
        const speeds = [1, 2, 4];
        const cur = speeds.indexOf(state.speedMultiplier);
        state.speedMultiplier = speeds[(cur + 1) % speeds.length];
        speedBtn.textContent = `${state.speedMultiplier}×`;
    });

    initTournament();
    then = performance.now();
    requestAnimationFrame(gameLoop);
};
