import type { Enemy, Troop, TroopUpgrade } from '../../shared/types/game';

/**
 * TroopController manages troop logic: placement, upgrades, attacks, and abilities.
 * Hooks for Anime.js-powered effects are provided for projectiles and upgrades.
 */
export class TroopController {
  private troops: Troop[] = [];

  constructor(initialTroops?: Troop[]) {
    if (initialTroops) this.troops = initialTroops;
  }

  getAll(): Troop[] {
    return this.troops;
  }

  addTroop(troop: Troop): void {
    this.troops.push(troop);
  }

  upgradeTroop(troopId: string, upgrade: TroopUpgrade): void {
    const troop = this.troops.find((t) => t.id === troopId);
    if (!troop) return;
    troop.level = upgrade.level;
    if (upgrade.range) troop.range = upgrade.range;
    if (upgrade.damage) troop.damage = upgrade.damage;
    if (upgrade.fireRate) troop.fireRate = upgrade.fireRate;
    if (!troop.upgrades) troop.upgrades = [];
    troop.upgrades.push(upgrade);
    // Stub: Animate upgrade (e.g., tower transformation)
    // this.animateUpgrade(troop);
  }

  useAbility(troopId: string, abilityName: string): void {
    // Find troop and trigger ability effect (stub)
    // this.animateAbility(troop, abilityName);
  }

  attack(troop: Troop, enemies: Enemy[]): Enemy | null {
    // Find target and apply damage (stub for extensibility)
    // This is where projectile animation would be triggered
    // this.fireProjectile(troop, target);
    return null;
  }

  // --- Animation Stubs (to be implemented with Anime.js) ---

  fireProjectile(troop: Troop, target: Enemy): void {
    // Animate projectile from troop to target (Anime.js pattern #1)
  }

  animateUpgrade(troop: Troop): void {
    // Animate tower transformation (Anime.js pattern #2)
  }

  animateAbility(troop: Troop, abilityName: string): void {
    // Animate ability activation (e.g., splash, freeze, etc.)
  }
}
