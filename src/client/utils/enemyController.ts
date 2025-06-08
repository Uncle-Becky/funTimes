import type * as ThreeType from 'three';
import type { Enemy, EnemyType, Path } from '../../shared/types/game';

/**
 * EnemyController manages enemy creation, movement, removal, and mesh management.
 * Hooks for Anime.js-powered effects are provided for spawn, movement, and death.
 */
export class EnemyController {
  private enemies: Enemy[] = [];
  private enemyMeshes: Map<string, ThreeType.Mesh> = new Map();
  private THREE: typeof ThreeType;

  constructor(
    THREE: typeof ThreeType,
    private sceneAdd: (mesh: ThreeType.Mesh) => void,
    private sceneRemove: (mesh: ThreeType.Mesh) => void
  ) {
    this.THREE = THREE;
  }

  getAll(): Enemy[] {
    return this.enemies;
  }

  getMesh(id: string): ThreeType.Mesh | undefined {
    return this.enemyMeshes.get(id);
  }

  spawnEnemy(type: EnemyType, path: Path): Enemy {
    // Example config (should be extensible)
    const ENEMY_CONFIG = {
      goblin: { health: 5, speed: 2 },
      orc: { health: 10, speed: 1.5 },
      ogre: { health: 25, speed: 1 },
    };
    const config = ENEMY_CONFIG[type];
    const startTile = path.waypoints[0];
    if (!startTile) {
      throw new Error('Cannot spawn enemy: path has no waypoints');
    }
    const enemy: Enemy = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type,
      health: config.health,
      speed: config.speed,
      position: { x: startTile.x, y: startTile.y },
      pathIndex: 0,
    };
    this.enemies.push(enemy);
    // Create mesh
    const tileSize = 5;
    const geometry = new this.THREE.SphereGeometry(tileSize / 3, 8, 8);
    let color = 0xff0000;
    if (enemy.type === 'orc') color = 0x00cc00;
    if (enemy.type === 'ogre') color = 0x3333ff;
    const material = new this.THREE.MeshToonMaterial({ color });
    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.userData.id = enemy.id;
    mesh.position.set(
      enemy.position.x * tileSize + tileSize / 2,
      tileSize / 3,
      enemy.position.y * tileSize + tileSize / 2
    );
    this.enemyMeshes.set(enemy.id, mesh);
    this.sceneAdd(mesh);
    // Stub: Animate spawn (Anime.js pattern #5)
    // this.animateSpawn(mesh);
    return enemy;
  }

  moveEnemy(enemy: Enemy, path: Path, deltaTime: number): void {
    // Move enemy along path (stub for extensibility)
    // Stub: Animate movement (Anime.js pattern #6)
    // this.animateMovement(mesh, ...)
  }

  removeEnemy(enemyId: string): void {
    const mesh = this.enemyMeshes.get(enemyId);
    if (mesh) {
      // Stub: Animate death (Anime.js pattern #7)
      // this.animateDeath(mesh);
      this.sceneRemove(mesh);
      this.enemyMeshes.delete(enemyId);
    }
    this.enemies = this.enemies.filter((e) => e.id !== enemyId);
  }

  // --- Animation Stubs (to be implemented with Anime.js) ---
  animateSpawn(mesh: ThreeType.Mesh): void {
    // Animate spawn portal or effect
  }
  animateMovement(mesh: ThreeType.Mesh): void {
    // Animate movement along spline or with effects
  }
  animateDeath(mesh: ThreeType.Mesh): void {
    // Animate death explosion or fade
  }
}
