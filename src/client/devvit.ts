import { GameOverBody, GameOverResponse, LeaderboardResponse } from '../shared/types/game';

export class Devvit {
  userId: string | null | undefined;

  constructor({ userId }: { userId: string | null }) {
    this.userId = userId;
  }

  async leaderboard() {
    const response = await fetch(`/api/post/leaderboard`);

    if (!response.ok) {
      throw new Error('Failed to fetch leaderboard');
    }

    const data = (await response.json()) as LeaderboardResponse;

    if (data.status === 'error') {
      throw new Error(data.message);
    }

    return data;
  }

  async gameOver(score: number) {
    if (!this.userId) {
      throw new Error('User not found');
    }

    const response = await fetch(`/api/post/game-over`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ score } as GameOverBody),
    });

    if (!response.ok) {
      throw new Error('Failed to submit score');
    }

    const data = (await response.json()) as GameOverResponse;

    if (data.status === 'error') {
      throw new Error(data.message);
    }

    return data;
  }
}
