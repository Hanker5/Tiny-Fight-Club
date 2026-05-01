import { Ability } from './Ability';
import { DashAbility } from './DashAbility';
import { ChargeAbility } from './ChargeAbility';
import { GrappleAbility } from './GrappleAbility';
import { PhaseAbility } from './PhaseAbility';
import { PulseAbility } from './PulseAbility';
import { TeleportAbility } from './TeleportAbility';
import { ShieldAbility } from './ShieldAbility';
import { MissileAbility } from './MissileAbility';
import { LaserAbility } from './LaserAbility';
import { MinionAbility } from './MinionAbility';
import { TrapAbility } from './TrapAbility';
import { ImmunityAbility } from './ImmunityAbility';
import { AbsorbAbility } from './AbsorbAbility';
import { TrailAbility } from './TrailAbility';
import { BoomerangAbility } from './BoomerangAbility';
import { SpeedRushAbility } from './SpeedRushAbility';
import { PortalAbility } from './PortalAbility';
import { CloneAbility } from './CloneAbility';
import { SummonAbility } from './SummonAbility';
import { BlackPantherAbility } from './BlackPantherAbility';
import { HexAbility } from './HexAbility';
import { ShieldBurstAbility } from './ShieldBurstAbility';
import { BerserkAbility } from './BerserkAbility';
import { VampireAbility } from './VampireAbility';
import { ReflectAbility } from './ReflectAbility';
import { HeavyAbility } from './HeavyAbility';
import { PoisonAbility } from './PoisonAbility';

type AbilityCtor = new () => Ability;

const registry = new Map<string, AbilityCtor>([
    ['Dash',        DashAbility],
    ['Charge',      ChargeAbility],
    ['Grapple',     GrappleAbility],
    ['Phase',       PhaseAbility],
    ['Pulse',       PulseAbility],
    ['Teleport',    TeleportAbility],
    ['Shield',      ShieldAbility],
    ['Missile',     MissileAbility],
    ['Laser',       LaserAbility],
    ['Minion',      MinionAbility],
    ['Trap',        TrapAbility],
    ['Immunity',    ImmunityAbility],
    ['Absorb',      AbsorbAbility],
    ['Trail',       TrailAbility],
    ['Boomerang',   BoomerangAbility],
    ['SpeedRush',   SpeedRushAbility],
    ['Portal',      PortalAbility],
    ['Clone',       CloneAbility],
    ['Summon',      SummonAbility],
    ['BlackPanther',BlackPantherAbility],
    ['Hex',         HexAbility],
    ['ShieldBurst', ShieldBurstAbility],
    ['Berserk',     BerserkAbility],
    ['Vampire',     VampireAbility],
    ['Reflect',     ReflectAbility],
    ['Heavy',       HeavyAbility],
    ['Poison',      PoisonAbility],
]);

export function createAbility(name: string): Ability {
    const Ctor = registry.get(name);
    if (!Ctor) {
        console.warn(`Unknown ability: "${name}", falling back to Heavy`);
        return new HeavyAbility();
    }
    return new Ctor();
}
