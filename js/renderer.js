// Pure rendering functions — no imports from state.js or game logic.
// Each function receives only what it needs to draw.

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

    if (ball.intangible > 0) ctx.globalAlpha = 0.4;

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
        ctx.beginPath();
        ctx.arc(0, 0, ball.r + (15 - ball.pulseVisual) * 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(14, 165, 233, ${ball.pulseVisual / 15})`;
        ctx.lineWidth = 4;
        ctx.stroke();
    }

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

    ctx.beginPath();
    ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = ball.flash > 0 ? '#ffffff' : ball.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#020617';
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1.0;

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
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 18 * pulse;
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = '#d97706';
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
