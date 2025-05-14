import { PostConfig } from './postConfig';
import { User } from './user';

export type InitMessage = {
  type: 'init';
  postConfig: PostConfig;
  user: User;
  postId: string;
  leaderboard: {
    user: User;
    score: number;
  }[];
  userAllTimeStats: {
    score: number;
    rank: number;
  };
};
