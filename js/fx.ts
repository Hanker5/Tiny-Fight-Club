// @ts-nocheck — pre-existing JS class patterns; typed incrementally
import { state } from './state';
import { emitter } from './events';

class Particle {
    constructor(x, y, color, speed, size) {
        this.x = x; this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const vel   = Math.random() * speed;
        this.vx    = Math.cos(angle) * vel;
        this.vy    = Math.sin(angle) * vel;
        this.life  = 1.0;
        this.decay = (0.02 + Math.random() * 0.04) * 60; // per second
        this.size  = size + Math.random() * 2;
    }
    update(dt) {
        this.x    += this.vx * dt * 60;
        this.y    += this.vy * dt * 60;
        this.life -= this.decay * dt;
    }
}

class FloatingText {
    constructor(text, x, y, color) {
        this.text  = text;
        this.x     = x + (Math.random() * 20 - 10);
        this.y     = y + (Math.random() * 20 - 10);
        this.color = color;
        this.life  = 1.0;
        this.vy    = -90; // px/s
    }
    update(dt) {
        this.y    += this.vy * dt;
        this.life -= 1.2 * dt;
    }
}

const CONFETTI_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'
];

class Confetti {
    constructor(arenaW) {
        this.x            = Math.random() * arenaW;
        this.y            = -10 - Math.random() * 200;
        this.w            = 7 + Math.random() * 7;
        this.h            = 3 + Math.random() * 4;
        this.color        = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
        this.vx           = (Math.random() - 0.5) * 2.5;
        this.vy           = 5 + Math.random() * 7;
        this.rotation     = Math.random() * Math.PI * 2;
        this.rotSpeed     = (Math.random() - 0.5) * 0.25;
        this.life         = 1.0;
        this.decay        = 0.12 + Math.random() * 0.08;
    }
    update(dt) {
        this.x        += this.vx      * dt * 60;
        this.y        += this.vy      * dt * 60;
        this.rotation += this.rotSpeed * dt * 60;
        this.life     -= this.decay   * dt;
    }
}

export function createConfetti(count, arenaW) {
    for (let i = 0; i < count; i++) {
        state.confetti.push(new Confetti(arenaW));
    }
}

export function createParticles(x, y, color, count, speed = 3, size = 3) {
    for (let i = 0; i < count; i++) {
        state.particles.push(new Particle(x, y, color, speed, size));
    }
}

export function addFloatingText(text, x, y, color) {
    state.floatingTexts.push(new FloatingText(text, x, y, color));
}

class NoteParticle {
    constructor(text, x, y, angle, color) {
        this.text  = text;
        this.x     = x;
        this.y     = y;
        this.vx    = Math.cos(angle) * 187;  // px/s — matches wave2 ring expansion rate
        this.vy    = Math.sin(angle) * 187;
        this.color = color;
        this.duration = 0.8;  // matches shriekVisual duration
        this.age   = 0;
        this.life  = 1.0;
    }
    update(dt) {
        this.age  += dt;
        this.x    += this.vx * dt;
        this.y    += this.vy * dt;
        this.life  = Math.max(0, 1 - this.age / this.duration);
    }
}

// Subscribe to simulation events and translate them into visual effects.
// This keeps all FX logic here, out of the simulation classes.

emitter.on('fx:particles', ({ x, y, color, count, speed = 3, size = 3 }) => {
    createParticles(x, y, color, count, speed, size);
});

emitter.on('fx:notes', ({ notes }) => {
    for (const n of notes) {
        state.noteParticles.push(new NoteParticle(n.text, n.x, n.y, n.angle, n.color));
    }
});

emitter.on('fx:text', ({ text, x, y, color }) => {
    addFloatingText(text, x, y, color);
});

emitter.on('ball:hit', ({ defender, damage, isReflect }) => {
    addFloatingText(
        `-${Math.floor(damage)}`,
        defender.x,
        defender.y - defender.r - 10,
        isReflect ? '#14b8a6' : '#ef4444'
    );
});

emitter.on('ability:used', ({ ball, ability }) => {
    const labels = {
        Dash: 'DASH!', Charge: 'CHARGE!', Grapple: 'GRAPPLE!',
        Phase: 'PHASE!', Pulse: 'PULSE!', Teleport: 'TELEPORT!',
        Shield: 'SHIELD!', ShieldBurst: 'SHIELDS!'
    };
    const color = ability === 'Shield' ? '#3b82f6' : ball.color;
    if (labels[ability]) {
        addFloatingText(labels[ability], ball.x, ball.y - ball.r - 10, color);
    }
    // Burst particles for visual abilities
    const burstAbilities = ['Dash', 'Pulse', 'Teleport', 'ShieldBurst'];
    if (burstAbilities.includes(ability)) {
        createParticles(ball.x, ball.y, ball.color, ability === 'Pulse' ? 30 : 15, ability === 'Pulse' ? 8 : 3);
    }
});

emitter.on('ball:poisoned', ({ ball }) => {
    addFloatingText('POISONED!', ball.x, ball.y, '#22c55e');
});
