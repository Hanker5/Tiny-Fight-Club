// Pure rendering functions — no imports from state.js or game logic.
// Each function receives only what it needs to draw.

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

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ball.name, ball.x, ball.y - ball.r - 35);
}

export function drawHazard(ctx, hazard) {
    ctx.fillStyle = '#d97706';
    ctx.globalAlpha = Math.min(1, hazard.life / 60);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.lineTo(hazard.x + Math.cos(a) * hazard.r, hazard.y + Math.sin(a) * hazard.r);
        const a2 = ((i + 0.5) / 6) * Math.PI * 2;
        ctx.lineTo(hazard.x + Math.cos(a2) * (hazard.r / 2), hazard.y + Math.sin(a2) * (hazard.r / 2));
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
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
