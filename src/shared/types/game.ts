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
}

export interface MapGrid {
  width: number;
  height: number;
  tiles: Tile[][];
  path: { x: number; y: number }[]; // Enemy path waypoints
}

export interface Wave {
  enemies: Array<{ type: string; count: number }>;
}

export interface PlayerState {
  money: number;
  lives: number;
  troops: Troop[];
  currentWave: number;
}

export type EnemyType = 'goblin' | 'orc' | 'ogre';
