export type BehaviorMode = 'AGGRESSIVE' | 'FLANKING' | 'RETREATING' | 'SNIPING';
export type GamePhase = 'BRACKET' | 'FIGHTING' | 'ANIMATING_WIN' | 'CUSTOM_1V1';

export interface FighterDef {
    name: string;
    player: string | null;
    color: string;
    ability: string;
    hp: number;
    maxHp: number;
    r: number;
    mass: number;
    speed: number;
    damage: number;
    desc: string;
    stolenAbilities?: string[];
}

export interface ArenaSize {
    width: number;
    height: number;
}
