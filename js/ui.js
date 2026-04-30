import { state } from './state.js';
import { emitter } from './events.js';

// ─── Event subscriptions ──────────────────────────────────────────────────────
// game.js imports this module for side-effects; these handlers fire automatically
// when the simulation emits events.

emitter.on('match:start', ({ ball1, ball2, round }) => {
    const rName = round === -1 ? 'Quick Fight' : ['Round of 16', 'Quarterfinals', 'Semifinals', 'Finals'][round];
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
    if (round !== -1) renderBracket();
});

emitter.on('match:end', ({ custom } = {}) => {
    if (!custom) {
        renderBracket();
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
    if (quickBtn) quickBtn.classList.remove('hidden');
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

    // No min-width — match boxes flex to fill available panel space
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

    // Champion column — scales with panel via clamp
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
    if (state.tourneyWinner) {
        fighters = [state.tourneyWinner];
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

// ─── Tournament Builder ───────────────────────────────────────────────────────

export function showBuilder(allDefs, onStart, onBack) {
    const overlay  = document.getElementById('builder-overlay');
    const grid     = document.getElementById('builder-grid');
    const counter  = document.getElementById('builder-counter');
    const startBtn = document.getElementById('builder-start-btn');
    const randomBtn = document.getElementById('builder-random-btn');
    const backBtn = document.getElementById('builder-back-btn');
    const title = overlay.querySelector('h2');

    title.textContent = 'Select Your Fighters';
    randomBtn.classList.remove('hidden');
    randomBtn.textContent = 'Random 16';
    startBtn.textContent = 'Start Tournament';

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
                } else if (selected.size < 16) {
                    selected.add(idx);
                }
                updateUI();
            });
        });
    }

    function updateUI() {
        renderCards();
        const n = selected.size;
        counter.textContent = `${n} / 16 selected`;
        counter.style.color = n === 16 ? '#4ade80' : '#94a3b8';
        const ready = n === 16;
        startBtn.disabled = !ready;
        startBtn.style.opacity = ready ? '1' : '0.4';
        startBtn.style.cursor = ready ? 'pointer' : 'not-allowed';
    }

    randomBtn.onclick = () => {
        const shuffled = [...allDefs.keys()].sort(() => Math.random() - 0.5).slice(0, 16);
        selected = new Set(shuffled);
        updateUI();
    };

    backBtn.onclick = () => {
        hideBuilder();
        onBack();
    };

    startBtn.onclick = () => {
        if (selected.size !== 16) return;
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

// ─── Leaderboard ──────────────────────────────────────────────────────────────

async function renderLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    container.innerHTML = `<div class="text-slate-500 italic p-3" style="font-size:clamp(11px,1.1vw,18px)">Loading…</div>`;

    try {
        const res  = await fetch('/api/leaderboard');
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();

        const rowSize   = 'clamp(10px, 1.05vw, 18px)';
        const labelSize = 'clamp(9px, 0.85vw, 14px)';

        let html = `<h3 class="text-slate-400 font-bold uppercase tracking-wider mb-2" style="font-size:clamp(11px,1.2vw,20px)">All-Time Wins</h3>`;
        html += `<div class="space-y-1">`;

        data.forEach((entry, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            html += `<div class="flex items-center gap-2 bg-slate-800/60 rounded px-2 py-1 border border-slate-700/50">
                        <span class="text-slate-400 w-6 text-center flex-shrink-0" style="font-size:${labelSize}">${medal}</span>
                        <span class="font-bold text-slate-100 flex-1 truncate" style="font-size:${rowSize}">${entry.name}</span>
                        <span class="text-indigo-400 font-semibold flex-shrink-0" style="font-size:${rowSize}">${entry.wins}W</span>
                     </div>`;
        });

        html += `</div>`;
        container.innerHTML = html;
    } catch {
        container.innerHTML = `<div class="text-slate-500 italic p-3" style="font-size:clamp(11px,1.1vw,18px)">Leaderboard unavailable.</div>`;
    }
}

// Refresh leaderboard whenever the tab becomes visible
window.addEventListener('leaderboard:show', renderLeaderboard);
// Also refresh after each tournament ends
emitter.on('tournament:end', renderLeaderboard);
