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
    drawObstacles, drawSuddenDeathZone,
    drawTrail, drawBoomerang, drawPortal
} from './renderer.js';
// ui.js: imported for side-effects (event subscriptions) + direct overlay/render calls
import {
    showOverlay, hideOverlay, renderBracket, renderRoster, updateMatchTimer,
    showBuilder, hideBuilder, showQuickFightPicker, showCustomResultOverlay
} from './ui.js';

// Record each match result to the backend — fire-and-forget, never throws.
emitter.on('match:end', async ({ winner, loser, round, duration, custom }) => {
    if (custom) return;
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

let simPaused = false;

// Canvas and rendering context live here — not in shared game state.
let canvas, ctx;

export const VIRTUAL_W = 1056;
export const VIRTUAL_H = 1080;

// Static pillar layout — 4 pillars placed symmetrically, clear of center and spawn zones.
export const OBSTACLES = [
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
    setTournamentPanelVisible(true);
    state.currentRound  = 0;
    state.currentMatch  = 0;
    state.tourneyWinner = null;
    state.matchMode = 'TOURNAMENT';
    showBuilder(baseBalls, buildTournamentFromSelection, showMainMenu);
}

function showMainMenu() {
    setTournamentPanelVisible(true);
    if (state.autoStartTimer) { clearTimeout(state.autoStartTimer); state.autoStartTimer = null; }
    state.gameState = 'BRACKET';
    state.matchMode = 'TOURNAMENT';
    state.ball1 = null;
    state.ball2 = null;
    state.balls = [];
    state.projectiles = [];
    state.particles = [];
    state.floatingTexts = [];
    state.hazards = [];
    state.trails = [];
    state.boomerangs = [];
    state.portals = [];
    state.confetti = [];
    state.matchTime = 0;
    state.suddenDeath = false;
    state.shrinkInset = 0;

    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.classList.add('hidden');

    showOverlay('Tiny Fight Club', 'Welcome to the arena.', 'Start Tournament', initTournament);
    const quickBtn = document.getElementById('quick-fight-btn');
    quickBtn.innerText = 'Quick Fight';
    quickBtn.onclick = openQuickFightPicker;
    quickBtn.classList.remove('hidden');
    const simBtn = document.getElementById('sim-btn');
    if (simBtn) simBtn.classList.remove('hidden');
}

function setTournamentPanelVisible(visible) {
    const panel = document.getElementById('left-panel');
    if (!panel) return;
    panel.classList.toggle('hidden', !visible);
    resizeCanvas();
}

function openQuickFightPicker() {
    if (state.autoStartTimer) { clearTimeout(state.autoStartTimer); state.autoStartTimer = null; }
    setTournamentPanelVisible(false);
    showQuickFightPicker(baseBalls, startCustomMatch, showMainMenu);
}

function buildTournamentFromSelection(selectedDefs) {
    const roster = selectedDefs.map(base => {
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

    state.gameState = 'BRACKET';
    state.matchMode = 'TOURNAMENT';

    renderBracket();
    renderRoster();
    showOverlay('Tiny Fight Club', 'The arena is set. Let the battle begin.', 'Start Tournament', startNextMatch);
}

function startNextMatch() {
    if (state.autoStartTimer) clearTimeout(state.autoStartTimer);

    const match = state.bracket[state.currentRound][state.currentMatch];
    state.ball1 = new Ball(match.p1);
    state.ball2 = new Ball(match.p2);

    state.ball1.team = 1;
    state.ball2.team = 2;

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

    state.balls         = [state.ball1, state.ball2];
    state.projectiles   = [];
    state.particles     = [];
    state.floatingTexts = [];
    state.hazards       = [];
    state.trails        = [];
    state.boomerangs    = [];
    state.portals       = [];
    state.confetti      = [];
    state.obstacles     = OBSTACLES;
    state.matchTime     = 0;
    state.suddenDeath   = false;
    state.shrinkInset   = 0;
    state.gameState     = 'FIGHTING';
    state.matchMode     = 'TOURNAMENT';
    state.matchStartTime = performance.now();

    hideOverlay();
    emitter.emit('match:start', {
        ball1: state.ball1,
        ball2: state.ball2,
        round: state.currentRound,
        matchIndex: state.currentMatch
    });
}

// Custom 1v1 match (Quick Fight mode)
let customMatchDefs = null; // Stores [def1, def2] for Fight Again

export function startCustomMatch(def1, def2) {
    if (state.autoStartTimer) clearTimeout(state.autoStartTimer);
    setTournamentPanelVisible(false);

    // Apply stat variance like tournament matches
    const applyVariance = (base) => {
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
    };

    const p1 = applyVariance(def1);
    const p2 = applyVariance(def2);

    state.ball1 = new Ball(p1);
    state.ball2 = new Ball(p2);

    state.ball1.team = 1;
    state.ball2.team = 2;

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

    state.balls         = [state.ball1, state.ball2];
    state.projectiles   = [];
    state.particles     = [];
    state.floatingTexts = [];
    state.hazards       = [];
    state.trails        = [];
    state.boomerangs    = [];
    state.portals       = [];
    state.confetti      = [];
    state.obstacles     = OBSTACLES;
    state.matchTime     = 0;
    state.suddenDeath   = false;
    state.shrinkInset   = 0;
    state.gameState     = 'CUSTOM_1V1';
    state.matchMode     = 'CUSTOM_1V1';
    state.matchStartTime = performance.now();

    // Store for Fight Again
    customMatchDefs = [def1, def2];

    hideOverlay();
    hideBuilder();
    emitter.emit('match:start', {
        ball1: state.ball1,
        ball2: state.ball2,
        round: -1, // Custom match indicator
        matchIndex: -1
    });
}

function endMatch(winnerDef, loserDef, duration) {
    if (state.matchMode === 'CUSTOM_1V1') {
        state.gameState = 'BRACKET';
        emitter.emit('match:end', {
            winner: winnerDef,
            loser: loserDef,
            round: -1,
            matchIndex: -1,
            duration,
            custom: true
        });

        showCustomResultOverlay(
            winnerDef,
            () => startCustomMatch(customMatchDefs[0], customMatchDefs[1]),
            openQuickFightPicker,
            showMainMenu
        );
        return;
    }

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
// Tracks winning ball reference across ANIMATING_WIN state
let winnerBall = null;

function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);
    if (simPaused) return;

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

    if (state.gameState === 'FIGHTING' || state.gameState === 'CUSTOM_1V1') {
        // Update
        state.matchTime += simDt;

        // Trigger sudden death at 60 simulated seconds
        if (state.matchTime >= 60 && !state.suddenDeath) {
            state.suddenDeath = true;
            emitter.emit('match:suddendeath');
        }

        // Shrink arena during sudden death — zone expands over 60 simulated seconds
        if (state.suddenDeath) {
            const shrinkProgress = Math.min(1, (state.matchTime - 60) / 60);
            state.shrinkInset    = shrinkProgress * 300;
            const inset          = state.shrinkInset;
            const dps            = 10 + shrinkProgress * 30;
            for (const ball of state.balls) {
                if (ball.x < inset || ball.x > VIRTUAL_W - inset ||
                    ball.y < inset || ball.y > VIRTUAL_H - inset) {
                    ball.hp -= dps * simDt;
                }
            }
        }

        updateMatchTimer(state.matchTime, state.suddenDeath);

        // Update all balls — decoys are static dummies, skip their update()
        for (const ball of state.balls.filter(b => b.hp > 0 && !b.isDecoy)) {
            const allOpponents = state.balls.filter(b => b.team !== ball.team && b.hp > 0);
            if (!allOpponents.length) continue;

            // Opponent AI prefers decoys — they act as bait
            const decoys = allOpponents.filter(b => b.isDecoy);
            const pool   = decoys.length > 0 ? decoys : allOpponents;

            const nearest = pool.reduce((a, b) =>
                Math.hypot(b.x - ball.x, b.y - ball.y) < Math.hypot(a.x - ball.x, a.y - ball.y) ? b : a
            );
            ball.update(nearest, VIRTUAL_W, VIRTUAL_H, simDt);
        }

        // Collisions between all opposing-team pairs
        const aliveBalls = state.balls.filter(b => b.hp > 0);
        for (let i = 0; i < aliveBalls.length; i++) {
            for (let j = i + 1; j < aliveBalls.length; j++) {
                if (aliveBalls[i].team !== aliveBalls[j].team) {
                    resolveCollision(aliveBalls[i], aliveBalls[j]);
                }
            }
        }

        // Obstacle collisions for all balls
        for (const ball of aliveBalls) {
            state.obstacles.forEach(obs => resolveObstacleCollision(ball, obs));
        }

        // Trail acts as a solid wall + damage zone for all non-source balls
        for (const seg of state.trails) {
            for (const ball of aliveBalls) {
                if (ball === seg.source) continue;  // Tron passes through own trail
                resolveObstacleCollision(ball, seg);
            }
        }

        // Trail segments damage opposing-team balls (DoT)
        state.trails.forEach(t => {
            const opponents = state.balls.filter(b => b.team !== t.source.team && b.hp > 0);
            opponents.forEach(opp => t.update(opp, simDt));
        });

        // Portal pairs — teleport any ball that enters either portal
        state.portals.forEach(p => p.update(state.balls, simDt));

        // Boomerang updates — retarget if current target is dead
        state.boomerangs.forEach(blade => {
            if (blade.target.hp <= 0) {
                const alt = state.balls.find(b => b.team !== blade.source.team && b.hp > 0);
                if (alt) blade.target = alt; else { blade._catch(); return; }
            }
            blade.update(simDt);
        });

        // Projectile retargeting and update
        state.projectiles.forEach(p => {
            if (p.target && p.target.hp <= 0) {
                const alt = state.balls.find(b => b.team !== p.source.team && b.hp > 0);
                if (alt) p.target = alt; else { p.active = false; return; }
            }
            p.update(simDt);
        });

        state.particles.forEach(p => p.update(simDt));
        state.floatingTexts.forEach(ft => ft.update(simDt));

        // Hazard update — each hazard finds opposing-team balls
        state.hazards.forEach(h => {
            const opponents = state.balls.filter(b => b.team !== h.source.team && b.hp > 0);
            opponents.forEach(opp => h.update(opp, simDt));
        });

        // Remove minions whose host died; remove decoys whose Ninja died
        state.balls = state.balls.filter(b => !(b.isMinion && b.master && b.master.hp <= 0));
        state.balls = state.balls.filter(b => !(b.isDecoy && b.master && b.master.hp <= 0));

        // Cleanup
        state.trails        = state.trails.filter(t => t.active);
        state.boomerangs    = state.boomerangs.filter(b => b.active);
        state.portals       = state.portals.filter(p => p.active);
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
        drawTrail(ctx, state.trails);
        state.hazards.forEach(h => drawHazard(ctx, h));
        // Portals drawn beneath balls
        state.portals.forEach(p => {
            drawPortal(ctx, p.ax, p.ay, p.source.color, p.life / 7.0);
            drawPortal(ctx, p.bx, p.by, p.source.color, p.life / 7.0);
        });

        // Grapple line — only for primary balls
        if (state.ball1.grappling > 0 && state.ball2.intangible <= 0) drawGrappleLine(ctx, state.ball1, state.ball2);
        if (state.ball2.grappling > 0 && state.ball1.intangible <= 0) drawGrappleLine(ctx, state.ball2, state.ball1);

        state.projectiles.forEach(p => drawProjectile(ctx, p));
        state.boomerangs.forEach(b => drawBoomerang(ctx, b));
        state.particles.forEach(p => drawParticle(ctx, p));
        state.balls.filter(b => b.hp > 0).forEach(b => drawBall(ctx, b));
        state.floatingTexts.forEach(ft => drawFloatingText(ctx, ft));

        drawArenaBorder(ctx, VIRTUAL_W, VIRTUAL_H);
        if (state.suddenDeath) drawSuddenDeathZone(ctx, VIRTUAL_W, VIRTUAL_H, state.shrinkInset);
        ctx.restore();

        // Win condition — check by team
        // For fighters with clone ability (hasClone=true), both original AND clone must die
        const team1Alive = state.balls.filter(b => b.team === 1 && b.hp > 0 && !b.isDecoy);
        const team2Alive = state.balls.filter(b => b.team === 2 && b.hp > 0 && !b.isDecoy);

        // Check if any ball on team has an active (alive) clone
        const team1HasActiveClone = state.balls.some(b => b.team === 1 && b.hasClone && !b.isClone &&
            state.balls.some(c => c.isClone && c.master === b && c.hp > 0));
        const team2HasActiveClone = state.balls.some(b => b.team === 2 && b.hasClone && !b.isClone &&
            state.balls.some(c => c.isClone && c.master === b && c.hp > 0));

        // Team is truly dead only if no living balls AND no active clones
        const team1Dead = team1Alive.length === 0 && !team1HasActiveClone;
        const team2Dead = team2Alive.length === 0 && !team2HasActiveClone;

        if (team1Dead || team2Dead) {
            let winner, loser;

            if (!team1Dead) {
                winner = state.ball1; loser = state.ball2;
            } else if (!team2Dead) {
                winner = state.ball2; loser = state.ball1;
            } else {
                // Both teams wiped simultaneously — compare primary ball HP
                if (state.ball1.hp >= state.ball2.hp) { winner = state.ball1; loser = state.ball2; }
                else { winner = state.ball2; loser = state.ball1; }
                winner.hp = 1;
            }

            // Find an alive ball on the winning team for the victory animation
            const winningTeamAlive = state.balls.filter(b => b.team === winner.team && b.hp > 0);
            winnerBall = winningTeamAlive.length ? winningTeamAlive[0] : winner;

            const loserDisplay = state.balls.find(b => b.team === loser.team) || loser;
            createParticles(loserDisplay.x, loserDisplay.y, loserDisplay.color, 80, 8, 5);
            createParticles(loserDisplay.x, loserDisplay.y, '#ffffff', 20, 10, 2);

            winner.flash    = 0;
            loser.flash     = 0;
            winnerBall.flash = 0;
            winAnimTime     = 0;
            createConfetti(200, VIRTUAL_W);
            state.gameState = 'ANIMATING_WIN';
            const duration  = state.matchTime;
            const animDelay = Math.round(3500 / state.speedMultiplier);
            setTimeout(() => endMatch(winner.def, loser.def, duration), animDelay);
        }

    } else if (state.gameState === 'ANIMATING_WIN') {
        winAnimTime += simDt;
        const winner = winnerBall || (state.ball1.hp > 0 ? state.ball1 : state.ball2);

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

    document.getElementById('sim-btn').addEventListener('click', () => {
        import('./sim.js').then(m => m.openSimPanel());
    });

    document.getElementById('quick-fight-btn').onclick = openQuickFightPicker;
    showMainMenu();
    then = performance.now();
    requestAnimationFrame(gameLoop);
};

export function pauseForSim() {
    simPaused = true;
    if (state.autoStartTimer) { clearTimeout(state.autoStartTimer); state.autoStartTimer = null; }
}

export function resumeFromSim() {
    state.balls = []; state.ball1 = null; state.ball2 = null;
    state.projectiles = []; state.particles = []; state.floatingTexts = [];
    state.hazards = []; state.trails = []; state.boomerangs = [];
    state.portals = []; state.confetti = []; state.obstacles = [];
    state.matchTime = 0; state.suddenDeath = false; state.shrinkInset = 0;
    state.gameState = 'BRACKET';
    simPaused = false;

    const builderVisible = !document.getElementById('builder-overlay').classList.contains('hidden');
    if (!builderVisible) {
        if (state.tourneyWinner) {
            showOverlay(`${state.tourneyWinner.name} Wins!`, 'The ultimate champion has been crowned.', 'Play Again', initTournament, state.tourneyWinner.color);
        } else if (state.bracket[state.currentRound]?.[state.currentMatch]?.p1) {
            const match = state.bracket[state.currentRound][state.currentMatch];
            const rNames = ['Round of 16 Match', 'Quarterfinal', 'Semifinal', 'Final Match'];
            showOverlay(`Next: ${rNames[state.currentRound]}`, `${match.p1.name} vs ${match.p2.name}`, 'Start Now', startNextMatch);
        }
    }
}
