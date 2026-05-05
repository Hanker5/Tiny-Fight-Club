// Pure rendering functions — no imports from state.js or game logic.
// Each function receives only what it needs to draw.

const holySeeImage = new Image();
holySeeImage.src = '/images/The Holy See.png';

// Color utility functions
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = Math.min(255, Math.max(0, Math.round(x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function lightenColor(hex, percent) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(
        rgb.r + (255 - rgb.r) * (percent / 100),
        rgb.g + (255 - rgb.g) * (percent / 100),
        rgb.b + (255 - rgb.b) * (percent / 100)
    );
}

function darkenColor(hex, percent) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(
        rgb.r * (1 - percent / 100),
        rgb.g * (1 - percent / 100),
        rgb.b * (1 - percent / 100)
    );
}

export function drawBall(ctx, ball) {
    ctx.save();
    ctx.translate(ball.x, ball.y);

    if (ball.isDecoy) ctx.globalAlpha = 0.55;
    else if (ball.intangible > 0) ctx.globalAlpha = 0.4;

    if (ball.shield > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, ball.r + 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#3b82f6';
        ctx.stroke();
    }

    // Immunity ring — gold pulsing ring
    if (ball.immuneActive) {
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 80);
        ctx.beginPath();
        ctx.arc(0, 0, ball.r + 8 + pulse * 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(251, 191, 36, ${pulse})`;
        ctx.lineWidth = 4;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    if (ball.pulseVisual > 0) {
        const pulseDuration = 0.5;
        const remaining = Math.min(1, ball.pulseVisual / pulseDuration);
        const progress = 1 - remaining;
        const waveRadius = ball.r + 18 + progress * 150;
        const innerRadius = ball.r + 8 + progress * 55;
        const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 45);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        ctx.beginPath();
        ctx.arc(0, 0, waveRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(14, 165, 233, ${0.12 * remaining})`;
        ctx.fill();

        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 28 * remaining * pulse;
        ctx.lineWidth = 10;
        ctx.strokeStyle = `rgba(125, 211, 252, ${0.55 * remaining})`;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(240, 249, 255, ${0.85 * remaining})`;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.setLineDash([14, 8]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgba(14, 165, 233, ${0.75 * remaining})`;
        ctx.beginPath();
        ctx.arc(0, 0, waveRadius + 12, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    if (ball.abilityName === 'RapidSpin') {
        const numSpikes = 8;
        for (let i = 0; i < numSpikes; i++) {
            const a = ball.angle + (i / numSpikes) * Math.PI * 2;
            const tipX = Math.cos(a) * ball.r * 1.45;
            const tipY = Math.sin(a) * ball.r * 1.45;
            const perpA = a + Math.PI / 2;
            const baseW = ball.r * 0.13;
            const baseX = Math.cos(a) * ball.r;
            const baseY = Math.sin(a) * ball.r;
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(baseX + Math.cos(perpA) * baseW, baseY + Math.sin(perpA) * baseW);
            ctx.lineTo(baseX - Math.cos(perpA) * baseW, baseY - Math.sin(perpA) * baseW);
            ctx.fillStyle = '#e2e8f0';
            ctx.fill();
            ctx.strokeStyle = '#020617';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    } else {
        ctx.rotate(ball.angle);
        ctx.beginPath();
        ctx.moveTo(Math.cos(-Math.PI / 3) * ball.r, Math.sin(-Math.PI / 3) * ball.r);
        ctx.lineTo(ball.r * 1.6, 0);
        ctx.lineTo(Math.cos(Math.PI / 3) * ball.r, Math.sin(Math.PI / 3) * ball.r);
        ctx.fillStyle = '#cbd5e1';
        ctx.fill();
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.rotate(-ball.angle);
    }

    ctx.beginPath();
    ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = ball.flash > 0 ? '#ffffff' : ball.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#020617';
    ctx.stroke();

    if (ball.abilityName === 'RapidSpin' && ball.flash <= 0) {
        ctx.beginPath();
        ctx.arc(0, 0, ball.r * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = '#dc2626';
        ctx.fill();
    }

    if (ball.name === 'Bombastic Bubbles' && ball.flash <= 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = 'rgba(173, 216, 230, 0.45)';
        ctx.rotate(Math.PI * 0.22);
        const sw = ball.r * 0.32, ss = ball.r * 0.72;
        for (let i = -1; i <= 1; i++)
            ctx.fillRect(-ball.r * 1.5, i * ss - sw / 2, ball.r * 3, sw);
        ctx.restore();
    }

    if (ball.shriekVisual > 0) {
        const shriekDuration = 0.8;
        const remaining = Math.min(1, ball.shriekVisual / shriekDuration);
        const progress = 1 - remaining;
        const wave1R = ball.r + 10 + progress * 230;
        const wave2R = ball.r + 10 + progress * 150;
        const wave3R = ball.r + 10 + progress * 80;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#006eb6';
        ctx.shadowBlur = 22 * remaining;
        ctx.lineWidth = 7 * remaining;
        ctx.strokeStyle = `rgba(0, 110, 182, ${0.65 * remaining})`;
        ctx.beginPath(); ctx.arc(0, 0, wave1R, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 5 * remaining;
        ctx.strokeStyle = `rgba(80, 170, 240, ${0.7 * remaining})`;
        ctx.beginPath(); ctx.arc(0, 0, wave2R, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 3 * remaining;
        ctx.strokeStyle = `rgba(200, 235, 255, ${0.9 * remaining})`;
        ctx.beginPath(); ctx.arc(0, 0, wave3R, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    if (ball.stunned > 0) {
        const t = performance.now() / 280;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#fde047';
        ctx.shadowBlur = 14;
        for (let i = 0; i < 3; i++) {
            const a = t + (i / 3) * Math.PI * 2;
            const ox = Math.cos(a) * (ball.r + 15);
            const oy = Math.sin(a) * (ball.r + 15);
            ctx.beginPath();
            ctx.arc(ox, oy, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(253, 224, 71, 0.9)';
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    if (ball.name === 'Snickerdoodle') {
        ctx.fillStyle = '#8B4513';
        // Freckles: more spread out and varied positions
        const freckles = [
            { x: -ball.r * 0.55, y: -ball.r * 0.45 },
            { x:  ball.r * 0.48, y: -ball.r * 0.40 },
            { x: -ball.r * 0.32, y:  ball.r * 0.22 },
            { x:  ball.r * 0.62, y:  ball.r * 0.12 },
            { x: -ball.r * 0.65, y: -ball.r * 0.18 },
            { x:  ball.r * 0.25, y:  ball.r * 0.35 },
            { x: -ball.r * 0.18, y: -ball.r * 0.52 },
            { x:  ball.r * 0.68, y:  ball.r * 0.28 },
            { x: -ball.r * 0.68, y:  ball.r * 0.38 },
            { x:  ball.r * 0.12, y: -ball.r * 0.28 },
            { x: -ball.r * 0.38, y:  ball.r * 0.08 },
            { x:  ball.r * 0.35, y:  ball.r * 0.42 },
            { x: -ball.r * 0.08, y:  ball.r * 0.45 },
            { x:  ball.r * 0.55, y: -ball.r * 0.08 },
        ];
        const fr = Math.max(2, ball.r * 0.055);
        freckles.forEach(f => {
            ctx.beginPath();
            ctx.arc(f.x, f.y, fr, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    if (ball.name === 'The Holy See' && ball.flash <= 0 && holySeeImage.complete && holySeeImage.naturalWidth > 0) {
        const size = ball.r * 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(holySeeImage, -size / 2, -size / 2, size, size);
        ctx.restore();
    }

    ctx.restore();
    ctx.globalAlpha = 1.0;

    if (ball.isDecoy) return;  // no HP bar or name for decoys

    const barW = ball.r * 1.5;
    const hpPct = Math.max(0, ball.hp / ball.maxHp);
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(ball.x - barW / 2, ball.y - ball.r - 24, barW, 6);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(ball.x - barW / 2, ball.y - ball.r - 24, barW * hpPct, 6);

    if (ball.shield > 0) {
        ctx.fillStyle = '#3b82f6';
        const shieldPct = Math.min(1, ball.shield / 50);
        ctx.fillRect(ball.x - barW / 2, ball.y - ball.r - 24, barW * shieldPct, 3);
    }

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(ball.x - barW / 2, ball.y - ball.r - 24, barW, 6);

    // Fighter name
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ball.name, ball.x, ball.y - ball.r - 35);

    // Player name (above fighter name, smaller and muted)
    if (ball.def && ball.def.player) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(ball.def.player, ball.x, ball.y - ball.r - 53);
    }
}

export function drawHazard(ctx, hazard) {
    const alpha = Math.min(1, hazard.life);  // fade out during last second
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 120);
    const color = hazard.source.color;
    const lighter = lightenColor(color, 30);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18 * pulse;
    ctx.strokeStyle = lighter;
    ctx.lineWidth = 2.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(hazard.x + Math.cos(a) * hazard.r, hazard.y + Math.sin(a) * hazard.r);
        const a2 = ((i + 0.5) / 8) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(hazard.x + Math.cos(a2) * (hazard.r * 0.45), hazard.y + Math.sin(a2) * (hazard.r * 0.45));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

export function drawHexZone(ctx, zone) {
    const lifeFrac = zone.life / 3.0;
    const alpha = Math.min(1, lifeFrac);
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 150);
    ctx.save();
    ctx.globalAlpha = alpha * 0.25;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2);
    ctx.fillStyle = '#8b0000';
    ctx.fill();
    ctx.globalAlpha = alpha * pulse;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#dc143c';
    ctx.shadowColor = '#dc143c';
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha * 0.4;
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.r * 0.35, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

export function drawHexProjectile(ctx, proj) {
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 80);
    ctx.save();
    ctx.shadowColor = '#dc143c';
    ctx.shadowBlur = 18 * pulse;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.r, 0, Math.PI * 2);
    ctx.fillStyle = '#dc143c';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ff6b6b';
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
}

export function drawTrail(ctx, trails) {
    if (!trails.length) return;

    // Group segments by source so each Tron gets its own path
    const groups = new Map();
    for (const seg of trails) {
        if (!groups.has(seg.source)) groups.set(seg.source, []);
        groups.get(seg.source).push(seg);
    }

    for (const [, segs] of groups) {
        if (!segs.length) continue;
        const color = segs[0].source.color;
        const lighter = lightenColor(color, 40);
        const darker = darkenColor(color, 20);
        ctx.save();

        // Outer glow layer
        ctx.shadowColor = lighter;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = darker;
        ctx.lineWidth = segs[0].r * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(segs[0].x, segs[0].y);
        for (let i = 1; i < segs.length; i++) ctx.lineTo(segs[i].x, segs[i].y);
        ctx.stroke();

        // Bright inner core
        ctx.shadowBlur = 0;
        ctx.strokeStyle = lighter;
        ctx.lineWidth = segs[0].r * 0.65;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(segs[0].x, segs[0].y);
        for (let i = 1; i < segs.length; i++) ctx.lineTo(segs[i].x, segs[i].y);
        ctx.stroke();

        ctx.restore();
    }
}

export function drawPortal(ctx, x, y, color, lifeFrac = 1) {
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 160);
    const alpha = Math.min(1, lifeFrac) * pulse;
    ctx.save();

    // Large translucent disc
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.18 * alpha;
    ctx.beginPath();
    ctx.arc(x, y, 45, 0, Math.PI * 2);
    ctx.fill();

    // Outer glow ring
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.9 * alpha;
    ctx.beginPath();
    ctx.arc(x, y, 38, 0, Math.PI * 2);
    ctx.stroke();

    // Inner bright ring
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7 * alpha;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.stroke();

    // Spinning spokes
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 * alpha;
    const rot = (performance.now() / 600) % (Math.PI * 2);
    for (let i = 0; i < 4; i++) {
        const a = rot + i * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
        ctx.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30);
        ctx.stroke();
    }

    ctx.restore();
}

export function drawBoomerang(ctx, blade) {
    const angle = Math.atan2(blade.vy, blade.vx);
    const spin  = performance.now() / 60;
    ctx.save();
    ctx.translate(blade.x, blade.y);
    ctx.rotate(angle + spin);

    const r = blade.r;
    const isReturn = blade.phase === 'RETURNING';

    // Outer glow
    ctx.shadowColor = isReturn ? '#f59e0b' : '#818cf8';
    ctx.shadowBlur  = 14;

    // Curved blade arms (two arcs forming a boomerang shape)
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.quadraticCurveTo(-r * 0.2, -r * 0.7, r, 0);
    ctx.quadraticCurveTo(-r * 0.2,  r * 0.7, -r, 0);
    ctx.closePath();
    ctx.fillStyle = isReturn ? '#fbbf24' : '#a5b4fc';
    ctx.fill();
    ctx.strokeStyle = isReturn ? '#92400e' : '#312e81';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Bright center dot
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();
}

export function drawOrbitalShield(ctx, shield) {
    if (shield.phase === 'PROJECTILE') {
        // Flying disc after release
        ctx.save();
        ctx.translate(shield.x, shield.y);
        ctx.shadowColor = '#ADD8E6';
        ctx.shadowBlur  = 18;
        ctx.beginPath();
        ctx.arc(0, 0, shield.r, 0, Math.PI * 2);
        ctx.fillStyle   = '#ADD8E6';
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.lineWidth   = 2;
        ctx.strokeStyle = '#5bb3cc';
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1.0;
        return;
    }

    // Orbiting arc — annular sector centered on the source ball
    const hpFrac      = Math.max(0, shield.hp / shield.maxHp);
    const charge      = Math.min(1, shield.chargeTime / shield.chargeDuration);
    const halfThick   = 2 + 8 * charge;          // grows from 2px to 10px each side
    const halfAngle   = Math.PI / 5 - 0.04;      // 36° minus small gap
    const innerR      = shield.orbitRadius - halfThick;
    const outerR      = shield.orbitRadius + halfThick;
    const startA      = shield.orbitAngle - halfAngle;
    const endA        = shield.orbitAngle + halfAngle;
    const fillAlpha   = (0.2 + 0.45 * charge) * hpFrac + 0.05;
    const strokeAlpha = (0.3 + 0.6 * charge) * hpFrac + 0.1;

    ctx.save();
    ctx.translate(shield.source.x, shield.source.y);
    ctx.shadowColor = '#C8A0DE';
    ctx.shadowBlur  = (4 + 10 * charge) * hpFrac;

    // Filled annular sector (outer arc → inner arc reversed → close)
    ctx.beginPath();
    ctx.arc(0, 0, outerR, startA, endA);
    ctx.arc(0, 0, innerR, endA, startA, true);
    ctx.closePath();
    ctx.fillStyle   = `rgba(200, 160, 222, ${fillAlpha})`;
    ctx.globalAlpha = 1.0;
    ctx.fill();

    // Outer edge stroke
    ctx.beginPath();
    ctx.arc(0, 0, outerR, startA, endA);
    ctx.strokeStyle = `rgba(200, 160, 222, ${strokeAlpha})`;
    ctx.lineWidth   = 1.5 + charge;
    ctx.stroke();

    // Inner edge stroke
    ctx.beginPath();
    ctx.arc(0, 0, innerR, startA, endA);
    ctx.strokeStyle = `rgba(200, 160, 222, ${strokeAlpha * 0.75})`;
    ctx.lineWidth   = 1 + charge * 0.5;
    ctx.stroke();

    // Light-blue centre line highlight
    ctx.beginPath();
    ctx.arc(0, 0, (innerR + outerR) / 2, startA, endA);
    ctx.strokeStyle = `rgba(173, 216, 230, ${0.15 + 0.45 * charge * hpFrac})`;
    ctx.lineWidth   = 1.5 + 1.5 * charge;
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1.0;
}

export function drawProjectile(ctx, proj) {
    ctx.fillStyle = proj.color;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
}

export function drawParticle(ctx, particle) {
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
}

export function drawNoteParticle(ctx, np) {
    ctx.globalAlpha = Math.max(0, np.life);
    const size = Math.round(16 + (1 - np.life) * 6);
    ctx.font = `bold ${size}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = np.color;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 3;
    ctx.strokeText(np.text, np.x, np.y);
    ctx.fillText(np.text, np.x, np.y);
    ctx.globalAlpha = 1.0;
    ctx.textBaseline = 'alphabetic';
}

export function drawFloatingText(ctx, ft) {
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.fillStyle = ft.color;
    ctx.font = '900 27px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4;
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.globalAlpha = 1.0;
}

export function drawGrappleLine(ctx, from, to) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = from.color;
    ctx.lineWidth = 3;
    ctx.stroke();
}

export function drawConfetti(ctx, piece) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, piece.life);
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.rotation);
    ctx.fillStyle = piece.color;
    ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
    ctx.restore();
    ctx.globalAlpha = 1.0;
}

export function drawArenaBorder(ctx, w, h) {
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
}

export function drawSuddenDeathZone(ctx, w, h, inset) {
    if (inset <= 0) return;
    ctx.save();

    // Red tint over danger strips
    ctx.fillStyle = 'rgba(239, 68, 68, 0.13)';
    ctx.fillRect(0, 0, w, inset);
    ctx.fillRect(0, h - inset, w, inset);
    ctx.fillRect(0, inset, inset, h - inset * 2);
    ctx.fillRect(w - inset, inset, inset, h - inset * 2);

    // Pulsing dashed border at the safe zone edge
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 250);
    ctx.strokeStyle = `rgba(239, 68, 68, ${pulse.toFixed(2)})`;
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 7]);
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);

    ctx.restore();
}

export function drawObstacles(ctx, obstacles) {
    obstacles.forEach(obs => {
        const grad = ctx.createRadialGradient(
            obs.x - obs.r * 0.3, obs.y - obs.r * 0.3, obs.r * 0.1,
            obs.x, obs.y, obs.r
        );
        grad.addColorStop(0, '#64748b');
        grad.addColorStop(1, '#1e293b');
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 3;
        ctx.stroke();
    });
}
