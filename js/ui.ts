// @ts-nocheck — pre-existing JS DOM patterns; typed incrementally
import { state } from './state';
import { emitter } from './events';
import { getSwissSortedStandings } from './game';

// â”€â”€â”€ Event subscriptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// game.js imports this module for side-effects; these handlers fire automatically
// when the simulation emits events.

emitter.on('match:start', ({ ball1, ball2, round }) => {
    const rName = round === -1 ? 'Quick Fight'
        : state.tournamentFormat === 'SWISS'
            ? `Swiss — Round ${state.swissRound + 1} of ${state.swissSettings?.numRounds}`
            : ['Round of 16', 'Quarterfinals', 'Semifinals', 'Finals'][round];
    const mh    = document.getElementById('match-header');

    const p1Display = ball1.def.player || ball1.name;
    const p2Display = ball2.def.player || ball2.name;
    const showSub   = ball1.def.player || ball2.def.player;
    const subHtml   = showSub
        ? `<div class="text-center" style="font-size:clamp(9px,0.9vw,14px);color:#64748b;font-weight:500;margin-top:2px">
               ${ball1.def.player ? ball1.name : ''}
               ${ball1.def.player && ball2.def.player ? '<span style="margin:0 6px">vs</span>' : ''}
               ${ball2.def.player ? ball2.name : ''}
           </div>`
        : '';

    mh.innerHTML = `
        <span class="text-slate-400 text-sm block -mt-1 mb-1">${rName}</span>
        <span style="color:${ball1.color}">${p1Display}</span>
        <span class="text-slate-500 mx-2 text-3xl">VS</span>
        <span style="color:${ball2.color}">${p2Display}</span>
        ${subHtml}`;
    mh.classList.remove('hidden');
    document.getElementById('match-timer').classList.remove('hidden');
    document.getElementById('speed-btn').classList.remove('hidden');
    if (round !== -1) {
        if (state.tournamentFormat === 'SWISS') renderSwissStandings();
        else renderBracket();
    }
});

emitter.on('match:end', ({ custom } = {}) => {
    if (!custom) {
        if (state.tournamentFormat === 'SWISS') renderSwissStandings();
        else renderBracket();
        renderRoster();
    }
    document.getElementById('match-header').classList.add('hidden');
    document.getElementById('match-timer').classList.add('hidden');
    document.getElementById('speed-btn').classList.add('hidden');
});

export function updateMatchTimer(matchTime, suddenDeath) {
    const el = document.getElementById('match-timer');
    if (!el) return;
    if (suddenDeath) {
        el.textContent = 'SUDDEN DEATH';
        el.style.color = '#ef4444';
        el.style.borderColor = '#ef4444';
    } else {
        const remaining = Math.max(0, 60 - matchTime);
        const mins = Math.floor(remaining / 60);
        const secs = Math.floor(remaining % 60);
        el.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
        el.style.color = remaining <= 10 ? '#f87171' : '#f1f5f9';
        el.style.borderColor = remaining <= 10 ? '#f87171' : '';
    }
}

export function showOverlay(title, desc, btnText, action, color = 'white') {
    const overlay = document.getElementById('overlay');
    const t = document.getElementById('overlay-title');
    t.innerText = title;
    t.style.color = color;
    document.getElementById('overlay-desc').innerText = desc;
    const btn = document.getElementById('start-btn');
    btn.innerText = btnText;
    btn.onclick = action;
    const quickBtn = document.getElementById('quick-fight-btn');
    if (quickBtn) quickBtn.classList.add('hidden');
    const simBtn = document.getElementById('sim-btn');
    if (simBtn) simBtn.classList.add('hidden');
    overlay.classList.remove('hidden');
    overlay.style.opacity = '1';
}

export function showCustomResultOverlay(winner, onFightAgain, onChange, onMenu) {
    const overlay = document.getElementById('overlay');
    const title = document.getElementById('overlay-title');
    const desc = document.getElementById('overlay-desc');
    const startBtn = document.getElementById('start-btn');
    const quickBtn = document.getElementById('quick-fight-btn');

    title.innerText = `${winner.name} Wins!`;
    title.style.color = winner.color;
    desc.innerText = 'Run it back, pick a new matchup, or return to the main menu.';

    startBtn.innerText = 'Fight Again';
    startBtn.onclick = onFightAgain;

    quickBtn.innerText = 'Change Fighters';
    quickBtn.onclick = onChange;
    quickBtn.classList.remove('hidden');
    const simBtn = document.getElementById('sim-btn');
    if (simBtn) simBtn.classList.add('hidden');

    let menuBtn = document.getElementById('menu-btn');
    if (!menuBtn) {
        menuBtn = document.createElement('button');
        menuBtn.id = 'menu-btn';
        menuBtn.className = 'bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-full transition-all transform hover:scale-105 active:scale-95';
        menuBtn.style.cssText = 'font-size: clamp(11px, 1.4vw, 22px); padding: clamp(6px, 0.6vw, 12px) clamp(14px, 1.6vw, 28px)';
        quickBtn.parentElement.appendChild(menuBtn);
    }
    menuBtn.innerText = 'Back to Menu';
    menuBtn.onclick = onMenu;
    menuBtn.classList.remove('hidden');

    overlay.classList.remove('hidden');
    overlay.style.opacity = '1';
}

export function hideOverlay() {
    const overlay = document.getElementById('overlay');
    overlay.style.opacity = '0';
    setTimeout(() => overlay.classList.add('hidden'), 300);
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.classList.add('hidden');
}

export function renderBracket() {
    const container = document.getElementById('bracket-container');
    // Restore Swiss overrides
    container.classList.add('p-4', 'items-center');

    // No min-width â€” match boxes flex to fill available panel space
    let html = `<div class="flex h-full w-full min-w-0">`;

    for (let r = 0; r < 4; r++) {
        html += `<div class="flex-1 min-w-0 flex flex-col justify-around px-1 relative ${r < 3 ? 'border-r border-slate-700/50' : ''}">`;

        for (let m = 0; m < state.bracket[r].length; m++) {
            const match = state.bracket[r][m];
            const isActive  = (r === state.currentRound && m === state.currentMatch && state.gameState !== 'BRACKET');
            const isWaiting = (r === state.currentRound && m === state.currentMatch && state.gameState === 'BRACKET');

            let borderClass = 'border-slate-700';
            if (isActive)       borderClass = 'border-yellow-400 glow ring-2 ring-yellow-400/50';
            else if (isWaiting) borderClass = 'border-blue-400 glow';

            html += `<div class="bg-slate-800 rounded-lg p-1.5 border-2 ${borderClass} flex flex-col gap-0.5 shadow-md z-10 my-0.5">`;

            const p1C = match.p1 ? match.p1.color : '#475569';
            const p1N = match.p1 ? (match.p1.player || match.p1.name) : 'TBD';
            const p1W = match.winner === match.p1 ? 'font-black text-white' : (match.winner ? 'text-slate-600 line-through' : 'text-slate-300 font-semibold');
            html += `<div class="flex items-center gap-1 text-xs ${p1W}"><div class="w-2 h-2 rounded-full flex-shrink-0" style="background:${p1C}"></div><span class="truncate">${p1N}</span></div>`;

            const p2C = match.p2 ? match.p2.color : '#475569';
            const p2N = match.p2 ? (match.p2.player || match.p2.name) : 'TBD';
            const p2W = match.winner === match.p2 ? 'font-black text-white' : (match.winner ? 'text-slate-600 line-through' : 'text-slate-300 font-semibold');
            html += `<div class="flex items-center gap-1 text-xs ${p2W}"><div class="w-2 h-2 rounded-full flex-shrink-0" style="background:${p2C}"></div><span class="truncate">${p2N}</span></div>`;

            html += `</div>`;
        }
        html += `</div>`;
    }

    // Champion column â€” scales with panel via clamp
    const champC = state.tourneyWinner ? state.tourneyWinner.color : '#475569';
    const champN = state.tourneyWinner ? (state.tourneyWinner.player || state.tourneyWinner.name) : '???';
    const champClass = state.tourneyWinner
        ? 'border-yellow-400 glow ring-2 ring-yellow-400 font-black text-white'
        : 'border-slate-700 text-slate-500';
    html += `<div class="flex-none flex flex-col justify-center px-1" style="width: clamp(70px, 8vw, 120px)">
                <div class="bg-slate-800 rounded-lg p-2 text-center border-2 ${champClass} shadow-lg w-full">
                    <div class="uppercase tracking-widest text-yellow-500 mb-1" style="font-size: clamp(7px, 0.6vw, 11px)">Champion</div>
                    <div class="mx-auto rounded-full mb-1 shadow" style="background:${champC}; width: clamp(14px, 1.5vw, 24px); height: clamp(14px, 1.5vw, 24px)"></div>
                    <div class="truncate" style="font-size: clamp(9px, 0.75vw, 14px)">${champN}</div>
                </div>
             </div></div>`;

    container.innerHTML = html;
}

export function renderRoster() {
    const container = document.getElementById('roster-container');

    let html = `<h3 class="text-slate-400 font-bold mb-3 uppercase tracking-wider" style="font-size: clamp(11px, 1.3vw, 24px)">Active Fighters</h3><div class="space-y-3">`;

    let fighters = [];
    if (state.tourneyWinner || state.swissChampion) {
        fighters = [state.tourneyWinner || state.swissChampion];
    } else if (state.tournamentFormat === 'SWISS') {
        const match = state.swissPairings?.[state.swissCurrentMatch];
        if (match) {
            fighters.push(match.p1);
            if (match.p2) fighters.push(match.p2);
        }
    } else if (state.bracket[state.currentRound]?.[state.currentMatch]) {
        const match = state.bracket[state.currentRound][state.currentMatch];
        if (match.p1) fighters.push(match.p1);
        if (match.p2) fighters.push(match.p2);
    }

    fighters.forEach(b => {
        const avatarSize  = 'clamp(32px, 3.5vw, 56px)';
        const nameSize    = 'clamp(13px, 1.6vw, 28px)';
        const badgeSize   = 'clamp(9px,  0.8vw, 14px)';
        const descSize    = 'clamp(10px, 1.05vw, 19px)';
        const statsSize   = 'clamp(9px,  0.9vw, 17px)';
        const playerLine  = b.player
            ? `<div class="text-slate-500 font-medium" style="font-size:${badgeSize}">${b.player}</div>`
            : '';

        html += `<div class="flex items-start gap-3 bg-slate-800/80 p-3 rounded-lg border border-slate-700 shadow-md">
                    <div class="rounded-full flex-shrink-0 shadow-inner border-2 border-slate-900"
                         style="background:${b.color}; width:${avatarSize}; height:${avatarSize}; min-width:${avatarSize}"></div>
                    <div class="min-w-0">
                        <div class="font-bold text-slate-100 leading-tight" style="font-size:${nameSize}">
                            ${b.name}
                            <span class="uppercase font-bold text-indigo-400 bg-indigo-900/50 rounded ml-2 px-1.5 py-0.5 align-middle" style="font-size:${badgeSize}">${b.ability}</span>
                        </div>
                        ${playerLine}
                        <div class="text-slate-400 mt-1 leading-snug" style="font-size:${descSize}">${b.desc}</div>
                        <div class="text-slate-500 mt-2 flex gap-4 font-semibold" style="font-size:${statsSize}">
                            <span><span class="text-slate-400">HP:</span> ${b.hp}</span>
                            <span><span class="text-slate-400">DMG:</span> ${b.damage}</span>
                            <span><span class="text-slate-400">SPD:</span> ${b.speed}</span>
                        </div>
                    </div>
                 </div>`;
    });

    if (fighters.length === 0 && !state.tourneyWinner) {
        html += `<div class="text-slate-500 italic p-3" style="font-size: clamp(11px, 1.3vw, 22px)">Waiting for combatants...</div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

// â”€â”€â”€ Tournament Builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function showBuilder(allDefs, onStart, onBack, requiredCount = 16) {
    const overlay  = document.getElementById('builder-overlay');
    const grid     = document.getElementById('builder-grid');
    const counter  = document.getElementById('builder-counter');
    const startBtn = document.getElementById('builder-start-btn');
    const randomBtn = document.getElementById('builder-random-btn');
    const backBtn = document.getElementById('builder-back-btn');
    const title = overlay.querySelector('h2');

    const flexibleMode = requiredCount === 0;

    title.textContent = 'Select Your Fighters';
    randomBtn.classList.remove('hidden');
    randomBtn.textContent = flexibleMode ? 'Random 8' : `Random ${requiredCount}`;
    startBtn.textContent = flexibleMode ? 'Start Swiss' : (requiredCount === 16 ? 'Start Tournament' : `Start (${requiredCount} fighters)`);

    let selected = new Set();

    function renderCards() {
        grid.innerHTML = allDefs.map((def, i) => {
            const isSel = selected.has(i);
            const playerLine = def.player
                ? `<div style="font-size:11px;color:#64748b;margin-bottom:2px">${def.player}</div>`
                : '';
            return `<div class="builder-card select-none cursor-pointer rounded-lg border-2 p-2 transition-all"
                        style="background:${isSel ? '#1e1b4b' : '#1e293b'};border-color:${isSel ? '#818cf8' : '#334155'}"
                        data-idx="${i}">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                    <div style="width:16px;height:16px;border-radius:50%;background:${def.color};flex-shrink:0;border:1px solid #0f172a"></div>
                    <span style="font-weight:700;color:#f1f5f9;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${def.name}</span>
                </div>
                ${playerLine}
                <div style="font-size:10px;color:#818cf8;font-weight:600;margin-bottom:3px">${def.ability}</div>
                <div style="font-size:10px;color:#64748b;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${def.desc}</div>
                <div style="font-size:10px;color:#475569;margin-top:4px;display:flex;gap:8px">
                    <span>HP:${def.hp}</span><span>DMG:${def.damage}</span><span>SPD:${def.speed}</span>
                </div>
            </div>`;
        }).join('');

        grid.querySelectorAll('.builder-card').forEach(card => {
            card.addEventListener('click', () => {
                const idx = Number(card.dataset.idx);
                if (selected.has(idx)) {
                    selected.delete(idx);
                } else if (flexibleMode || selected.size < requiredCount) {
                    selected.add(idx);
                }
                updateUI();
            });
        });
    }

    function updateUI() {
        renderCards();
        const n = selected.size;
        if (flexibleMode) {
            counter.textContent = `${n} selected`;
            counter.style.color = n >= 2 ? '#4ade80' : '#94a3b8';
        } else {
            counter.textContent = `${n} / ${requiredCount} selected`;
            counter.style.color = n === requiredCount ? '#4ade80' : '#94a3b8';
        }
        const ready = flexibleMode ? n >= 2 : n === requiredCount;
        startBtn.disabled = !ready;
        startBtn.style.opacity = ready ? '1' : '0.4';
        startBtn.style.cursor = ready ? 'pointer' : 'not-allowed';
    }

    randomBtn.onclick = () => {
        const fillCount = flexibleMode ? 8 : requiredCount;
        const shuffled = [...allDefs.keys()].sort(() => Math.random() - 0.5).slice(0, fillCount);
        selected = new Set(shuffled);
        updateUI();
    };

    backBtn.onclick = () => {
        hideBuilder();
        onBack();
    };

    startBtn.onclick = () => {
        if (flexibleMode ? selected.size < 2 : selected.size !== requiredCount) return;
        const pickedDefs = [...selected].map(i => allDefs[i]);
        hideBuilder();
        onStart(pickedDefs);
    };

    selected.clear();
    updateUI();
    overlay.classList.remove('hidden');
}

export function hideBuilder() {
    const overlay = document.getElementById('builder-overlay');
    if (overlay) overlay.classList.add('hidden');
}

export function showQuickFightPicker(allDefs, onStart, onBack) {
    const overlay  = document.getElementById('builder-overlay');
    const grid     = document.getElementById('builder-grid');
    const counter  = document.getElementById('builder-counter');
    const startBtn = document.getElementById('builder-start-btn');
    const randomBtn = document.getElementById('builder-random-btn');
    const backBtn = document.getElementById('builder-back-btn');
    const title = overlay.querySelector('h2');

    let selected = new Set();

    title.textContent = 'Choose Quick Fight';
    randomBtn.classList.remove('hidden');
    randomBtn.textContent = 'Random 2';
    startBtn.textContent = 'Fight!';

    function renderCards() {
        grid.innerHTML = allDefs.map((def, i) => {
            const isSel = selected.has(i);
            const playerLine = def.player
                ? `<div style="font-size:11px;color:#64748b;margin-bottom:2px">${def.player}</div>`
                : '';
            const check = isSel
                ? `<div style="margin-left:auto;color:#bbf7d0;font-weight:900;font-size:14px">&check;</div>`
                : '';
            return `<div class="builder-card select-none cursor-pointer rounded-lg border-2 p-2 transition-all"
                        style="background:${isSel ? '#052e2b' : '#1e293b'};border-color:${isSel ? '#2dd4bf' : '#334155'};box-shadow:${isSel ? '0 0 18px rgba(45,212,191,0.35)' : 'none'}"
                        data-idx="${i}">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                    <div style="width:16px;height:16px;border-radius:50%;background:${def.color};flex-shrink:0;border:1px solid #0f172a"></div>
                    <span style="font-weight:700;color:#f1f5f9;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${def.name}</span>
                    ${check}
                </div>
                ${playerLine}
                <div style="font-size:10px;color:#2dd4bf;font-weight:600;margin-bottom:3px">${def.ability}</div>
                <div style="font-size:10px;color:#64748b;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${def.desc}</div>
                <div style="font-size:10px;color:#475569;margin-top:4px;display:flex;gap:8px">
                    <span>HP:${def.hp}</span><span>DMG:${def.damage}</span><span>SPD:${def.speed}</span>
                </div>
            </div>`;
        }).join('');

        grid.querySelectorAll('.builder-card').forEach(card => {
            card.addEventListener('click', () => {
                const idx = Number(card.dataset.idx);
                if (selected.has(idx)) {
                    selected.delete(idx);
                } else if (selected.size < 2) {
                    selected.add(idx);
                }
                updateUI();
            });
        });
    }

    function updateUI() {
        renderCards();
        const n = selected.size;
        counter.textContent = `${n} / 2 selected`;
        counter.style.color = n === 2 ? '#4ade80' : '#94a3b8';
        const ready = n === 2;
        startBtn.disabled = !ready;
        startBtn.style.opacity = ready ? '1' : '0.4';
        startBtn.style.cursor = ready ? 'pointer' : 'not-allowed';
    }

    randomBtn.onclick = () => {
        selected = new Set([...allDefs.keys()].sort(() => Math.random() - 0.5).slice(0, 2));
        updateUI();
    };

    backBtn.onclick = () => {
        hideBuilder();
        onBack();
    };

    startBtn.onclick = () => {
        if (selected.size !== 2) return;
        const pickedDefs = [...selected].map(i => allDefs[i]);
        hideBuilder();
        onStart(pickedDefs[0], pickedDefs[1]);
    };

    updateUI();
    hideOverlay();
    overlay.classList.remove('hidden');
}


// ─── SWISS UI ──────────────────────────────────────────────────────────────────

export function showSwissSettingsOverlay(onConfirm, onCancel) {
    const overlay = document.getElementById('swiss-settings-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');

    const confirmBtn = document.getElementById('swiss-confirm-btn');
    const cancelBtn  = document.getElementById('swiss-cancel-btn');

    confirmBtn.onclick = () => {
        const numRounds = Math.max(1, parseInt((document.getElementById('swiss-num-rounds') as HTMLInputElement).value) || 3);
        const bestOf    = parseInt((document.getElementById('swiss-best-of') as HTMLSelectElement).value) as 1 | 3 | 5 || 1;
        overlay.classList.add('hidden');
        onConfirm({ numRounds, bestOf });
    };

    cancelBtn.onclick = () => {
        overlay.classList.add('hidden');
        onCancel();
    };
}

export function renderSwissStandings() {
    const container = document.getElementById('bracket-container');
    if (!container) return;

    // Remove Tailwind padding/centering so Swiss content fills the full area
    container.classList.remove('p-4', 'items-center');

    const isComplete = !!state.swissChampion;

    // Hide Active Fighters + Round panels when Swiss is over to give standings more room
    const rosterContainer = document.getElementById('roster-container');
    if (rosterContainer) rosterContainer.style.display = isComplete ? 'none' : '';

    const settings = state.swissSettings;
    const pairings = state.swissPairings || [];
    const round    = state.swissRound;
    const sorted   = getSwissSortedStandings();

    const FLOOR = 1 / 3;
    const all   = state.swissStandings;

    const mwPct  = (s) => { const t = s.matchWins + s.matchLosses; return t === 0 ? FLOOR : Math.max(FLOOR, s.matchWins / t); };
    const gwPct  = (s) => { const t = s.gameWins  + s.gameLosses;  return t === 0 ? FLOOR : Math.max(FLOOR, s.gameWins  / t); };
    const omwPct = (s) => {
        if (!s.opponents.length) return FLOOR;
        const sum = s.opponents.reduce((a, n) => { const o = all.find(x => x.fighter.name === n); return a + (o ? mwPct(o) : FLOOR); }, 0);
        return Math.max(FLOOR, sum / s.opponents.length);
    };

    // Snapshot row positions before re-render (for FLIP animation)
    const oldTops = new Map<string, number>();
    container.querySelectorAll('[data-flip-key]').forEach(el => {
        oldTops.set((el as HTMLElement).dataset.flipKey!, el.getBoundingClientRect().top);
    });

    // ── Standings rows ────────────────────────────────────────────────────────
    const maxPts     = Math.max(...sorted.map(s => s.matchPoints), 1);
    const realPairs  = pairings.filter(m => m.p2 !== null);
    const byePairs   = pairings.filter(m => m.p2 === null);
    const nextIdx    = realPairs.findIndex(m => !m.complete);

    const RANK_COLOR = ['#fbbf24', '#94a3b8', '#cd7f32'] as const;
    const RANK_BG    = ['rgba(251,191,36,0.13)', 'rgba(148,163,184,0.08)', 'rgba(205,127,50,0.08)'] as const;

    const standingRows = sorted.map((s, i) => {
        const inActiveMatch = pairings.some(m => !m.complete && (m.p1?.name === s.fighter.name || m.p2?.name === s.fighter.name));
        const isChamp       = !!state.tourneyWinner && state.tourneyWinner.name === s.fighter.name;
        const rankColor     = RANK_COLOR[i] ?? '#475569';
        const rowBg         = RANK_BG[i] ?? 'transparent';
        const leftBorder    = RANK_COLOR[i] ?? '#1e293b';
        const nameBorder    = RANK_COLOR[i] ? `1px solid ${RANK_COLOR[i]}22` : '1px solid #1e293b';
        const nameColor     = isChamp ? '#fbbf24' : '#f1f5f9';
        const ptsBarPct     = maxPts > 0 ? Math.round((s.matchPoints / maxPts) * 100) : 0;
        const byeBadge      = s.byes > 0
            ? `<span style="font-size:clamp(6px,0.6vw,9px);background:#172554;color:#60a5fa;border-radius:3px;padding:1px 4px;margin-left:4px;vertical-align:middle;letter-spacing:0">BYE</span>`
            : '';

        return `<div data-flip-key="${s.fighter.name}" class="swiss-row" style="
            display:flex;align-items:center;gap:clamp(7px,0.7vw,11px);
            padding:clamp(9px,0.9vw,13px) clamp(8px,0.8vw,12px) clamp(9px,0.9vw,13px) clamp(7px,0.7vw,10px);
            border-radius:8px;margin-bottom:3px;
            background:${rowBg};
            border:${nameBorder};
            border-left:3px solid ${leftBorder};
            position:relative;overflow:hidden
        ">
            <!-- Rank badge -->
            <div style="
                min-width:clamp(22px,2.1vw,30px);height:clamp(22px,2.1vw,30px);
                border-radius:6px;display:flex;align-items:center;justify-content:center;
                background:${rankColor}20;color:${rankColor};
                font-size:clamp(13px,1.3vw,18px);font-weight:900;flex-shrink:0;line-height:1
            ">${i + 1}</div>

            <!-- Color avatar -->
            <div style="
                width:clamp(13px,1.3vw,18px);height:clamp(13px,1.3vw,18px);
                border-radius:50%;background:${s.fighter.color};flex-shrink:0;
                box-shadow:0 0 7px ${s.fighter.color}99
            "></div>

            <!-- Name -->
            <div style="flex:1;min-width:0;overflow:hidden;
                        font-weight:700;font-size:clamp(15px,1.6vw,22px);color:${nameColor};
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${s.fighter.player || s.fighter.name}${byeBadge}
            </div>

            <!-- W / L / OMW% inline stats -->
            <div style="display:flex;align-items:center;gap:clamp(6px,0.6vw,10px);flex-shrink:0">
                <span style="font-size:clamp(14px,1.4vw,19px);font-weight:700;color:#4ade80">${s.matchWins}W</span>
                <span style="font-size:clamp(14px,1.4vw,19px);font-weight:500;color:#475569">${s.matchLosses}L</span>
                <span style="font-size:clamp(12px,1.25vw,17px);color:#64748b;white-space:nowrap">OMW&nbsp;${Math.round(omwPct(s)*100)}%</span>
            </div>

            <!-- Points -->
            <div style="text-align:right;flex-shrink:0;min-width:clamp(38px,3.5vw,52px)">
                <div style="font-size:clamp(18px,1.9vw,26px);font-weight:900;color:${s.matchPoints > 0 ? '#a5b4fc' : '#334155'};line-height:1.1">
                    ${s.matchPoints}
                </div>
                <div style="font-size:clamp(9px,0.85vw,12px);color:#475569;text-transform:uppercase;letter-spacing:0.04em">pts</div>
            </div>

            <!-- Points bar (bottom strip) -->
            <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:#0f172a"></div>
            <div style="position:absolute;bottom:0;left:0;height:2px;background:${rankColor};opacity:0.35;width:${ptsBarPct}%;transition:width 0.5s ease"></div>
        </div>`;
    }).join('');

    // ── Pairing cards ─────────────────────────────────────────────────────────
    const pairCards = realPairs.map((m, i) => {
        const isDone     = m.complete;
        const isNext     = i === nextIdx;
        const w1         = isDone && m.winner?.name === m.p1.name;
        const w2         = isDone && m.winner?.name === m.p2!.name;
        const cardBg     = isNext ? 'rgba(250,204,21,0.06)' : isDone ? '#0d1826' : '#131e2e';
        const cardBorder = isNext ? 'rgba(250,204,21,0.3)'  : isDone ? '#1a2436' : '#253347';
        const nameFs     = 'clamp(14px,1.4vw,19px)';
        const midLabel   = settings && settings.bestOf > 1 && !isDone && (m.p1SeriesWins + m.p2SeriesWins > 0)
            ? `${m.p1SeriesWins}–${m.p2SeriesWins}`
            : 'vs';
        const midColor   = (m.p1SeriesWins + m.p2SeriesWins > 0) ? '#64748b' : '#253347';

        const side = (name, color, won, alignRight) => `
            <div style="flex:1;display:flex;align-items:center;gap:4px;min-width:0;
                        ${alignRight ? 'flex-direction:row-reverse;' : ''}">
                <div style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${color};
                            box-shadow:${won ? `0 0 5px ${color}bb` : 'none'}"></div>
                <span style="font-size:${nameFs};font-weight:${won ? '700' : '500'};
                             color:${won ? '#f1f5f9' : isDone ? '#475569' : '#94a3b8'};
                             overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                             text-decoration:${isDone && !won ? 'line-through' : 'none'};
                             text-decoration-color:#334155;
                             ${alignRight ? 'text-align:right;' : ''}">
                    ${name}
                </span>
                ${won ? `<span style="color:#4ade80;font-size:10px;flex-shrink:0">✓</span>` : ''}
            </div>`;

        return `<div style="
            border-radius:6px;padding:8px 7px;margin-bottom:4px;
            display:flex;align-items:center;gap:5px;
            background:${cardBg};border:1px solid ${cardBorder};
            transition:opacity 0.3s;opacity:${isDone ? '0.5' : '1'}
        ">
            ${side(m.p1.player || m.p1.name, m.p1.color, w1, false)}
            <span style="flex-shrink:0;font-size:clamp(12px,1.1vw,15px);color:${midColor};
                         font-weight:600;letter-spacing:0.03em">${midLabel}</span>
            ${side(m.p2!.player || m.p2!.name, m.p2!.color, w2, true)}
        </div>`;
    }).join('');

    const byeCards = byePairs.map(m => `
        <div style="border-radius:6px;padding:8px 7px;margin-bottom:4px;
                    display:flex;align-items:center;gap:4px;
                    background:#0d1826;border:1px solid #1a2436;opacity:0.45">
            <div style="width:7px;height:7px;border-radius:50%;background:${m.p1.color};flex-shrink:0"></div>
            <span style="font-size:clamp(10px,0.95vw,13px);color:#94a3b8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${m.p1.player || m.p1.name}
            </span>
            <span style="font-size:clamp(7px,0.65vw,9px);background:#1e293b;color:#475569;border-radius:4px;padding:2px 5px;letter-spacing:0.04em">BYE</span>
        </div>`).join('');

    // ── Headers ───────────────────────────────────────────────────────────────
    const boBadge = settings && settings.bestOf > 1
        ? `<span style="background:#1e1b4b;color:#818cf8;font-size:clamp(6px,0.6vw,9px);border-radius:4px;padding:2px 5px;letter-spacing:0.04em">BO${settings.bestOf}</span>`
        : '';
    const hdrStyle = `display:flex;align-items:center;gap:6px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #1e293b`;

    // ── Render ────────────────────────────────────────────────────────────────
    container.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden">

            <!-- Standings — scrollable, takes remaining space -->
            <div style="flex:1;overflow-y:auto;padding:8px 8px 4px 6px;min-height:0">
                <div style="${hdrStyle}">
                    <span style="font-size:clamp(8px,0.75vw,11px);font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#64748b">Standings</span>
                    <span style="font-size:clamp(7px,0.65vw,10px);color:#334155">•</span>
                    <span style="font-size:clamp(8px,0.75vw,11px);color:#475569">Swiss</span>
                    ${boBadge}
                </div>
                ${standingRows}
            </div>

            <!-- Pairings — pinned to bottom, 2-column grid, capped height -->
            ${!isComplete ? `<div style="flex-shrink:0;max-height:46%;overflow-y:auto;
                        padding:6px 8px 6px 6px;border-top:1px solid #131e2e">
                <div style="${hdrStyle};margin-bottom:6px">
                    <span style="font-size:clamp(8px,0.75vw,11px);font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#64748b">Round</span>
                    <span style="font-size:clamp(10px,1vw,15px);font-weight:900;color:#f1f5f9">${round + 1}</span>
                    <span style="font-size:clamp(8px,0.75vw,11px);color:#334155">/ ${settings?.numRounds ?? '?'}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
                    ${pairCards}${byeCards}
                </div>
            </div>` : ''}

        </div>`;

    // ── FLIP animation ────────────────────────────────────────────────────────
    container.querySelectorAll('[data-flip-key]').forEach(el => {
        const key    = (el as HTMLElement).dataset.flipKey!;
        const oldTop = oldTops.get(key);
        if (oldTop === undefined) {
            // New row: fade + slide up from below
            (el as HTMLElement).style.opacity = '0';
            (el as HTMLElement).style.transform = 'translateY(12px)';
            requestAnimationFrame(() => {
                (el as HTMLElement).style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                (el as HTMLElement).style.opacity = '';
                (el as HTMLElement).style.transform = '';
                setTimeout(() => { (el as HTMLElement).style.transition = ''; }, 350);
            });
            return;
        }
        const dy = oldTop - el.getBoundingClientRect().top;
        if (Math.abs(dy) < 0.5) return;
        (el as HTMLElement).style.transition = 'none';
        (el as HTMLElement).style.transform  = `translateY(${dy}px)`;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                (el as HTMLElement).style.transition = 'transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94)';
                (el as HTMLElement).style.transform  = '';
                setTimeout(() => { (el as HTMLElement).style.transition = ''; }, 450);
            });
        });
    });
}
