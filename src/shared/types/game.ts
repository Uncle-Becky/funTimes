import type { User } from './user';

type Response<T> = { status: 'error'; message: string } | ({ status: 'success' } & T);

export type LeaderboardResponse = Response<{
  leaderboard: {
    user: User;
    score: number;
  }[];
}>;

export type GameOverResponse = Response<{
  leaderboard: {
    user: User;
    score: number;
  }[];
  userAllTimeStats: {
    rank: number;
    score: number;
  };
}>;

export type GameOverBody = {
  score: number;
};

// --- Tower Defense Core Types ---

export type TerrainType = 'grass' | 'dirt' | 'water' | 'road' | 'mountain';
export type ObstacleType = 'rock' | 'tree' | 'wall' | 'none';

export type TroopType = 'infantry' | 'archer' | 'mage' | 'cannon';

export interface Troop {
  id: string;
  type: TroopType;
  position: { x: number; y: number };
  level: number;
  range: number;
  damage: number;
  fireRate: number;
  cost: number;
  currentTargetId?: string | null; // Added for performance
  upgrades?: TroopUpgrade[];
  abilities?: TroopAbility[];
  statusEffects?: TroopStatusEffect[];
}

export interface TroopUpgrade {
  level: number;
  cost: number;
  range?: number;
  damage?: number;
  fireRate?: number;
  description?: string;
}

export interface TroopAbility {
  name: string;
  cooldown: number;
  lastUsed?: number;
  effect: string; // e.g., 'splash', 'freeze', 'pierce', etc.
  // Future: parameters for effect
}

export interface TroopStatusEffect {
  type: string; // e.g., 'buff', 'debuff', 'stun', etc.
  duration: number;
  value?: number;
}

export interface Enemy {
  id: string;
  type: string;
  health: number;
  speed: number;
  position: { x: number; y: number };
  pathIndex: number;
}

export interface Tile {
  x: number;
  y: number;
  occupied: boolean;
  troopId?: string;
  highlight?: 'none' | 'valid' | 'invalid';
  terrainType?: TerrainType;
  obstacle?: ObstacleType;
}

export interface Path {
  id: string;
  waypoints: { x: number; y: number }[];
  type: 'ground' | 'air'; // For future flying units
  // Optionally, a spline for air units
  splinePoints?: { x: number; y: number; z: number }[];
}

export interface MapGrid {
  width: number;
  height: number;
  tiles: Tile[][];
  paths: Path[]; // Multiple paths supported
}

export interface Wave {
  enemies: Array<{ type: string; count: number; pathId?: string }>;
}

export interface PlayerState {
  money: number;
  lives: number;
  troops: Troop[];
  currentWave: number;
}

export type EnemyType = 'goblin' | 'orc' | 'ogre';

export interface PersistedGameState {
  userId: string;
  postId: string;
  money: number;
  lives: number;
  currentWave: number;
  troops: Troop[];
  timestamp: number;
}
