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

export type TournamentFormat = 'SINGLE_ELIMINATION' | 'SWISS';

export interface SwissSettings {
    numRounds: number;
    bestOf: 1 | 3 | 5;
}

export interface SwissStanding {
    fighter: FighterDef;
    matchPoints: number;
    matchWins: number;
    matchLosses: number;
    gameWins: number;
    gameLosses: number;
    byes: number;
    opponents: string[];
}

export interface SwissMatch {
    p1: FighterDef;
    p2: FighterDef | null;
    winner: FighterDef | null;
    p1SeriesWins: number;
    p2SeriesWins: number;
    complete: boolean;
}
