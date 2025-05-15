import {
  GameOverBody,
  GameOverResponse,
  LeaderboardResponse,
  PersistedGameState,
} from '../shared/types/game';

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

  async saveState(state: PersistedGameState) {
    const response = await fetch(`/api/post/save-state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    });
    if (!response.ok) {
      throw new Error('Failed to save game state');
    }
    const data = await response.json();
    if (data.status === 'error') {
      throw new Error(data.message || 'Failed to save game state');
    }
    return data;
  }

  async loadState(postId: string, userId: string): Promise<PersistedGameState | null> {
    const params = new URLSearchParams({ postId, userId });
    const response = await fetch(`/api/post/load-state?${params.toString()}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to load game state');
    }
    const data = await response.json();
    if (data.status === 'error') {
      return null;
    }
    return data as PersistedGameState;
  }
}
