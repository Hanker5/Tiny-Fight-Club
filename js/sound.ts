import { emitter } from './events';

const SOUND_FILES = [
    'Absorb', 'BallDie', 'BallHurt1', 'BallHurt2',
    'Boomerang', 'Dash', 'Grapple', 'Hex', 'HexZone',
    'Laser', 'Minion', 'Phase', 'Poison', 'Portal', 'Pulse',
    'Shield', 'Shriek1', 'Shriek2', 'Shriek3', 'Shriek4',
    'Teleport', 'Tempo',
] as const;

type SoundName = typeof SOUND_FILES[number];

const SHRIEK_VARIANTS: SoundName[] = ['Shriek1', 'Shriek2', 'Shriek3', 'Shriek4'];

const ABILITY_SOUND: Record<string, SoundName | SoundName[]> = {
    Absorb:    'Absorb',
    Boomerang: 'Boomerang',
    Dash:      'Dash',
    Grapple:   'Grapple',
    Hex:       'Hex',
    Laser:     'Laser',
    Minion:    'Minion',
    Phase:     'Phase',
    Portal:    'Portal',
    Pulse:     'Pulse',
    Shield:    'Shield',
    Shriek:    SHRIEK_VARIANTS,
    Teleport:  'Teleport',
    Tempo:     'Tempo',
};

class SoundManager {
    private ctx: AudioContext | null = null;
    private buffers = new Map<SoundName, AudioBuffer>();
    private lastMinionPlay = 0;
    private lastHurtPlay = 0;

    async init() {
        try {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            await Promise.all(SOUND_FILES.map(name => this.load(name)));
            this.subscribe();
        } catch (e) {
            console.warn('Sound init failed:', e);
        }
    }

    private async load(name: SoundName) {
        try {
            const res = await fetch(`/sounds/${name}.wav`);
            const raw = await res.arrayBuffer();
            this.buffers.set(name, await this.ctx!.decodeAudioData(raw));
        } catch (e) {
            console.warn(`Failed to load sound: ${name}`, e);
        }
    }

    private play(name: SoundName) {
        if (!this.ctx || !this.buffers.has(name)) return;
        // Resume context if suspended (browser autoplay policy)
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffers.get(name)!;
        src.connect(this.ctx.destination);
        src.start(0);
    }

    private pick(sounds: SoundName[]): SoundName {
        return sounds[Math.floor(Math.random() * sounds.length)];
    }

    private subscribe() {
        emitter.on('ability:used', ({ ability }: { ability: string }) => {
            const entry = ABILITY_SOUND[ability];
            if (!entry) return;

            if (ability === 'Minion') {
                const now = performance.now();
                if (now - this.lastMinionPlay < 2000) return;
                this.lastMinionPlay = now;
            }

            this.play(Array.isArray(entry) ? this.pick(entry) : entry);
        });

        emitter.on('ball:hit', ({ defender }: { defender: any }) => {
            if (defender.isMinion || defender.isDecoy || defender.isClone) return;
            const now = performance.now();
            if (now - this.lastHurtPlay < 150) return;
            this.lastHurtPlay = now;
            this.play(Math.random() < 0.5 ? 'BallHurt1' : 'BallHurt2');
        });

        emitter.on('ball:die', ({ ball }: { ball: any }) => {
            if (ball.isMinion || ball.isDecoy || ball.isClone) return;
            this.play('BallDie');
        });

        emitter.on('ball:poisoned', () => {
            this.play('Poison');
        });

        emitter.on('hex:zone:land', () => {
            this.play('HexZone');
        });
    }
}

export const soundManager = new SoundManager();
