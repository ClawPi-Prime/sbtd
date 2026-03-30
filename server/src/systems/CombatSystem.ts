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

function getEnemiesForPlayer(state: GameState, sessionId: string): UnitState[] {
  const result: UnitState[] = [];
  state.enemies.forEach((enemy) => {
    if (enemy.alive && enemy.ownerId === sessionId) result.push(enemy);
  });
  return result;
}

export function tickCombat(
  state: GameState,
  deltaSec: number,
  unitDefs: Record<string, UnitDef>,
): void {
  // Process each player's lane independently:
  // defenders owned by player X fight enemies owned by player X
  state.players.forEach((player, sessionId) => {
    const defenders = getAllDefenders(state).filter(d => d.playerSessionId === sessionId);
    const enemies = getEnemiesForPlayer(state, sessionId);

    // Populate defs
    for (const d of defenders) {
      d.def = unitDefs[d.unit.type];
    }

    const PURSUIT_RANGE_MULT = 2.5; // pursue enemies within range * 2.5
    const MOVE_SPEED = 2.0; // cells per second (same as prototype feeling)

    for (const d of defenders) {
      const def = d.def;
      if (!def) continue;

      // Find nearest enemy within pursuit range
      let nearestEnemy: UnitState | null = null;
      let nearestDist = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        const eDist = dist(d.unit.x, d.unit.y, e.x, e.y);
        if (eDist < nearestDist) {
          nearestDist = eDist;
          nearestEnemy = e;
        }
      }

      const pursuitRange = (def.range ?? 2) * PURSUIT_RANGE_MULT;

      if (nearestEnemy && nearestDist <= pursuitRange && nearestDist > (def.range ?? 2)) {
        // Move toward enemy
        const dx = nearestEnemy.x - d.unit.x;
        const dy = nearestEnemy.y - d.unit.y;
        const mag = Math.sqrt(dx*dx + dy*dy);
        if (mag > 0.1) {
          d.unit.x += (dx/mag) * Math.min(MOVE_SPEED * deltaSec, mag);
          d.unit.y += (dy/mag) * Math.min(MOVE_SPEED * deltaSec, mag);
        }
      } else if (!nearestEnemy || nearestDist > pursuitRange) {
        // Return to home position
        const dx = d.unit.homeX - d.unit.x;
        const dy = d.unit.homeY - d.unit.y;
        const mag = Math.sqrt(dx*dx + dy*dy);
        if (mag > 0.05) {
          d.unit.x += (dx/mag) * Math.min(MOVE_SPEED * 0.5 * deltaSec, mag);
          d.unit.y += (dy/mag) * Math.min(MOVE_SPEED * 0.5 * deltaSec, mag);
        }
      }
      // When in range, stay put (attack from current position)
    }

    // ── 1. Aura buffs ──
    const auraBuffs = new Map<string, AuraBuff>();
    for (const d of defenders) {
      auraBuffs.set(d.unit.id, { dmgMult: 1.0, armorBonus: 0 });
    }
    for (const d of defenders) {
      const def = d.def;
      if (!def || def.special !== 'aura') continue;
      const auraRange = def.auraRange ?? 0;
      for (const other of defenders) {
        if (other.unit.id === d.unit.id) continue;
        const distance = dist(d.unit.x, d.unit.y, other.unit.x, other.unit.y);
        if (distance <= auraRange) {
          const buff = auraBuffs.get(other.unit.id)!;
          buff.dmgMult += def.auraDmg ?? 0;
          buff.armorBonus += def.auraArmor ?? 0;
        }
      }
    }

    // ── 2. Enemy attacks on defenders ──
    for (const enemy of enemies) {
      if (!enemy.alive || enemy.atkSpeed <= 0) continue;
      enemy.attackCooldown -= deltaSec;
      if (enemy.attackCooldown > 0) continue;

      let closestDef: { unit: UnitState; def: UnitDef | undefined } | null = null;
      let closestDist = Infinity;
      for (const d of defenders) {
        if (!d.unit.alive) continue;
        const distance = dist(enemy.x, enemy.y, d.unit.x, d.unit.y);
        if (distance < closestDist) { closestDist = distance; closestDef = d; }
      }
      if (!closestDef || closestDist > enemy.range) continue;

      const rawDmg = calcDamage(enemy.dmg, enemy.attackType as AttackType, closestDef.unit.armorType as ArmorType, 1.0);
      closestDef.unit.hp -= Math.round(rawDmg);

      const enemyStats = getEnemyStats(enemy.type);
      if (enemyStats.special === 'splash' && enemyStats.splashRadius) {
        for (const d of defenders) {
          if (d.unit.id === closestDef.unit.id || !d.unit.alive) continue;
          const sDist = dist(closestDef.unit.x, closestDef.unit.y, d.unit.x, d.unit.y);
          if (sDist <= enemyStats.splashRadius) {
            d.unit.hp -= Math.round(calcDamage(enemy.dmg * (enemyStats.splashDmgRatio ?? 0.5), enemy.attackType as AttackType, d.unit.armorType as ArmorType, 1.0));
          }
        }
      }
      enemy.attackCooldown = 1 / enemy.atkSpeed;
    }

    // ── 3. Defender attacks on enemies ──
    for (const d of defenders) {
      const def = d.def;
      if (!def || !d.unit.alive) continue;
      const buff = auraBuffs.get(d.unit.id) ?? { dmgMult: 1.0, armorBonus: 0 };

      // Heal
      if (def.special === 'heal' && def.healPerSecond) {
        d.unit.healCooldown -= deltaSec;
        if (d.unit.healCooldown <= 0) {
          let lowestHpAlly: UnitState | null = null;
          let lowestRatio = 1.0;
          const healRange = def.range > 0 ? def.range : 3;
          for (const other of defenders) {
            if (other.unit.id === d.unit.id || !other.unit.alive || other.unit.hp >= other.unit.maxHp) continue;
            if (dist(d.unit.x, d.unit.y, other.unit.x, other.unit.y) > healRange) continue;
            const ratio = other.unit.hp / other.unit.maxHp;
            if (ratio < lowestRatio) { lowestRatio = ratio; lowestHpAlly = other.unit; }
          }
          if (lowestHpAlly) lowestHpAlly.hp = Math.min(lowestHpAlly.maxHp, lowestHpAlly.hp + def.healPerSecond);
          d.unit.healCooldown = 1.0;
        }
        continue;
      }

      // Chain (tesla_coil)
      if (def.special === 'chain' && def.chainTargets) {
        d.unit.attackCooldown -= deltaSec;
        if (d.unit.attackCooldown > 0) continue;
        let primary: UnitState | null = null;
        let primaryDist = Infinity;
        for (const e of enemies) {
          if (!e.alive) continue;
          const eDist = dist(d.unit.x, d.unit.y, e.x, e.y);
          if (eDist <= def.range && eDist < primaryDist) { primaryDist = eDist; primary = e; }
        }
        if (primary) {
          primary.hp -= Math.round(calcDamage(def.dmg * buff.dmgMult, def.attackType, primary.armorType as ArmorType, 1.0));
          let chained = 0;
          for (const e of enemies) {
            if (chained >= def.chainTargets || !e.alive || e.id === primary.id) continue;
            if (dist(primary.x, primary.y, e.x, e.y) <= 2) {
              e.hp -= Math.round(calcDamage(def.dmg * buff.dmgMult * 0.7, def.attackType, e.armorType as ArmorType, 1.0));
              chained++;
            }
          }
        }
        d.unit.attackCooldown = def.atkSpeed > 0 ? 1 / def.atkSpeed : 999;
        continue;
      }

      // Suicide (boomba)
      if (def.special === 'suicide') {
        for (const e of enemies) {
          if (!e.alive) continue;
          if (dist(d.unit.x, d.unit.y, e.x, e.y) < 1) {
            for (const target of enemies) {
              if (!target.alive) continue;
              if (dist(d.unit.x, d.unit.y, target.x, target.y) <= (def.splashRadius ?? 2.0)) {
                target.hp -= Math.round(calcDamage(def.dmg * (def.splashDmgRatio ?? 1.0) * buff.dmgMult, def.attackType, target.armorType as ArmorType, 1.0));
              }
            }
            d.unit.hp = 0;
            break;
          }
        }
        continue;
      }

      // Normal attack
      if (def.dmg <= 0 || def.atkSpeed <= 0) continue;
      d.unit.attackCooldown -= deltaSec;
      if (d.unit.attackCooldown > 0) continue;

      let closestEnemy: UnitState | null = null;
      let closestEnemyDist = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        const eDist = dist(d.unit.x, d.unit.y, e.x, e.y);
        if (eDist <= def.range && eDist < closestEnemyDist) { closestEnemyDist = eDist; closestEnemy = e; }
      }
      if (!closestEnemy) continue;

      closestEnemy.hp -= Math.round(calcDamage(def.dmg * buff.dmgMult, def.attackType, closestEnemy.armorType as ArmorType, 1.0));

      if (def.special === 'splash' && def.splashRadius) {
        for (const e of enemies) {
          if (e.id === closestEnemy.id || !e.alive) continue;
          if (dist(closestEnemy.x, closestEnemy.y, e.x, e.y) <= def.splashRadius) {
            e.hp -= Math.round(calcDamage(def.dmg * (def.splashDmgRatio ?? 0.5) * buff.dmgMult, def.attackType, e.armorType as ArmorType, 1.0));
          }
        }
      }
      d.unit.attackCooldown = 1 / def.atkSpeed;
    }

    void player; // suppress unused warning
  });

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
