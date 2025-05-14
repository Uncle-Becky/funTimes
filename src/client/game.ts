import { Easing, Tween, update as tweenjsUpdate } from '@tweenjs/tween.js';
import Stats from 'three/examples/jsm/libs/stats.module';
import { Vector3 } from 'three';
import { Block } from './block';
import { Stage } from './stage';
import { Ticker } from './ticker';
import { getEnv } from './utils/env';
import { Pool } from './utils/pool';
import { Devvit } from './devvit';
import type { PostConfig } from '../shared/types/postConfig';
import { User } from '../shared/types/user';
import { InitMessage } from '../shared/types/message';

type GameState = 'loading' | 'ready' | 'playing' | 'ended' | 'resetting';

export class Game {
  private devvit!: Devvit;
  private mainContainer!: HTMLElement;
  private scoreContainer!: HTMLElement;
  private instructions!: HTMLElement;
  private leaderboardList!: HTMLElement;
  private gameOverText!: HTMLElement;
  private ticker!: Ticker;

  private state: GameState = 'loading';
  private stage!: Stage;
  private blocks: Block[] = [];

  private pool!: Pool<Block>;

  private stats!: Stats;

  private colorOffset!: number;

  private userAllTimeStats: {
    score: number;
    rank: number;
  } | null = null;

  /** Configuration data received from the init message */
  private config!: PostConfig;

  public async prepare(width: number, height: number, devicePixelRatio: number): Promise<void> {
    // Fetch init data directly from the API endpoint
    let initData: InitMessage;
    try {
      const response = await fetch(`/api/init`);
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      const data = await response.json();
      // Basic type check
      if (data.type !== 'init') {
        throw new Error('Invalid init data received');
      }
      initData = data as InitMessage;
      console.log('Received init data:', initData);
    } catch (error) {
      console.error('Failed to fetch init data:', error);
      // Handle error appropriately - maybe show an error message in the UI
      this.updateState('loading'); // Keep showing loading or show error state
      // Optional: Display error to user
      const container = document.getElementById('container');
      if (container) {
        container.innerHTML =
          '<p style="color: red; padding: 1em;">Failed to load game configuration. Please try refreshing.</p>';
      }
      return; // Stop preparation
    }

    this.devvit = new Devvit({
      userId: initData.user.id,
    });

    // Save per-post configuration for use throughout the game
    this.config = initData.postConfig;
    this.userAllTimeStats = initData.userAllTimeStats;

    this.mainContainer = document.getElementById('container') as HTMLElement;
    this.scoreContainer = document.getElementById('score') as HTMLElement;
    this.instructions = document.getElementById('instructions') as HTMLElement;
    this.leaderboardList = document.getElementById('leaderboard-list') as HTMLElement;
    this.gameOverText = document.getElementById('game-over-text') as HTMLElement;

    this.updateLeaderboard(initData.leaderboard);

    this.scoreContainer.innerHTML = '0';

    this.stage = new Stage(this.config, devicePixelRatio);
    this.stage.resize(width, height);

    this.blocks = [];
    this.addBaseBlock();

    this.pool = new Pool(() => new Block());

    if (getEnv().MODE === 'development') {
      this.stats = Stats();
      document.body.appendChild(this.stats.dom);
    }

    this.ticker = new Ticker((currentTime: number, deltaTime: number) => {
      tweenjsUpdate(currentTime);

      this.update(deltaTime);
      this.render();

      this.stats?.update();
    });

    this.updateState('ready');
  }

  public async start(): Promise<void> {
    this.ticker.start();
  }

  public async pause(): Promise<void> {
    this.ticker.stop();
  }

  public resize(width: number, height: number): void {
    this.stage.resize(width, height);
  }

  private update(deltaTime: number): void {
    this.moveCurrentBlock(deltaTime);
  }

  private render(): void {
    this.stage.render();
  }

  private updateState(newState: GameState): void {
    this.mainContainer.classList.remove(this.state);
    this.state = newState;
    this.mainContainer.classList.add(this.state);
  }

  public async action(): Promise<void> {
    switch (this.state) {
      case 'ready':
        await this.startGame();
        break;
      case 'playing':
        await this.placeBlock();
        break;
      case 'ended':
        await this.restartGame();
        break;
    }
  }

  private async startGame(): Promise<void> {
    if (this.state === 'playing') return;
    this.colorOffset = Math.round(Math.random() * 100);
    this.scoreContainer.innerHTML = '0';
    this.updateState('playing');
    this.addBlock(this.blocks[0]!);
  }

  private async restartGame(): Promise<void> {
    this.updateState('resetting');

    const length = this.blocks.length;
    const duration = 200;
    const delay = 20;

    for (let i = length - 1; i > 0; i--) {
      new Tween(this.blocks[i]!.scale)
        .to({ x: 0, y: 0, z: 0 }, duration)
        .delay((length - i - 1) * delay)
        .easing(Easing.Cubic.In)
        .onComplete(() => {
          this.stage.remove(this.blocks[i]!.getMesh());
          this.pool.release(this.blocks[i]!);
        })
        .start();

      new Tween(this.blocks[i]!.rotation)
        .to({ y: 0.5 }, duration)
        .delay((length - i - 1) * delay)
        .easing(Easing.Cubic.In)
        .start();
    }

    const cameraMoveSpeed = duration * 2 + length * delay;
    this.stage.resetCamera(cameraMoveSpeed);

    const countdown = { value: length - 1 - 1 };
    new Tween(countdown)
      .to({ value: 0 }, cameraMoveSpeed)
      .onUpdate(() => {
        this.scoreContainer.innerHTML = String(Math.floor(countdown.value));
      })
      .start();

    setTimeout(async () => {
      this.blocks = this.blocks.slice(0, 1);
      await this.startGame();
    }, cameraMoveSpeed);
  }

  private async endGame(): Promise<void> {
    const score = Number(this.scoreContainer.innerText);
    const data = await this.devvit.gameOver(score);

    if (this.userAllTimeStats && score > this.userAllTimeStats.score) {
      this.gameOverText.innerHTML = `New high score!`;
    } else {
      this.gameOverText.innerHTML = `Click or spacebar to start again`;
    }
    // Set the new all time stats if they play a bunch
    this.userAllTimeStats = data.userAllTimeStats;
    this.updateLeaderboard(data.leaderboard);

    this.updateState('ended');
  }

  private async placeBlock(): Promise<void> {
    const length = this.blocks.length;
    const targetBlock = this.blocks[length - 2];
    const currentBlock = this.blocks[length - 1];

    const result = currentBlock!.cut(targetBlock!, this.config.gameplay.accuracy);

    if (result.state === 'missed') {
      this.stage.remove(currentBlock!.getMesh());
      await this.endGame();
      return;
    }

    this.scoreContainer.innerHTML = String(length - 1);
    this.addBlock(currentBlock!);

    if (result.state === 'chopped') {
      this.addChoppedBlock(result.position!, result.scale!, currentBlock!);
    }
  }

  private addBaseBlock(): void {
    const { scale, color } = this.config.block.base;
    const block = new Block(new Vector3(scale.x, scale.y, scale.z));
    this.stage.add(block.getMesh());
    this.blocks.push(block);
    block.color = parseInt(color, 16);
  }

  private addBlock(targetBlock: Block): void {
    const block = this.pool.get();

    block.rotation.set(0, 0, 0);
    block.scale.set(targetBlock.scale.x, targetBlock.scale.y, targetBlock.scale.z);
    block.position.set(targetBlock.x, targetBlock.y + targetBlock.height, targetBlock.z);
    block.direction.set(0, 0, 0);
    block.color = this.getNextBlockColor();

    this.stage.add(block.getMesh());
    this.blocks.push(block);

    const length = this.blocks.length;
    if (length % 2 === 0) {
      block.direction.x = Math.random() > 0.5 ? 1 : -1;
    } else {
      block.direction.z = Math.random() > 0.5 ? 1 : -1;
    }

    block.moveScalar(this.config.gameplay.distance);
    this.stage.setCamera(block.y);

    this.scoreContainer.innerHTML = String(length - 1);
    if (length >= this.config.instructions.height) {
      this.instructions.classList.add('hide');
    }
  }

  private addChoppedBlock(position: Vector3, scale: Vector3, sourceBlock: Block): void {
    const block = this.pool.get();

    block.rotation.set(0, 0, 0);
    block.scale.set(scale.x, scale.y, scale.z);
    block.position.copy(position);
    block.color = sourceBlock.color;

    this.stage.add(block.getMesh());

    const dirX = Math.sign(block.x - sourceBlock.x);
    const dirZ = Math.sign(block.z - sourceBlock.z);
    new Tween(block.position)
      .to(
        {
          x: block.x + dirX * 10,
          y: block.y - 30,
          z: block.z + dirZ * 10,
        },
        1000
      )
      .easing(Easing.Quadratic.In)
      .onComplete(() => {
        this.stage.remove(block.getMesh());
        this.pool.release(block);
      })
      .start();

    new Tween(block.rotation)
      .to({ x: dirZ * 5, z: dirX * -5 }, 900)
      .delay(50)
      .start();
  }

  private moveCurrentBlock(deltaTime: number): void {
    if (this.state !== 'playing') return;

    const length = this.blocks.length;
    if (length < 2) return;

    const speed = 0.16 + Math.min(0.0008 * length, 0.08);
    this.blocks[length - 1]!.moveScalar(speed * deltaTime);

    this.reverseDirection();
  }

  private reverseDirection(): void {
    const length = this.blocks.length;
    if (length < 2) return;

    const targetBlock = this.blocks[length - 2];
    const currentBlock = this.blocks[length - 1];

    const { distance } = this.config.gameplay;

    const diffX = currentBlock!.x - targetBlock!.x;
    if (
      (currentBlock!.direction.x === 1 && diffX > distance) ||
      (currentBlock!.direction.x === -1 && diffX < -distance)
    ) {
      currentBlock!.direction.x *= -1;
      return;
    }

    const diffZ = currentBlock!.z - targetBlock!.z;
    if (
      (currentBlock!.direction.z === 1 && diffZ > distance) ||
      (currentBlock!.direction.z === -1 && diffZ < -distance)
    ) {
      currentBlock!.direction.z *= -1;
      return;
    }
  }

  private getNextBlockColor(): number {
    const { base, range, intensity } = this.config.block.colors;
    const offset = this.blocks.length + this.colorOffset;
    const r = base.r + range.r * Math.sin(intensity.r * offset);
    const g = base.g + range.g * Math.sin(intensity.g * offset);
    const b = base.b + range.b * Math.sin(intensity.b * offset);
    return (r << 16) + (g << 8) + b;
  }

  private updateLeaderboard(
    leaderboard: {
      user: User;
      score: number;
    }[]
  ) {
    // Note: Instead of clearing it out we should produce attribute of username:score instead of replacing the whole thing
    // that diff would take away the flash
    this.leaderboardList.innerHTML = '';

    leaderboard.forEach((leaderboardItem) => {
      const leaderboardItemElement = document.createElement('div');
      leaderboardItemElement.classList.add('leaderboard-item');

      const img = document.createElement('img');
      img.src = leaderboardItem.user.snoovatarUrl;
      leaderboardItemElement.appendChild(img);
      const userText = document.createElement('span');
      userText.innerHTML = `${leaderboardItem.user.username} | <b>${leaderboardItem.score}</b>`;
      leaderboardItemElement.appendChild(userText);

      this.leaderboardList.appendChild(leaderboardItemElement);
    });
  }
}
