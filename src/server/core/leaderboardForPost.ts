import { Devvit } from '@devvit/public-api';
import { userGet } from './user';
import { User } from '../../shared/types/user';

const getLeaderboardForPostKey = (postId: string) => `leaderboard:${postId}` as const;

export const leaderboardForPostGet = async ({
  redis,
  postId,
  sort = 'DESC',
  limit = 100,
}: {
  redis: Devvit.Context['redis'];
  postId: string;
  sort?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}): Promise<
  {
    user: User;
    score: number;
  }[]
> => {
  const result = await redis.zRange(getLeaderboardForPostKey(postId), 0, limit - 1, {
    by: 'rank',
    reverse: sort === 'DESC',
  });

  const users = await Promise.all(
    result.map((x) =>
      userGet({
        redis,
        userId: x.member,
      })
    )
  );

  // TODO: Filter out blocked users since we likely block people who game the system
  return result.map(({ member: memberString, score }) => {
    const user = users.find((x) => x.id === memberString);

    if (!user) {
      throw Error(`user not found: ${memberString}`);
    }

    return {
      user,
      score,
    };
  });
};

export const leaderboardForPostForUserGet = async ({
  redis,
  postId,
  userId,
}: {
  redis: Devvit.Context['redis'];
  postId: string;
  userId: string;
}): Promise<{ rank: number; score: number }> => {
  const [rank, score] = await Promise.all([
    redis.zRank(getLeaderboardForPostKey(postId), userId),
    redis.zScore(getLeaderboardForPostKey(postId), userId),
  ]);

  if (rank == null || score == null) {
    return { rank: 0, score: 0 };
  }

  return { rank, score };
};
/**
 * Adds if the user doesn't exist, otherwise updates the score
 */
export const leaderboardForPostUpsertIfHigherScore = async ({
  redis,
  postId,
  userId,
  score,
}: {
  redis: Devvit.Context['redis'];
  postId: string;
  userId: string;
  score: number;
}): Promise<void> => {
  const key = getLeaderboardForPostKey(postId);
  const currentScore = await redis.zScore(key, userId);
  if (currentScore === undefined || score > currentScore) {
    await redis.zAdd(key, {
      member: userId,
      score,
    });
  }
};
