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
