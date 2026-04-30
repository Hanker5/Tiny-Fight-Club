import { state }                                      from './state.js';
import { baseBalls }                                  from './data.js';
import { Ball }                                       from './entities.js';
import { resolveCollision, resolveObstacleCollision } from './systems.js';
import { pauseForSim, resumeFromSim,
         VIRTUAL_W, VIRTUAL_H, OBSTACLES }            from './game.js';

const SIM_DT          = 1 / 60;
const STEPS_PER_CHUNK = 360;   // ~6 sim-seconds per chunk; keeps tasks well under 5ms
const MAX_STEPS       = 7200;  // 120 sim-seconds hard cap per match
const MARGIN          = 120;

// ─── SimEngine ────────────────────────────────────────────────────────────────

class SimEngine {
    constructor(defs, matchesPerPair) {
        this.defs           = defs;
        this.matchesPerPair = matchesPerPair;
        this._aborted       = false;
        this._onProgress    = null;
        this._onComplete    = null;

        // results[nameA][nameB] = { wins, losses } from A's perspective
        this.results = {};
        for (const a of defs) {
            this.results[a.name] = {};
            for (const b of defs) {
                if (a.name !== b.name)
                    this.results[a.name][b.name] = { wins: 0, losses: 0 };
            }
        }

        // Build shuffled queue of all unique pairings × matchesPerPair
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
        state.trails        = [];
        state.boomerangs    = [];
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
                    // Sudden death ensures a winner — higher HP wins
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

        // Sudden death — mirrors game.js:246-262
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

        // Ball updates — mirrors game.js:268-275
        for (const ball of state.balls.filter(b => b.hp > 0)) {
            const opponents = state.balls.filter(b => b.team !== ball.team && b.hp > 0);
            if (!opponents.length) continue;
            const nearest = opponents.reduce((a, b) =>
                Math.hypot(b.x - ball.x, b.y - ball.y) <
                Math.hypot(a.x - ball.x, a.y - ball.y) ? b : a
            );
            ball.update(nearest, VIRTUAL_W, VIRTUAL_H, dt);
        }

        // Ball-vs-ball collisions (opposing teams only) — game.js:278-285
        const aliveBalls = state.balls.filter(b => b.hp > 0);
        for (let i = 0; i < aliveBalls.length; i++) {
            for (let j = i + 1; j < aliveBalls.length; j++) {
                if (aliveBalls[i].team !== aliveBalls[j].team) {
                    resolveCollision(aliveBalls[i], aliveBalls[j]);
                }
            }
        }

        // Obstacle collisions — game.js:288-290
        for (const ball of aliveBalls) {
            state.obstacles.forEach(obs => resolveObstacleCollision(ball, obs));
        }

        // Trail wall + DoT — game.js:293-304
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

        // Portals — game.js:307
        state.portals.forEach(p => p.update(state.balls, dt));

        // Boomerangs — game.js:310-316
        state.boomerangs.forEach(blade => {
            if (blade.target.hp <= 0) {
                const alt = state.balls.find(b => b.team !== blade.source.team && b.hp > 0);
                if (alt) blade.target = alt; else { blade._catch(); return; }
            }
            blade.update(dt);
        });

        // Projectiles — game.js:319-325
        state.projectiles.forEach(p => {
            if (p.target && p.target.hp <= 0) {
                const alt = state.balls.find(b => b.team !== p.source.team && b.hp > 0);
                if (alt) p.target = alt; else { p.active = false; return; }
            }
            p.update(dt);
        });

        // Hazards — game.js:331-334
        state.hazards.forEach(h => {
            const opponents = state.balls.filter(b => b.team !== h.source.team && b.hp > 0);
            opponents.forEach(opp => h.update(opp, dt));
        });

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

        // Minion cleanup — game.js:337
        state.balls = state.balls.filter(b => !(b.isMinion && b.master && b.master.hp <= 0));

        // Array prune — game.js:340-346
        state.trails        = state.trails.filter(t => t.active);
        state.boomerangs    = state.boomerangs.filter(b => b.active);
        state.portals       = state.portals.filter(p => p.active);
        state.projectiles   = state.projectiles.filter(p => p.active);
        state.hazards       = state.hazards.filter(h => h.active);

        // Clear visual-only arrays (no game effect, prevent unbounded growth)
        state.particles     = [];
        state.floatingTexts = [];
        state.confetti      = [];
    }
}

// ─── SimUI ────────────────────────────────────────────────────────────────────

let _engine = null;

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
}

function _closePanel() {
    if (_engine) { _engine.abort(); _engine = null; }

    const overlay = document.getElementById('sim-overlay');
    overlay.style.display = 'none';
    overlay.classList.add('hidden');

    resumeFromSim();
}

function _startRun() {
    if (_engine) { _engine.abort(); }

    const matchesPerPair = Math.max(1, parseInt(document.getElementById('sim-matches-input').value, 10) || 20);
    const defs = baseBalls;

    document.getElementById('sim-run-btn').disabled        = true;
    document.getElementById('sim-status').textContent      = 'Running…';
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
    _renderResults(results, _engine.defs);
    _renderH2H(results, _engine.defs);
}

function _renderResults(results, defs) {
    const rows = defs.map(def => {
        let wins = 0, losses = 0, draws = 0;
        for (const rec of Object.values(results[def.name] ?? {})) {
            wins   += rec.wins;
            losses += rec.losses;
            draws  += rec.draws;
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
        <th style="padding:6px 8px;text-align:right">D</th>
        <th style="padding:6px 8px;text-align:right">Win%</th>
        <th style="padding:6px 4px;min-width:80px"></th>
      </tr></thead><tbody>`;

    rows.forEach((r, i) => {
        const pct    = r.winRate ?? 0;
        const pctStr = r.winRate !== null ? pct.toFixed(1) + '%' : '—';
        const color  = pct >= 55 ? '#4ade80' : pct <= 45 ? '#f87171' : '#f1f5f9';
        html += `<tr style="border-bottom:1px solid #1e293b">
          <td style="padding:5px 8px;color:#64748b">${i + 1}</td>
          <td style="padding:5px 8px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${r.def.color};margin-right:6px;vertical-align:middle"></span>
            <span style="color:#f1f5f9;font-weight:600">${r.def.name}</span>
          </td>
          <td style="padding:5px 8px;color:#818cf8">${r.def.ability}</td>
          <td style="padding:5px 8px;text-align:right;color:#4ade80">${r.wins}</td>
          <td style="padding:5px 8px;text-align:right;color:#f87171">${r.losses}</td>
          <td style="padding:5px 8px;text-align:right;color:#94a3b8">${r.draws}</td>
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
                html += `<td style="background:#0f172a;padding:4px 6px;text-align:center;color:#334155">—</td>`;
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
