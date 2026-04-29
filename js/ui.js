import { state } from './state.js';
import { emitter } from './events.js';

// ─── Event subscriptions ──────────────────────────────────────────────────────
// game.js imports this module for side-effects; these handlers fire automatically
// when the simulation emits events.

emitter.on('match:start', ({ ball1, ball2, round }) => {
    const rName = state.roundLabels[round] ?? `Round ${round + 1}`;
    const mh    = document.getElementById('match-header');
    mh.innerHTML = `<span class="text-slate-400 text-sm block -mt-1 mb-1">${rName}</span><span style="color:${ball1.color}">${ball1.name}</span> <span class="text-slate-500 mx-2 text-3xl">VS</span> <span style="color:${ball2.color}">${ball2.name}</span>`;
    mh.classList.remove('hidden');
    renderBracket();
});

emitter.on('match:end', () => {
    renderBracket();
    renderRoster();
    document.getElementById('match-header').classList.add('hidden');
});

export function showOverlay(title, desc, btnText, action, color = 'white') {
    const overlay = document.getElementById('overlay');
    const t = document.getElementById('overlay-title');
    t.innerText = title;
    t.style.color = color;
    document.getElementById('overlay-desc').innerText = desc;
    const btn = document.getElementById('start-btn');
    btn.innerText = btnText;
    btn.onclick = action;
    overlay.classList.remove('hidden');
    overlay.style.opacity = '1';
}

export function hideOverlay() {
    const overlay = document.getElementById('overlay');
    overlay.style.opacity = '0';
    setTimeout(() => overlay.classList.add('hidden'), 300);
}

export function renderBracket() {
    const container = document.getElementById('bracket-container');

    // No min-width — match boxes flex to fill available panel space
    let html = `<div class="flex h-full w-full min-w-0">`;

    for (let r = 0; r < state.bracket.length; r++) {
        html += `<div class="flex-1 min-w-0 flex flex-col justify-around px-1 relative ${r < state.bracket.length - 1 ? 'border-r border-slate-700/50' : ''}">`;

        for (let m = 0; m < state.bracket[r].length; m++) {
            const match = state.bracket[r][m];
            const isActive  = (r === state.currentRound && m === state.currentMatch && state.gameState !== 'BRACKET');
            const isWaiting = (r === state.currentRound && m === state.currentMatch && state.gameState === 'BRACKET');

            let borderClass = 'border-slate-700';
            if (isActive)       borderClass = 'border-yellow-400 glow ring-2 ring-yellow-400/50';
            else if (isWaiting) borderClass = 'border-blue-400 glow';

            html += `<div class="bg-slate-800 rounded-lg p-1.5 border-2 ${borderClass} flex flex-col gap-0.5 shadow-md z-10 my-0.5">`;

            const p1C = match.p1 ? match.p1.color : '#475569';
            const p1N = match.p1 ? match.p1.name : 'TBD';
            const p1W = match.winner === match.p1 ? 'font-black text-white' : (match.winner ? 'text-slate-600 line-through' : 'text-slate-300 font-semibold');
            html += `<div class="flex items-center gap-1 text-xs ${p1W}"><div class="w-2 h-2 rounded-full flex-shrink-0" style="background:${p1C}"></div><span class="truncate">${p1N}</span></div>`;

            const p2C = match.p2 ? match.p2.color : '#475569';
            const p2N = match.p2 ? match.p2.name : 'TBD';
            const p2W = match.winner === match.p2 ? 'font-black text-white' : (match.winner ? 'text-slate-600 line-through' : 'text-slate-300 font-semibold');
            html += `<div class="flex items-center gap-1 text-xs ${p2W}"><div class="w-2 h-2 rounded-full flex-shrink-0" style="background:${p2C}"></div><span class="truncate">${p2N}</span></div>`;

            html += `</div>`;
        }
        html += `</div>`;
    }

    // Champion column — scales with panel via clamp
    const champC = state.tourneyWinner ? state.tourneyWinner.color : '#475569';
    const champN = state.tourneyWinner ? state.tourneyWinner.name : '???';
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

        html += `<div class="flex items-start gap-3 bg-slate-800/80 p-3 rounded-lg border border-slate-700 shadow-md">
                    <div class="rounded-full flex-shrink-0 shadow-inner border-2 border-slate-900"
                         style="background:${b.color}; width:${avatarSize}; height:${avatarSize}; min-width:${avatarSize}"></div>
                    <div class="min-w-0">
                        <div class="font-bold text-slate-100 leading-tight" style="font-size:${nameSize}">
                            ${b.name}
                            <span class="uppercase font-bold text-indigo-400 bg-indigo-900/50 rounded ml-2 px-1.5 py-0.5 align-middle" style="font-size:${badgeSize}">${b.ability}</span>
                        </div>
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

// ─── Leaderboard ─────────────────────────────────────────────���───────────────

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
