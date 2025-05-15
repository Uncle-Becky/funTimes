import express from 'express';
import { createServer } from 'http';

import { GameOverResponse, LeaderboardResponse, PersistedGameState } from '../shared/types/game';
import { type InitMessage } from '../shared/types/message';
import {
  leaderboardForPostForUserGet,
  leaderboardForPostGet,
  leaderboardForPostUpsertIfHigherScore,
} from './core/leaderboardForPost';
import { postConfigGet } from './core/post';
import { noUser, setPlayingIfNotExists, userGetOrSet } from './core/user';
import { devvitMiddleware } from './middleware';

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

// Apply Devvit middleware
app.use(devvitMiddleware);

const router = express.Router();

router.get<{ postId: string }, InitMessage | { status: string; message: string }>(
  '/api/init',
  async (req, res): Promise<void> => {
    const { redis, userId, postId } = req.devvit;

    if (!postId) {
      console.error('API Init Error: postId not found in devvit context');
      res
        .status(400)
        .json({ status: 'error', message: 'postId is required but missing from context' });
      return;
    }

    try {
      const [postConfig, user, leaderboard, userAllTimeStats] = await Promise.all([
        postConfigGet({ redis, postId }),
        userGetOrSet({ ctx: req.devvit }),
        leaderboardForPostGet({ redis, postId, limit: 4 }),
        leaderboardForPostForUserGet({
          redis,
          postId,
          userId: userId ?? noUser().id,
        }),
      ]);

      res.json({
        type: 'init',
        postConfig,
        user,
        userAllTimeStats,
        postId: postId,
        leaderboard,
      });
    } catch (error) {
      console.error(`API Init Error for post ${postId}:`, error);
      let errorMessage = 'Unknown error during initialization';
      if (error instanceof Error) {
        errorMessage = `Initialization failed: ${error.message}`;
      }
      res.status(500).json({ status: 'error', message: errorMessage });
    }
  }
);

router.post<{ postId: string }, GameOverResponse, { score: number }>(
  '/api/post/game-over',
  async (req, res): Promise<void> => {
    const { score } = req.body;

    const { postId } = req.devvit;
    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    if (score == null) {
      res.status(400).json({
        status: 'error',
        message: 'score is required',
      });
      return;
    }

    if (!req.devvit.userId) {
      res.status(400).json({
        status: 'error',
        message: 'Must be logged in to play',
      });
      return;
    }

    await userGetOrSet({
      ctx: req.devvit,
    });

    await Promise.all([
      leaderboardForPostUpsertIfHigherScore({
        redis: req.devvit.redis,
        postId,
        userId: req.devvit.userId,
        score: score,
      }),
      setPlayingIfNotExists({
        redis: req.devvit.redis,
        userId: req.devvit.userId,
      }),
    ]);

    const [leaderboard, userAllTimeStats] = await Promise.all([
      leaderboardForPostGet({
        redis: req.devvit.redis,
        postId,
      }),
      leaderboardForPostForUserGet({
        redis: req.devvit.redis,
        postId,
        userId: req.devvit.userId,
      }),
    ]);
    res.json({
      status: 'success',
      leaderboard,
      userAllTimeStats,
    });

    // Clear saved state
    if (req.devvit.userId) {
      await req.devvit.redis.del(`game_state:${req.devvit.postId}:${req.devvit.userId}`);
    }
  }
);

router.get<{ postId: string }, LeaderboardResponse>(
  '/api/post/leaderboard',
  async (req, res): Promise<void> => {
    const { postId } = req.devvit;

    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    const leaderboard = await leaderboardForPostGet({
      redis: req.devvit.redis,
      postId,
    });

    res.json({
      status: 'success',
      leaderboard,
    });
  }
);

// Save game state
router.post<{ postId: string }, { status: string; message?: string }, PersistedGameState>(
  '/api/post/save-state',
  async (req, res): Promise<void> => {
    const { postId } = req.devvit;
    const { userId } = req.body;
    if (!postId || !userId) {
      res.status(400).json({ status: 'error', message: 'postId and userId required' });
      return;
    }
    await req.devvit.redis.set(`game_state:${postId}:${userId}`, JSON.stringify(req.body));
    res.json({ status: 'success' });
  }
);

// Load game state
router.get<
  { postId: string; userId: string },
  PersistedGameState | { status: string; message?: string }
>('/api/post/load-state', async (req, res): Promise<void> => {
  const { postId, userId } = req.query;
  if (!postId || !userId) {
    res.status(400).json({ status: 'error', message: 'postId and userId required' });
    return;
  }
  const state = await req.devvit.redis.get(`game_state:${postId}:${userId}`);
  if (!state) {
    res.status(404).json({ status: 'error', message: 'No saved state' });
    return;
  }
  res.json(JSON.parse(state));
});

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = process.env.WEBBIT_PORT || 3000;

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port, () => console.log(`http://localhost:${port}`));
