import type { AttackType, ArmorType } from '../../../shared/src/index';

// Damage multiplier table — duplicated here to avoid runtime cross-package dep
const DAMAGE_TABLE: Record<string, Record<string, number>> = {
  normal: { light: 1.0, medium: 0.75, heavy: 0.5, arcane: 0.7, unarmored: 1.0, structure: 0.5 },
  pierce: { light: 1.5, medium: 0.75, heavy: 0.5, arcane: 0.5, unarmored: 1.0, structure: 0.7 },
  magic:  { light: 1.0, medium: 1.25, heavy: 1.0, arcane: 2.0, unarmored: 1.0, structure: 0.5 },
  siege:  { light: 0.5, medium: 0.5,  heavy: 1.25, arcane: 0.5, unarmored: 0.75, structure: 2.0 },
  chaos:  { light: 1.0, medium: 1.0,  heavy: 1.0, arcane: 1.0, unarmored: 1.0, structure: 1.0 },
};
import { GameState } from '../schemas/GameState';
import { UnitState } from '../schemas/UnitState';
import type { UnitDef } from '../unitDefs';

interface AuraBuff {
  dmgMult: number;
  armorBonus: number;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function calcDamage(
  baseDmg: number,
  attackType: AttackType,
  armorType: ArmorType,
  dmgMult: number,
): number {
  const tableMult = DAMAGE_TABLE[attackType]?.[armorType] ?? 1.0;
  return baseDmg * tableMult * dmgMult;
}

function getAllDefenders(state: GameState): { unit: UnitState; def: UnitDef | undefined; playerSessionId: string }[] {
  const result: { unit: UnitState; def: UnitDef | undefined; playerSessionId: string }[] = [];
  state.players.forEach((player, sessionId) => {
    player.units.forEach((unit) => {
      if (unit.alive) {
        result.push({ unit, def: undefined, playerSessionId: sessionId });
      }
    });
  });
  return result;
}

function getAllEnemies(state: GameState): UnitState[] {
  const result: UnitState[] = [];
  state.enemies.forEach((enemy) => {
    if (enemy.alive) result.push(enemy);
  });
  return result;
}

export function tickCombat(
  state: GameState,
  deltaSec: number,
  unitDefs: Record<string, UnitDef>,
): void {
  const defenders = getAllDefenders(state);
  const enemies = getAllEnemies(state);

  // Populate defs for defenders
  for (const d of defenders) {
    d.def = unitDefs[d.unit.type];
  }

  // ── 1. Aura buffs ──
  const auraBuffs = new Map<string, AuraBuff>();

  // Initialize all defenders with base buffs
  for (const d of defenders) {
    auraBuffs.set(d.unit.id, { dmgMult: 1.0, armorBonus: 0 });
  }

  // Apply aura from defenders with "aura" special
  for (const d of defenders) {
    const def = d.def;
    if (!def || def.special !== 'aura') continue;

    const auraRange = def.auraRange ?? 0;
    const auraDmgBoost = def.auraDmg ?? 0;
    const auraArmorBoost = def.auraArmor ?? 0;

    for (const other of defenders) {
      if (other.unit.id === d.unit.id) continue;
      const distance = dist(d.unit.x, d.unit.y, other.unit.x, other.unit.y);
      if (distance <= auraRange) {
        const buff = auraBuffs.get(other.unit.id)!;
        buff.dmgMult += auraDmgBoost;
        buff.armorBonus += auraArmorBoost;
      }
    }
  }

  // ── 2. Enemy attacks on defenders ──
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (enemy.atkSpeed <= 0) continue;

    enemy.attackCooldown -= deltaSec;
    if (enemy.attackCooldown > 0) continue;

    // Find closest defender in range
    let closestDef: { unit: UnitState; def: UnitDef | undefined } | null = null;
    let closestDist = Infinity;

    for (const d of defenders) {
      if (!d.unit.alive) continue;
      const distance = dist(enemy.x, enemy.y, d.unit.x, d.unit.y);
      if (distance < closestDist) {
        closestDist = distance;
        closestDef = d;
      }
    }

    if (!closestDef || closestDist > enemy.range) continue;

    // Attack!
    const rawDmg = calcDamage(
      enemy.dmg,
      enemy.attackType as AttackType,
      closestDef.unit.armorType as ArmorType,
      1.0,
    );
    closestDef.unit.hp -= Math.round(rawDmg);

    // Splash damage
    const enemyStats = getEnemyStats(enemy.type);
    if (enemyStats.special === 'splash' && enemyStats.splashRadius) {
      for (const d of defenders) {
        if (d.unit.id === closestDef.unit.id) continue;
        if (!d.unit.alive) continue;
        const sDist = dist(closestDef.unit.x, closestDef.unit.y, d.unit.x, d.unit.y);
        if (sDist <= enemyStats.splashRadius) {
          const splashDmg = calcDamage(
            enemy.dmg * (enemyStats.splashDmgRatio ?? 0.5),
            enemy.attackType as AttackType,
            d.unit.armorType as ArmorType,
            1.0,
          );
          d.unit.hp -= Math.round(splashDmg);
        }
      }
    }

    enemy.attackCooldown = enemy.atkSpeed > 0 ? 1 / enemy.atkSpeed : 999;
  }

  // ── 3. Defender attacks on enemies ──
  for (const d of defenders) {
    const def = d.def;
    if (!def || !d.unit.alive) continue;

    const buff = auraBuffs.get(d.unit.id) ?? { dmgMult: 1.0, armorBonus: 0 };

    // Heal special
    if (def.special === 'heal' && def.healPerSecond) {
      d.unit.healCooldown -= deltaSec;
      if (d.unit.healCooldown <= 0) {
        // Heal lowest-HP nearby ally
        let lowestHpAlly: UnitState | null = null;
        let lowestRatio = 1.0;
        const healRange = def.range > 0 ? def.range : 3;

        for (const other of defenders) {
          if (other.unit.id === d.unit.id) continue;
          if (!other.unit.alive) continue;
          if (other.unit.hp >= other.unit.maxHp) continue;
          const hDist = dist(d.unit.x, d.unit.y, other.unit.x, other.unit.y);
          if (hDist > healRange) continue;
          const ratio = other.unit.hp / other.unit.maxHp;
          if (ratio < lowestRatio) {
            lowestRatio = ratio;
            lowestHpAlly = other.unit;
          }
        }

        if (lowestHpAlly) {
          lowestHpAlly.hp = Math.min(
            lowestHpAlly.maxHp,
            lowestHpAlly.hp + def.healPerSecond,
          );
        }
        d.unit.healCooldown = 1.0; // heal once per second
      }
    }

    // Chain special (tesla_coil)
    if (def.special === 'chain' && def.chainTargets) {
      d.unit.attackCooldown -= deltaSec;
      if (d.unit.attackCooldown > 0) continue;

      let primary: UnitState | null = null;
      let primaryDist = Infinity;

      for (const e of enemies) {
        if (!e.alive) continue;
        const eDist = dist(d.unit.x, d.unit.y, e.x, e.y);
        if (eDist <= def.range && eDist < primaryDist) {
          primaryDist = eDist;
          primary = e;
        }
      }

      if (primary) {
        const dmg = calcDamage(
          def.dmg * buff.dmgMult,
          def.attackType,
          primary.armorType as ArmorType,
          1.0,
        );
        primary.hp -= Math.round(dmg);

        // Chain to additional targets within 2 cells of primary
        let chained = 0;
        for (const e of enemies) {
          if (chained >= def.chainTargets) break;
          if (!e.alive || e.id === primary.id) continue;
          const cDist = dist(primary.x, primary.y, e.x, e.y);
          if (cDist <= 2) {
            const chainDmg = calcDamage(
              def.dmg * buff.dmgMult * 0.7, // chain damage falloff
              def.attackType,
              e.armorType as ArmorType,
              1.0,
            );
            e.hp -= Math.round(chainDmg);
            chained++;
          }
        }
      }

      d.unit.attackCooldown = def.atkSpeed > 0 ? 1 / def.atkSpeed : 999;
      continue; // chain already handled attack
    }

    // Suicide special (boomba)
    if (def.special === 'suicide') {
      // Boombas don't have normal attacks, they move and explode on contact
      for (const e of enemies) {
        if (!e.alive) continue;
        const eDist = dist(d.unit.x, d.unit.y, e.x, e.y);
        if (eDist < 1) {
          // Explode!
          const splashRadius = def.splashRadius ?? 2.0;
          const splashRatio = def.splashDmgRatio ?? 1.0;
          for (const target of enemies) {
            if (!target.alive) continue;
            const tDist = dist(d.unit.x, d.unit.y, target.x, target.y);
            if (tDist <= splashRadius) {
              const dmg = calcDamage(
                def.dmg * splashRatio * buff.dmgMult,
                def.attackType,
                target.armorType as ArmorType,
                1.0,
              );
              target.hp -= Math.round(dmg);
            }
          }
          d.unit.hp = 0; // boomba dies
          break;
        }
      }
      continue;
    }

    // Normal/ranged attack
    if (def.dmg <= 0 || def.atkSpeed <= 0) continue;

    d.unit.attackCooldown -= deltaSec;
    if (d.unit.attackCooldown > 0) continue;

    let closestEnemy: UnitState | null = null;
    let closestEnemyDist = Infinity;

    for (const e of enemies) {
      if (!e.alive) continue;
      const eDist = dist(d.unit.x, d.unit.y, e.x, e.y);
      if (eDist <= def.range && eDist < closestEnemyDist) {
        closestEnemyDist = eDist;
        closestEnemy = e;
      }
    }

    if (!closestEnemy) continue;

    const dmg = calcDamage(
      def.dmg * buff.dmgMult,
      def.attackType,
      closestEnemy.armorType as ArmorType,
      1.0,
    );
    closestEnemy.hp -= Math.round(dmg);

    // Splash
    if (def.special === 'splash' && def.splashRadius) {
      for (const e of enemies) {
        if (e.id === closestEnemy.id) continue;
        if (!e.alive) continue;
        const sDist = dist(closestEnemy.x, closestEnemy.y, e.x, e.y);
        if (sDist <= def.splashRadius) {
          const splashDmg = calcDamage(
            def.dmg * (def.splashDmgRatio ?? 0.5) * buff.dmgMult,
            def.attackType,
            e.armorType as ArmorType,
            1.0,
          );
          e.hp -= Math.round(splashDmg);
        }
      }
    }

    d.unit.attackCooldown = 1 / def.atkSpeed;
  }

  // ── 4. Mark dead units ──
  const deadEnemyIds: string[] = [];
  state.enemies.forEach((enemy, id) => {
    if (enemy.hp <= 0 && enemy.alive) {
      enemy.alive = false;
      deadEnemyIds.push(id);
    }
  });

  const deadDefenderIds: { sessionId: string; unitId: string }[] = [];
  state.players.forEach((player, sessionId) => {
    player.units.forEach((unit, unitId) => {
      if (unit.hp <= 0 && unit.alive) {
        unit.alive = false;
        deadDefenderIds.push({ sessionId, unitId });
      }
    });
  });

  // Remove dead units
  for (const id of deadEnemyIds) {
    state.enemies.delete(id);
  }
  for (const { sessionId, unitId } of deadDefenderIds) {
    const player = state.players.get(sessionId);
    if (player) player.units.delete(unitId);
  }
}

// Enemy stat lookup by type (since enemies don't use unitDefs)
interface EnemyStats {
  dmg: number;
  atkSpeed: number;
  range: number;
  special?: string;
  splashRadius?: number;
  splashDmgRatio?: number;
}

const ENEMY_STATS: Record<string, EnemyStats> = {
  grunt:      { dmg: 5, atkSpeed: 0.8, range: 1 },
  brute:      { dmg: 8, atkSpeed: 0.6, range: 1 },
  siege_mech: { dmg: 25, atkSpeed: 0.3, range: 5, special: 'splash', splashRadius: 2.0, splashDmgRatio: 0.5 },
  boss:       { dmg: 20, atkSpeed: 0.5, range: 1 },
};

function getEnemyStats(type: string): EnemyStats {
  return ENEMY_STATS[type] ?? ENEMY_STATS.grunt;
}
