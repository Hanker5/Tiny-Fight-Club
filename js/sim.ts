// @ts-nocheck — pre-existing JS class patterns; typed incrementally
import { state }                                      from './state';
import { baseBalls }                                  from './data';
import { Ball }                                       from './entities';
import { resolveCollision, resolveObstacleCollision } from './systems';
import { pauseForSim, resumeFromSim,
         VIRTUAL_W, VIRTUAL_H, OBSTACLES }            from './game';

const SIM_DT          = 1 / 60;
const STEPS_PER_CHUNK = 360;   // ~6 sim-seconds per chunk; keeps tasks well under 5ms
const MAX_STEPS       = 7200;  // 120 sim-seconds hard cap per match
const MARGIN          = 120;

// SimEngine

class SimEngine {
    constructor(defs, matchesPerPair) {
        this.defs           = defs;
        this.matchesPerPair = matchesPerPair;
        this._aborted       = false;
        this._onProgress    = null;
        this._onComplete    = null;

        // results[nameA][nameB] = { wins, losses, draws } from A's perspective
        this.results = {};
        for (const a of defs) {
            this.results[a.name] = {};
            for (const b of defs) {
                if (a.name !== b.name)
                    this.results[a.name][b.name] = { wins: 0, losses: 0, draws: 0 };
            }
        }

        // Build shuffled queue of all unique pairings Ã— matchesPerPair
        this.queue = [];
        for (let i = 0; i < defs.length; i++) {
            for (let j = i + 1; j < defs.length; j++) {
                for (let k = 0; k < matchesPerPair; k++) {
                    this.queue.push({ defA: defs[i], defB: defs[j] });
                }
            }
        }
        this.queue.sort(() => Math.random() - 0.5);
        this.total = this.queue.length;
        this.done  = 0;
    }

    start(onProgress, onComplete) {
        this._onProgress = onProgress;
        this._onComplete = onComplete;
        setTimeout(() => this._runNext(), 0);
    }

    abort() { this._aborted = true; }

    _runNext() {
        if (this._aborted || this.queue.length === 0) {
            this._onComplete(this.results);
            return;
        }

        const { defA, defB } = this.queue.shift();

        this._runMatch(defA, defB, winner => {
            if (winner === 'A') {
                this.results[defA.name][defB.name].wins++;
                this.results[defB.name][defA.name].losses++;
            } else {
                this.results[defB.name][defA.name].wins++;
                this.results[defA.name][defB.name].losses++;
            }
            this.done++;
            this._onProgress(this.done, this.total);
            setTimeout(() => this._runNext(), 0);
        });
    }

    _makeBall(def, team) {
        const hpVar    = 0.9 + Math.random() * 0.2;
        const speedVar = 0.9 + Math.random() * 0.2;
        const dmgVar   = 0.9 + Math.random() * 0.2;
        const variedDef = {
            ...def,
            hp:     Math.floor(def.maxHp * hpVar),
            maxHp:  Math.floor(def.maxHp * hpVar),
            speed:  parseFloat((def.speed * speedVar).toFixed(1)),
            damage: Math.floor(def.damage * dmgVar),
        };
        const b = new Ball(variedDef);
        b.team = team;
        return b;
    }

    _runMatch(defA, defB, onDone) {
        this._immunityExpiry = new Map(); // sim-time expiry for immuneActive (real setTimeout never fires in sim)

        const ballA = this._makeBall(defA, 1);
        const ballB = this._makeBall(defB, 2);

        // Mirror spawn logic from startNextMatch in game.js
        const halfW = VIRTUAL_W / 2;
        ballA.x     = MARGIN + Math.random() * (halfW - MARGIN * 2);
        ballA.y     = MARGIN + Math.random() * (VIRTUAL_H - MARGIN * 2);
        ballA.angle = Math.random() * Math.PI * 2;
        ballA.vx    = (Math.random() - 0.5) * 12;
        ballA.vy    = (Math.random() - 0.5) * 12;

        ballB.x     = halfW + MARGIN + Math.random() * (halfW - MARGIN * 2);
        ballB.y     = MARGIN + Math.random() * (VIRTUAL_H - MARGIN * 2);
        ballB.angle = Math.random() * Math.PI * 2;
        ballB.vx    = (Math.random() - 0.5) * 12;
        ballB.vy    = (Math.random() - 0.5) * 12;

        // Install into global state (Ball.update reads state.* directly)
        state.ball1         = ballA;
        state.ball2         = ballB;
        state.balls         = [ballA, ballB];
        state.projectiles   = [];
        state.particles     = [];
        state.floatingTexts = [];
        state.hazards       = [];
        state.hexZones      = [];
        state.hexProjectiles = [];
        state.trails        = [];
        state.boomerangs    = [];
        state.shields       = [];
        state.portals       = [];
        state.confetti      = [];
        state.obstacles     = OBSTACLES;
        state.matchTime     = 0;
        state.suddenDeath   = false;
        state.shrinkInset   = 0;
        state.gameState     = 'FIGHTING';

        let stepsRun = 0;

        const runChunk = () => {
            for (let i = 0; i < STEPS_PER_CHUNK; i++) {
                if (stepsRun >= MAX_STEPS) {
                    // Sudden death ensures a winner â€” higher HP wins
                    onDone(ballA.hp >= ballB.hp ? 'A' : 'B');
                    return;
                }

                this._stepMatch();
                stepsRun++;

                const team1 = state.balls.filter(b => b.team === 1 && b.hp > 0);
                const team2 = state.balls.filter(b => b.team === 2 && b.hp > 0);

                // Check if any ball on team has an active (alive) clone
                const team1HasActiveClone = state.balls.some(b => b.team === 1 && b.hasClone && !b.isClone &&
                    state.balls.some(c => c.isClone && c.master === b && c.hp > 0));
                const team2HasActiveClone = state.balls.some(b => b.team === 2 && b.hasClone && !b.isClone &&
                    state.balls.some(c => c.isClone && c.master === b && c.hp > 0));

                const team1Dead = team1.length === 0 && !team1HasActiveClone;
                const team2Dead = team2.length === 0 && !team2HasActiveClone;

                if (team1Dead || team2Dead) {
                    let winner;
                    if (team1.length || team1HasActiveClone)      winner = 'A';
                    else if (team2.length || team2HasActiveClone) winner = 'B';
                    else                    winner = ballA.hp >= ballB.hp ? 'A' : 'B';
                    onDone(winner);
                    return;
                }
            }

            if (this._aborted) { onDone('A'); return; }
            setTimeout(runChunk, 0);
        };

        setTimeout(runChunk, 0);
    }

    _stepMatch() {
        const dt = SIM_DT;
        state.matchTime += dt;

        // Sudden death â€” mirrors game.js:246-262
        if (state.matchTime >= 60 && !state.suddenDeath) state.suddenDeath = true;
        if (state.suddenDeath) {
            const progress   = Math.min(1, (state.matchTime - 60) / 60);
            state.shrinkInset = progress * 300;
            const inset      = state.shrinkInset;
            const dps        = 10 + progress * 30;
            for (const ball of state.balls) {
                if (ball.x < inset || ball.x > VIRTUAL_W - inset ||
                    ball.y < inset || ball.y > VIRTUAL_H - inset) {
                    ball.hp -= dps * dt;
                }
            }
        }

        // Ball updates â€” mirrors game.js:268-275
        for (const ball of state.balls.filter(b => b.hp > 0)) {
            const opponents = state.balls.filter(b => b.team !== ball.team && b.hp > 0);
            if (!opponents.length) continue;
            const nearest = opponents.reduce((a, b) =>
                Math.hypot(b.x - ball.x, b.y - ball.y) <
                Math.hypot(a.x - ball.x, a.y - ball.y) ? b : a
            );
            ball.update(nearest, VIRTUAL_W, VIRTUAL_H, dt);
        }

        // Ball-vs-ball collisions (opposing teams only) â€” game.js:278-285
        const aliveBalls = state.balls.filter(b => b.hp > 0);
        for (let i = 0; i < aliveBalls.length; i++) {
            for (let j = i + 1; j < aliveBalls.length; j++) {
                if (aliveBalls[i].team !== aliveBalls[j].team) {
                    resolveCollision(aliveBalls[i], aliveBalls[j]);
                }
            }
        }

        // Obstacle collisions â€” game.js:288-290
        for (const ball of aliveBalls) {
            state.obstacles.forEach(obs => resolveObstacleCollision(ball, obs));
        }

        // Trail wall + DoT â€” game.js:293-304
        for (const seg of state.trails) {
            for (const ball of aliveBalls) {
                if (ball === seg.source) continue;
                resolveObstacleCollision(ball, seg);
            }
        }
        state.trails.forEach(t => {
            const opponents = state.balls.filter(b => b.team !== t.source.team && b.hp > 0);
            opponents.forEach(opp => t.update(opp, dt));
        });

        // Portals â€” game.js:307
        state.portals.forEach(p => p.update(state.balls, dt));

        // Boomerangs â€” game.js:310-316
        state.boomerangs.forEach(blade => {
            if (blade.target.hp <= 0) {
                const alt = state.balls.find(b => b.team !== blade.source.team && b.hp > 0);
                if (alt) blade.target = alt; else { blade._catch(); return; }
            }
            blade.update(dt);
        });

        // Shield Burst
        state.shields.forEach(s => {
            if (s.target && s.target.hp <= 0) {
                const alt = state.balls.find(b => b.team !== s.source.team && b.hp > 0);
                if (alt) s.target = alt; else { s.active = false; return; }
            }
            s.update(dt);
        });

        // Projectiles â€” game.js:319-325
        state.projectiles.forEach(p => {
            if (p.target && p.target.hp <= 0) {
                const alt = state.balls.find(b => b.team !== p.source.team && b.hp > 0);
                if (alt) p.target = alt; else { p.active = false; return; }
            }
            p.update(dt);
        });

        // Hazards â€” game.js:331-334
        state.hazards.forEach(h => {
            const opponents = state.balls.filter(b => b.team !== h.source.team && b.hp > 0);
            opponents.forEach(opp => h.update(opp, dt));
        });

        // Hex zones
        state.hexZones.forEach(hz => {
            const opponents = state.balls.filter(b => b.team !== hz.source.team && b.hp > 0);
            opponents.forEach(opp => hz.update(opp, dt));
        });

        // Hex projectiles
        state.hexProjectiles.forEach(p => p.update(dt, state.balls, VIRTUAL_W, VIRTUAL_H));

        // Fix: immuneActive is reset via a real-clock setTimeout(1500ms) in entities.js,
        // which never fires during a fast sim. Expire it using sim time (1.5s) instead.
        for (const ball of state.balls) {
            if (ball.immuneActive) {
                if (!this._immunityExpiry.has(ball)) {
                    this._immunityExpiry.set(ball, state.matchTime + 1.5);
                } else if (state.matchTime >= this._immunityExpiry.get(ball)) {
                    ball.immuneActive = false;
                    this._immunityExpiry.delete(ball);
                }
            } else {
                this._immunityExpiry.delete(ball);
            }
        }

        // Minion cleanup â€” game.js:337
        state.balls = state.balls.filter(b => !(b.isMinion && b.master && b.master.hp <= 0));

        // Array prune â€” game.js:340-346
        state.trails        = state.trails.filter(t => t.active);
        state.boomerangs    = state.boomerangs.filter(b => b.active);
        state.shields       = state.shields.filter(s => s.active);
        state.portals       = state.portals.filter(p => p.active);
        state.projectiles   = state.projectiles.filter(p => p.active);
        state.hazards       = state.hazards.filter(h => h.active);
        state.hexZones      = state.hexZones.filter(hz => hz.active);
        state.hexProjectiles = state.hexProjectiles.filter(p => p.active);

        // Clear visual-only arrays (no game effect, prevent unbounded growth)
        state.particles     = [];
        state.floatingTexts = [];
        state.noteParticles = [];
        state.confetti      = [];
    }
}

//  SimUI 

let _engine = null;
let _selectedFighterName = null;
let _lastMatchesPerPair: number = 20;
let _savedResults = null;

const MAX_HP  = 172;
const MAX_SPD = 6.2;
const MAX_DMG = 19;
const MAX_MASS = 3;
const MAX_RADIUS = 88;

const TIER_THRESHOLDS = [
    { label: 'S', min: 53, color: '#f59e0b' },
    { label: 'A', min: 50, color: '#22c55e' },
    { label: 'B', min: 47, color: '#3b82f6' },
    { label: 'C', min: 44, color: '#f97316' },
    { label: 'D', min: 40,  color: '#ef4444' },
];

export function openSimPanel() {
    if (state.gameState !== 'BRACKET') return;

    pauseForSim();

    const overlay = document.getElementById('sim-overlay');
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';

    document.getElementById('sim-run-btn').disabled    = false;
    document.getElementById('sim-status').textContent  = 'Ready';
    document.getElementById('sim-progress-bar').style.width = '0%';
    document.getElementById('sim-results-table').innerHTML  = '';
    document.getElementById('sim-h2h-table').innerHTML      = '';

    document.getElementById('sim-run-btn').onclick   = _startRun;
    document.getElementById('sim-close-btn').onclick = _closePanel;

    // Show fighter detail panel in left panel
    document.getElementById('view-bracket').classList.add('hidden');
    const fp = document.getElementById('sim-fighter-panel');
    fp.classList.remove('hidden');
    fp.style.display = 'flex';
    _selectedFighterName = null;
    requestAnimationFrame(() => _drawDefaultCard());

    // Click delegation on results table
    document.getElementById('sim-results-table').addEventListener('click', _onResultsClick);

    // Load previously saved sim results
    fetch('/api/sim-results')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (!data) return;
            const date = new Date(data.timestamp).toLocaleDateString();
            _savedResults = data.results;
            document.getElementById('sim-status').textContent = `Saved results from ${date}`;
            document.getElementById('sim-progress-bar').style.width = '100%';
            _renderResults(data.results, baseBalls);
            _renderH2H(data.results, baseBalls);
        })
        .catch(() => {});
}

function _closePanel() {
    if (_engine) { _engine.abort(); _engine = null; }

    const overlay = document.getElementById('sim-overlay');
    overlay.style.display = 'none';
    overlay.classList.add('hidden');

    // Restore left panel
    document.getElementById('sim-fighter-panel').style.display = 'none';
    document.getElementById('sim-fighter-panel').classList.add('hidden');
    document.getElementById('view-bracket').classList.remove('hidden');
    document.getElementById('view-bracket').classList.add('flex');
    document.getElementById('sim-results-table').removeEventListener('click', _onResultsClick);
    _selectedFighterName = null;

    resumeFromSim();
}

function _startRun() {
    if (_engine) { _engine.abort(); }

    const matchesPerPair = Math.max(1, parseInt(document.getElementById('sim-matches-input').value, 10) || 20);
    _lastMatchesPerPair = matchesPerPair;
    const defs = baseBalls;

    document.getElementById('sim-run-btn').disabled        = true;
    document.getElementById('sim-status').textContent      = 'Runningâ€¦';
    document.getElementById('sim-results-table').innerHTML = '';
    document.getElementById('sim-h2h-table').innerHTML     = '';
    document.getElementById('sim-progress-bar').style.width = '0%';

    _engine = new SimEngine(defs, matchesPerPair);
    _engine.start(_onProgress, _onComplete);
}

function _onProgress(done, total) {
    const pct = (done / total * 100).toFixed(1);
    document.getElementById('sim-progress-bar').style.width = pct + '%';
    document.getElementById('sim-status').textContent = `${done} / ${total} (${pct}%)`;
    if (done % 50 === 0) _renderResults(_engine.results, _engine.defs);
}

function _onComplete(results) {
    document.getElementById('sim-run-btn').disabled       = false;
    document.getElementById('sim-status').textContent     = 'Complete';
    document.getElementById('sim-progress-bar').style.width = '100%';
    _savedResults = results;
    _renderResults(results, _engine.defs);
    _renderH2H(results, _engine.defs);
    fetch('/api/sim-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results, matchesPerPair: _lastMatchesPerPair, timestamp: new Date().toISOString() }),
    }).catch(() => {});
}

function _renderResults(results, defs) {
    const rows = defs.map(def => {
        let wins = 0, losses = 0, draws = 0;
        for (const rec of Object.values(results[def.name] ?? {})) {
            wins   += rec.wins ?? 0;
            losses += rec.losses ?? 0;
            draws  += rec.draws ?? 0;
        }
        const played  = wins + losses + draws;
        const winRate = played > 0 ? (wins / played * 100) : null;
        return { def, wins, losses, draws, played, winRate };
    });

    rows.sort((a, b) => {
        const wa = a.winRate ?? -1, wb = b.winRate ?? -1;
        return wb !== wa ? wb - wa : b.wins - a.wins;
    });

    let html = `<table style="width:100%;border-collapse:collapse;font-size:clamp(10px,1vw,14px)">
      <thead><tr style="border-bottom:1px solid #334155;color:#94a3b8;text-align:left">
        <th style="padding:6px 8px">#</th>
        <th style="padding:6px 8px">Fighter</th>
        <th style="padding:6px 8px">Ability</th>
        <th style="padding:6px 8px;text-align:right">W</th>
        <th style="padding:6px 8px;text-align:right">L</th>
        <th style="padding:6px 8px;text-align:right">Win%</th>
        <th style="padding:6px 4px;min-width:80px"></th>
      </tr></thead><tbody>`;

    rows.forEach((r, i) => {
        const pct    = r.winRate ?? 0;
        const pctStr = r.winRate !== null ? pct.toFixed(1) + '%' : 'â€”';
        const color  = pct >= 55 ? '#4ade80' : pct <= 45 ? '#f87171' : '#f1f5f9';
        const isSelected = r.def.name === _selectedFighterName;
        html += `<tr data-fighter="${r.def.name}" style="border-bottom:1px solid #1e293b;cursor:pointer;${isSelected ? 'background:#1e293b' : ''}">
          <td style="padding:5px 8px;color:#64748b">${i + 1}</td>
          <td style="padding:5px 8px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${r.def.color};margin-right:6px;vertical-align:middle"></span>
            <span style="color:#f1f5f9;font-weight:600">${r.def.name}</span>
          </td>
          <td style="padding:5px 8px;color:#818cf8">${r.def.ability}</td>
          <td style="padding:5px 8px;text-align:right;color:#4ade80">${r.wins}</td>
          <td style="padding:5px 8px;text-align:right;color:#f87171">${r.losses}</td>
          <td style="padding:5px 8px;text-align:right;font-weight:700;color:${color}">${pctStr}</td>
          <td style="padding:5px 4px">
            <div style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${pct >= 55 ? '#4ade80' : pct >= 45 ? '#3b82f6' : '#f87171'};border-radius:3px"></div>
            </div>
          </td>
        </tr>`;
    });

    html += `</tbody></table>`;
    document.getElementById('sim-results-table').innerHTML = html;

    if (_selectedFighterName) _drawFighterCard(_selectedFighterName, results);
}

function _onResultsClick(e) {
    const row = e.target.closest('tr[data-fighter]');
    if (!row) return;
    _selectedFighterName = row.dataset.fighter;
    _drawFighterCard(_selectedFighterName, _engine ? _engine.results : _savedResults);
}

// Canvas Helpers 

function _getCanvasCtx() {
    const canvas = document.getElementById('sim-fighter-canvas');
    if (!canvas) return null;
    const dpr  = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return null;
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, cssW, cssH };
}

function _wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
    const words = text.split(' ');
    let line = '';
    let linesDrawn = 0;
    for (let i = 0; i < words.length; i++) {
        const test = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxW && line) {
            if (linesDrawn === maxLines - 1) {
                // last allowed line â€” append ellipsis
                let trimmed = line;
                while (trimmed.length > 0 && ctx.measureText(trimmed + 'â€¦').width > maxW) {
                    trimmed = trimmed.slice(0, -1);
                }
                ctx.fillText(trimmed + 'â€¦', x, y);
                return linesDrawn + 1;
            }
            ctx.fillText(line, x, y);
            y += lineH;
            linesDrawn++;
            line = words[i];
        } else {
            line = test;
        }
    }
    if (line) { ctx.fillText(line, x, y); linesDrawn++; }
    return linesDrawn;
}

function _drawRoundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    if (fill)   { ctx.fillStyle = fill;   ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function _getTier(winPct) {
    for (const t of TIER_THRESHOLDS) {
        if (winPct >= t.min) return t;
    }
    return TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
}

function _drawDefaultCard() {
    const c = _getCanvasCtx();
    if (!c) return;
    const { ctx, cssW, cssH } = c;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cssW, cssH);

    const cx = cssW / 2, cy = cssH / 2;

    ctx.beginPath();
    ctx.arc(cx, cy - 30, 36, 0, Math.PI * 2);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Simple "person" silhouette inside circle
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy - 42, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 34);
    ctx.lineTo(cx, cy - 16);
    ctx.moveTo(cx - 10, cy - 28);
    ctx.lineTo(cx + 10, cy - 28);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText('No Fighter Selected', cx, cy + 20);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText('Click any row to view details', cx, cy + 40);
}

function _drawFighterCard(name, results) {
    const def = baseBalls.find(d => d.name === name);
    if (!def) return;

    const c = _getCanvasCtx();
    if (!c) return;
    const { ctx, cssW, cssH } = c;

    const pad   = Math.round(cssW * 0.07);
    const useW  = cssW - pad * 2;
    let   curY  = 0;

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cssW, cssH);

    // Subtle top gradient
    const grad = ctx.createLinearGradient(0, 0, 0, cssH * 0.4);
    grad.addColorStop(0, 'rgba(30,41,59,0.25)');
    grad.addColorStop(1, 'rgba(15,23,42,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cssW, cssH * 0.4);

    //  Avatar 
    const avR = Math.min(cssW * 0.13, 58);
    const avX = cssW / 2;
    curY += avR + pad;
    const avY = curY;

    // Glow ring
    ctx.beginPath();
    ctx.arc(avX, avY, avR + 6, 0, Math.PI * 2);
    ctx.fillStyle = def.color + '22';
    ctx.fill();

    // Main circle
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Initial letter
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(avR * 0.78)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(def.name[0].toUpperCase(), avX, avY);
    ctx.textBaseline = 'alphabetic';

    // Tier badge (top-right of avatar)
    const hasResults = results && results[name] && Object.keys(results[name]).some(k => {
        const r = results[name][k];
        return (r.wins + r.losses + r.draws) > 0;
    });

    if (hasResults) {
        let totalW = 0, totalL = 0, totalD = 0;
        for (const rec of Object.values(results[name])) {
            totalW += rec.wins; totalL += rec.losses; totalD += rec.draws;
        }
        const played  = totalW + totalL + totalD;
        const winPct  = played > 0 ? totalW / played * 100 : 0;
        const tier    = _getTier(winPct);
        const badgeR  = 13;
        const badgeX  = avX + avR * 0.68;
        const badgeY  = avY - avR * 0.68;

        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = tier.color;
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold 12px system-ui, sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.fillText(tier.label, badgeX, badgeY);
        ctx.textBaseline = 'alphabetic';
    }

    curY += avR + 14;

    //  Name 
    let nameFontSize = Math.min(cssW * 0.072, 24);
    ctx.textAlign = 'center';
    ctx.font = `bold ${nameFontSize}px system-ui, sans-serif`;
    while (ctx.measureText(def.name).width > useW && nameFontSize > 13) {
        nameFontSize--;
        ctx.font = `bold ${nameFontSize}px system-ui, sans-serif`;
    }
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(def.name, cssW / 2, curY);
    curY += nameFontSize + 2;

    if (def.player) {
        ctx.font = `italic ${Math.round(nameFontSize * 0.68)}px system-ui, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(def.player, cssW / 2, curY);
        curY += Math.round(nameFontSize * 0.68) + 4;
    }
    curY += 10;

    //  Win / Loss Summary 
    if (hasResults) {
        let totalW = 0, totalL = 0, totalD = 0;
        for (const rec of Object.values(results[name])) {
            totalW += rec.wins; totalL += rec.losses; totalD += rec.draws;
        }
        const played  = totalW + totalL + totalD;
        const winPct  = played > 0 ? (totalW / played * 100).toFixed(1) : '0.0';

        _drawRoundRect(ctx, pad, curY, useW, 32, 6, '#1e293b', null);

        const colW = useW / 3;
        const pillY = curY + 16;
        ctx.textAlign = 'center';

        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillStyle = '#4ade80';
        ctx.fillText(totalW, pad + colW * 0.5, pillY);
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('W', pad + colW * 0.5, pillY + 12);

        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillStyle = '#f87171';
        ctx.fillText(totalL, pad + colW * 1.5, pillY);
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('L', pad + colW * 1.5, pillY + 12);

        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillStyle = '#f1f5f9';
        ctx.fillText(winPct + '%', pad + colW * 2.5, pillY);
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('WIN%', pad + colW * 2.5, pillY + 12);

        curY += 46;
    }

    // Divider
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, curY);
    ctx.lineTo(cssW - pad, curY);
    ctx.stroke();
    curY += 10;

    //  Stat Bars 
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.fillText('STATS', pad, curY);
    curY += 14;

    const barRows = [
        { label: 'HP',  value: def.hp,     max: MAX_HP,  color: '#22c55e',  valStr: String(def.hp) },
        { label: 'SPD', value: def.speed,  max: MAX_SPD, color: '#06b6d4',  valStr: String(def.speed) },
        { label: 'DMG', value: def.damage, max: MAX_DMG, color: null,       valStr: String(def.damage) },
        { label: 'MASS', value: def.mass,  max: MAX_MASS, color: '#a78bfa', valStr: String(def.mass) },
        { label: 'RAD', value: def.r,      max: MAX_RADIUS, color: '#facc15', valStr: String(def.r) },
    ];
    const labelW = 36;
    const valW   = 34;
    const barH   = 7;
    const barX   = pad + labelW + 4;
    const barMaxW = useW - labelW - 4 - valW - 4;

    for (const row of barRows) {
        const fillFrac = Math.min(1, row.value / row.max);
        const fillW    = Math.max(4, fillFrac * barMaxW);

        // Label
        ctx.textAlign = 'left';
        ctx.font = `bold 11px system-ui, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(row.label, pad, curY + barH - 1);

        // Track
        _drawRoundRect(ctx, barX, curY, barMaxW, barH, 3, '#1e293b', null);

        // Fill
        if (row.color) {
            ctx.fillStyle = row.color;
        } else {
            const g = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
            g.addColorStop(0, '#f97316');
            g.addColorStop(1, '#ef4444');
            ctx.fillStyle = g;
        }
        _drawRoundRect(ctx, barX, curY, fillW, barH, 3, ctx.fillStyle, null);

        // Value
        ctx.textAlign = 'right';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = row.color ?? '#f87171';
        ctx.fillText(row.valStr, cssW - pad, curY + barH - 1);

        curY += barH + 10;
    }
    curY += 4;

    // Divider
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, curY);
    ctx.lineTo(cssW - pad, curY);
    ctx.stroke();
    curY += 10;

    //  Ability 
    ctx.textAlign = 'left';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('ABILITY', pad, curY);
    curY += 14;

    ctx.font = `bold 13px system-ui, sans-serif`;
    ctx.fillStyle = def.color;
    ctx.fillText(def.ability, pad, curY);
    curY += 17;

    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    const linesDrawn = _wrapText(ctx, def.desc, pad, curY, useW, 17, 4);
    curY += linesDrawn * 17 + 10;

    // Divider
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, curY);
    ctx.lineTo(cssW - pad, curY);
    ctx.stroke();
    curY += 10;

    //  Matchups 
    if (!hasResults) {
        ctx.textAlign = 'center';
        ctx.font = 'italic 12px system-ui, sans-serif';
        ctx.fillStyle = '#475569';
        const remainY = curY + (cssH - curY) / 2;
        ctx.fillText('Run simulation to see matchup data', cssW / 2, remainY);
        return;
    }

    const matchups = Object.entries(results[name])
        .map(([opp, rec]) => {
            const total = rec.wins + rec.losses + rec.draws;
            return { opp, winPct: total > 0 ? rec.wins / total : null, total };
        })
        .filter(m => m.winPct !== null);

    const best  = [...matchups].sort((a, b) => b.winPct - a.winPct || b.total - a.total).slice(0, 3);
    const worst = [...matchups].sort((a, b) => a.winPct - b.winPct || b.total - a.total).slice(0, 3);

    const dotR    = 5;
    const nameWid = Math.min(useW * 0.34, 90);
    const pctLblW = 36;
    const mBarX   = pad + dotR * 2 + 6 + nameWid + 6;
    const mBarMaxW = useW - (dotR * 2 + 6 + nameWid + 6 + pctLblW + 4);

    function drawMatchupSection(label, rows, barColorA, barColorB) {
        if (curY + 14 > cssH - 4) return;
        ctx.textAlign = 'left';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(label, pad, curY);
        curY += 14;

        for (const m of rows) {
            if (curY + 20 > cssH - 4) break;
            const oppDef  = baseBalls.find(d => d.name === m.opp);
            const dotColor = oppDef?.color ?? '#64748b';

            // Color dot
            ctx.beginPath();
            ctx.arc(pad + dotR, curY + 7, dotR, 0, Math.PI * 2);
            ctx.fillStyle = dotColor;
            ctx.fill();

            // Opponent name (truncated)
            ctx.textAlign = 'left';
            ctx.font = '11px system-ui, sans-serif';
            ctx.fillStyle = '#e2e8f0';
            let oppName = m.opp;
            const nameStart = pad + dotR * 2 + 6;
            while (oppName.length > 1 && ctx.measureText(oppName).width > nameWid) {
                oppName = oppName.slice(0, -1);
            }
            if (oppName !== m.opp) oppName += 'â€¦';
            ctx.fillText(oppName, nameStart, curY + 10);

            // Bar
            const fillFrac = m.winPct;
            const fillW    = Math.max(3, fillFrac * mBarMaxW);
            _drawRoundRect(ctx, mBarX, curY + 3, mBarMaxW, 8, 3, '#1e293b', null);
            const bg = ctx.createLinearGradient(mBarX, 0, mBarX + fillW, 0);
            bg.addColorStop(0, barColorA);
            bg.addColorStop(1, barColorB);
            _drawRoundRect(ctx, mBarX, curY + 3, fillW, 8, 3, bg, null);

            // Win%
            ctx.textAlign = 'right';
            ctx.font = '11px system-ui, sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(Math.round(m.winPct * 100) + '%', cssW - pad, curY + 11);

            curY += 22;
        }
        curY += 6;
    }

    drawMatchupSection('BEST MATCHUPS',  best,  '#16a34a', '#4ade80');
    drawMatchupSection('WORST MATCHUPS', worst, '#dc2626', '#f87171');
}

function _renderH2H(results, defs) {
    let html = `<table style="border-collapse:collapse;font-size:clamp(8px,0.8vw,12px)">
      <thead><tr><th style="padding:4px"></th>`;

    for (const d of defs) {
        html += `<th style="padding:2px 4px;color:#94a3b8;writing-mode:vertical-lr;transform:rotate(180deg);max-width:20px;white-space:nowrap">${d.name}</th>`;
    }
    html += `</tr></thead><tbody>`;

    for (const rDef of defs) {
        html += `<tr><td style="padding:4px 8px;color:#94a3b8;white-space:nowrap;font-weight:600">${rDef.name}</td>`;
        for (const cDef of defs) {
            if (rDef.name === cDef.name) {
                html += `<td style="background:#0f172a;padding:4px 6px;text-align:center;color:#334155">â€”</td>`;
            } else {
                const cell  = results[rDef.name]?.[cDef.name];
                const total = (cell?.wins ?? 0) + (cell?.losses ?? 0) + (cell?.draws ?? 0);
                if (total === 0) {
                    html += `<td style="background:#1e293b;padding:4px 6px;text-align:center;color:#64748b">?</td>`;
                } else {
                    const wr = Math.round(cell.wins / total * 100);
                    const bg = wr >= 60 ? '#14532d' : wr <= 40 ? '#450a0a' : '#1e293b';
                    html += `<td style="background:${bg};padding:4px 6px;text-align:center;color:#f1f5f9">${wr}%</td>`;
                }
            }
        }
        html += `</tr>`;
    }

    html += `</tbody></table>`;
    document.getElementById('sim-h2h-table').innerHTML = html;
}
