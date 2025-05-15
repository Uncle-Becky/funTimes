import { Easing, Tween, update as tweenjsUpdate } from '@tweenjs/tween.js';
import {
  BoxGeometry,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshToonMaterial,
  OrthographicCamera,
  Raycaster,
  SphereGeometry,
  Vector3,
} from 'three';
import Stats from 'three/examples/jsm/libs/stats.module';
import type {
  Enemy,
  EnemyType,
  MapGrid,
  PlayerState,
  Tile,
  Troop,
  TroopType,
} from '../shared/types/game';
import { InitMessage } from '../shared/types/message';
import type { PostConfig } from '../shared/types/postConfig';
import { User } from '../shared/types/user';
import { Block } from './block';
import { Devvit } from './devvit';
import { Stage } from './stage';
import { Ticker } from './ticker';
import { getEnv } from './utils/env';
import { Pool } from './utils/pool';

type GameState = 'loading' | 'ready' | 'playing' | 'ended' | 'resetting';

// Simple troop stats/cost configuration (can be moved to a config file/object later)
const TROOP_CONFIG: Record<
  TroopType,
  { cost: number; range: number; damage: number; fireRate: number }
> = {
  infantry: { cost: 10, range: 2, damage: 1, fireRate: 1 },
  archer: { cost: 15, range: 4, damage: 1, fireRate: 1.2 },
  mage: { cost: 25, range: 3, damage: 2, fireRate: 0.8 },
  cannon: { cost: 50, range: 5, damage: 5, fireRate: 0.5 },
};

const ENEMY_CONFIG: Record<
  EnemyType,
  { health: number; speed: number; reward: number /* money on kill */ }
> = {
  goblin: { health: 5, speed: 2, reward: 1 }, // Speed in units per second (approx)
  orc: { health: 10, speed: 1.5, reward: 3 },
  ogre: { health: 25, speed: 1, reward: 5 },
};

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

  private mapGrid!: MapGrid;
  private troops: Troop[] = [];
  private selectedTroopType: TroopType | null = null;
  private troopAccordionMenu!: HTMLElement;
  private draggingTroopType: TroopType | null = null;

  private raycaster = new Raycaster();
  private mouse = { x: 0, y: 0 };
  private gridMeshes: Mesh[] = [];

  private playerState!: PlayerState;
  private playerMoneyDisplay!: HTMLElement;
  private playerLivesDisplay!: HTMLElement;
  private currentWaveDisplay!: HTMLElement;

  private ghostTroopElement: HTMLElement | null = null; // For the drag ghost

  private enemies: Enemy[] = [];
  private enemyMeshes: Map<string, Mesh> = new Map(); // Enemy ID -> Mesh
  private waveInProgress: boolean = false;
  private waveTimer: number = 0; // For spawning next enemy in wave
  private currentWaveConfig: { type: EnemyType; count: number; spawned: number }[] | null = null;

  private troopAttackTimers: Map<string, number> = new Map(); // Troop ID -> time until next attack
  private attackVisuals: Map<string, Line> = new Map(); // Troop ID -> Line mesh for attack
  private activeTargetLines: Set<string> = new Set(); // Troop IDs currently showing an attack line

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
    console.log('User All Time Stats:', this.userAllTimeStats); // Log to mark as used for now

    this.mainContainer = document.getElementById('container') as HTMLElement;
    this.scoreContainer = document.getElementById('score') as HTMLElement;
    this.instructions = document.getElementById('instructions') as HTMLElement;
    this.leaderboardList = document.getElementById('leaderboard-list') as HTMLElement;
    this.gameOverText = document.getElementById('game-over-text') as HTMLElement;
    this.troopAccordionMenu = document.getElementById('troop-accordion-menu') as HTMLElement;

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

    // Initialize a simple grid map (10x6 for now)
    const gridWidth = 10;
    const gridHeight = 6;
    const tiles: Tile[][] = [];
    for (let y = 0; y < gridHeight; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < gridWidth; x++) {
        row.push({ x, y, occupied: false, highlight: 'none' });
      }
      tiles.push(row);
    }
    // Simple straight path for now
    const path = Array.from({ length: gridWidth }, (_, i) => ({
      x: i,
      y: Math.floor(gridHeight / 2),
    }));
    this.mapGrid = { width: gridWidth, height: gridHeight, tiles, path };

    // Render the grid in three.js
    this.renderGrid();

    // Initialize PlayerState (example values)
    this.playerState = {
      money: 100,
      lives: 20,
      troops: [],
      currentWave: 0, // Will be 1 when first wave starts
    };

    // Initialize UI elements like the accordion
    this.initAccordion();
    this.initTroopItems();
    this.updateHUD(); // Initial HUD update

    // Setup drag and drop for the game area
    this.mainContainer.addEventListener('dragover', (event) => this.handleDragOver(event));
    this.mainContainer.addEventListener('drop', (event) => this.handleMapDrop(event));
    this.mainContainer.addEventListener('mousemove', (event) => this.handleMapHover(event));
    this.mainContainer.addEventListener('click', (event) => this.handleMapClick(event)); // Added click listener

    this.playerMoneyDisplay = document.getElementById('player-money') as HTMLElement;
    this.playerLivesDisplay = document.getElementById('player-lives') as HTMLElement;
    this.currentWaveDisplay = document.getElementById('current-wave') as HTMLElement;

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
    this.updateEnemies(deltaTime);
    this.updateTroops(deltaTime);
  }

  private render(): void {
    this.stage.render();
    this.renderAttackVisuals();
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
    this.startNextWave();
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

  private async endGame(playerWon: boolean): Promise<void> {
    if (this.state === 'ended') return;
    this.updateState('ended');

    const score = this.playerState.money + this.playerState.currentWave * 100; // Example score
    const data = await this.devvit.gameOver(score);

    if (playerWon) {
      this.gameOverText.innerHTML = `You Won! Final Score: ${score}`;
    } else {
      this.gameOverText.innerHTML = `Game Over! Score: ${score}. Click or spacebar to restart.`;
    }

    this.userAllTimeStats = data.userAllTimeStats;
    this.updateLeaderboard(data.leaderboard);
    // No automatic restart logic here, player clicks to restart via action()
  }

  private async placeBlock(): Promise<void> {
    const length = this.blocks.length;
    const targetBlock = this.blocks[length - 2];
    const currentBlock = this.blocks[length - 1];

    const result = currentBlock!.cut(targetBlock!, this.config.gameplay.accuracy);

    if (result.state === 'missed') {
      this.stage.remove(currentBlock!.getMesh());
      await this.endGame(false);
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

  private renderGrid(): void {
    this.gridMeshes.forEach((mesh) => this.stage.remove(mesh));
    this.gridMeshes = [];
    const tileSize = 5;

    // Create a set of path coordinates for quick lookup
    const pathCoords = new Set(this.mapGrid.path.map((p) => `${p.x},${p.y}`));

    for (let y = 0; y < this.mapGrid.height; y++) {
      for (let x = 0; x < this.mapGrid.width; x++) {
        const tile = this.mapGrid.tiles[y]?.[x];
        let tileColor = 0xcccccc; // Default tile color

        if (tile) {
          if (pathCoords.has(`${x},${y}`)) {
            tileColor = 0x99cc99; // Path color (e.g., light green)
          }
          if (tile.highlight === 'valid') {
            tileColor = 0x66ff66; // Valid placement highlight (bright green)
          } else if (tile.highlight === 'invalid') {
            tileColor = 0xff6666; // Invalid placement highlight (bright red)
          }
        }

        const geometry = new BoxGeometry(tileSize, 0.2, tileSize);
        const material = new MeshToonMaterial({ color: tileColor });
        const mesh = new Mesh(geometry, material);
        mesh.position.set(x * tileSize, 0, y * tileSize);
        mesh.userData = { x, y }; // Store tile coordinates in mesh for raycasting
        this.stage.add(mesh);
        this.gridMeshes.push(mesh);
      }
    }
  }

  private handleMapHover(event: MouseEvent): void {
    if (this.draggingTroopType) return; // Don't highlight on hover if dragging

    const { x, y } = this.getTileFromMouseEvent(event);
    this.clearHighlights();
    // Highlight for click-to-place if a troop is selected from menu
    if (this.selectedTroopType && x !== null && y !== null && this.mapGrid.tiles[y]?.[x]) {
      if (!this.mapGrid.tiles[y][x]!.occupied) {
        this.mapGrid.tiles[y][x]!.highlight = 'valid';
      } else {
        this.mapGrid.tiles[y][x]!.highlight = 'invalid';
      }
    }
    this.renderGrid();
  }

  private handleMapClick(event: MouseEvent): void {
    const { x, y } = this.getTileFromMouseEvent(event);
    if (x !== null && y !== null) {
      this.placeTroop(x, y, this.selectedTroopType);
      this.clearHighlights();
      this.renderGrid();
    }
  }

  private getTileFromMouseEvent(event: MouseEvent | DragEvent): {
    x: number | null;
    y: number | null;
  } {
    const rect = this.mainContainer.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    // Use the camera from stage
    const camera = this.stage.camera as OrthographicCamera;
    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObjects(this.gridMeshes);
    if (intersects.length > 0) {
      const firstIntersect = intersects[0];
      if (firstIntersect && firstIntersect.object) {
        const mesh = firstIntersect.object as Mesh;
        const userData = mesh.userData as { x?: number; y?: number };
        if (typeof userData.x === 'number' && typeof userData.y === 'number') {
          return { x: userData.x, y: userData.y };
        }
      }
    }
    return { x: null, y: null };
  }

  private clearHighlights(): void {
    for (let y = 0; y < this.mapGrid.height; y++) {
      for (let x = 0; x < this.mapGrid.width; x++) {
        const tile = this.mapGrid.tiles[y]?.[x];
        if (tile) {
          tile.highlight = 'none';
        }
      }
    }
  }

  private placeTroop(x: number, y: number, type: TroopType | null): void {
    if (!type) {
      console.warn('Attempted to place troop with null type.');
      return;
    }

    const tile = this.mapGrid.tiles[y]?.[x];
    const troopConfig = TROOP_CONFIG[type];

    if (!tile || tile.occupied) {
      console.warn(`Cannot place troop at (${x},${y}). Tile occupied or invalid.`);
      return;
    }

    if (!troopConfig) {
      console.warn(`Unknown troop type: ${type}`);
      return;
    }

    if (this.playerState.money < troopConfig.cost) {
      console.warn(
        `Not enough money to place ${type}. Need ${troopConfig.cost}, have ${this.playerState.money}`
      );
      // TODO: Show this message in the UI
      return;
    }

    this.playerState.money -= troopConfig.cost;
    this.updateHUD();

    tile.occupied = true;
    const troop: Troop = {
      id: `${type}-${Date.now()}-${x}-${y}`, // More unique ID
      type,
      position: { x, y },
      level: 1,
      range: troopConfig.range,
      damage: troopConfig.damage,
      fireRate: troopConfig.fireRate,
      cost: troopConfig.cost,
    };
    this.troops.push(troop);
    this.playerState.troops.push(troop); // Keep playerState.troops in sync

    // Render the troop (simple colored box for now)
    const geometry = new BoxGeometry(3, 2, 3); // Use troop-specific geometry/material later
    const material = new MeshToonMaterial({ color: 0x3366cc }); // Use troop-specific color later
    const mesh = new Mesh(geometry, material);
    // Adjust position based on tile size and troop visual height
    const tileSize = 5; // Assuming this is consistent with renderGrid
    mesh.position.set(x * tileSize, 1.1, y * tileSize);
    this.stage.add(mesh);
    console.log(`Placed ${type} at (${x},${y}). Money left: ${this.playerState.money}`);
  }

  private initAccordion(): void {
    const toggles =
      this.troopAccordionMenu.querySelectorAll<HTMLButtonElement>('.accordion-toggle');
    toggles.forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const section = toggle.parentElement as HTMLElement;
        section.classList.toggle('open');
      });
    });
  }

  private initTroopItems(): void {
    const troopItems = this.troopAccordionMenu.querySelectorAll<HTMLElement>('.troop-item');
    troopItems.forEach((item) => {
      item.setAttribute('draggable', 'true');
      item.addEventListener('dragstart', (event) => {
        const troopType = item.dataset.troopType as TroopType;
        if (event.dataTransfer && troopType) {
          event.dataTransfer.setData('text/plain', troopType);
          this.draggingTroopType = troopType;

          // Create and show ghost element
          if (this.ghostTroopElement) this.ghostTroopElement.remove(); // Remove old ghost if any
          this.ghostTroopElement = item.cloneNode(true) as HTMLElement;
          this.ghostTroopElement.classList.remove('dragging'); // Ensure ghost doesn't have original item's drag class
          this.ghostTroopElement.classList.add('troop-ghost');
          document.body.appendChild(this.ghostTroopElement); // Append to body to be free-floating

          // Hide default browser drag preview
          if (event.dataTransfer) {
            const img = new Image(); // Create an empty image
            img.src =
              'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // 1x1 transparent GIF
            event.dataTransfer.setDragImage(img, 0, 0); // Use empty image as drag image
          }
          this.updateGhostPosition(event); // Set initial position of custom ghost
        }
      });

      item.addEventListener('dragend', () => {
        this.draggingTroopType = null;
        if (this.ghostTroopElement) {
          this.ghostTroopElement.remove();
          this.ghostTroopElement = null;
        }
        this.clearHighlights();
        this.renderGrid();
      });

      item.addEventListener('click', () => {
        this.selectedTroopType = item.dataset.troopType as TroopType;
        // TODO: Add visual feedback in menu for selected troop
        console.log('Selected troop (click):', this.selectedTroopType);
      });
    });
  }

  private handleDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.updateGhostPosition(event); // Update ghost position as mouse moves

    // Highlighting logic (remains the same)
    const { x, y } = this.getTileFromMouseEvent(event);
    this.clearHighlights();
    if (this.draggingTroopType && x !== null && y !== null && this.mapGrid.tiles[y]?.[x]) {
      if (!this.mapGrid.tiles[y][x]!.occupied) {
        this.mapGrid.tiles[y][x]!.highlight = 'valid';
      } else {
        this.mapGrid.tiles[y][x]!.highlight = 'invalid';
      }
    }
    this.renderGrid();
  }

  private updateGhostPosition(event: DragEvent): void {
    if (this.ghostTroopElement) {
      // Position ghost relative to the viewport, slightly offset from cursor
      this.ghostTroopElement.style.left = `${event.clientX + 5}px`;
      this.ghostTroopElement.style.top = `${event.clientY + 5}px`;
    }
  }

  private handleMapDrop(event: DragEvent): void {
    event.preventDefault();
    const troopTypeFromDataTransfer = event.dataTransfer?.getData('text/plain') as
      | TroopType
      | undefined;
    const { x, y } = this.getTileFromMouseEvent(event);

    // Prioritize internal draggingTroopType, then dataTransfer
    let troopToPlace: TroopType | null | undefined =
      this.draggingTroopType || troopTypeFromDataTransfer;

    // If not dragging, and a troop was selected by click, use that for click-to-place
    if (!troopToPlace && event.type === 'click') {
      // Check if it was a click event if we merge handlers
      troopToPlace = this.selectedTroopType;
    }

    if (troopToPlace && typeof troopToPlace === 'string' && x !== null && y !== null) {
      this.placeTroop(x, y, troopToPlace as TroopType); // Cast to TroopType as it's validated
      this.selectedTroopType = null; // Reset click-selected troop after placement or attempt
    }
    this.clearHighlights();
    this.renderGrid();
    this.draggingTroopType = null;
    if (event.dataTransfer) {
      event.dataTransfer.clearData();
    }
  }

  private updateHUD(): void {
    if (this.playerMoneyDisplay) {
      this.playerMoneyDisplay.textContent = `Money: ${this.playerState.money}`;
    }
    if (this.playerLivesDisplay) {
      this.playerLivesDisplay.textContent = `Lives: ${this.playerState.lives}`;
    }
    if (this.currentWaveDisplay) {
      // Assuming max waves are e.g. 10 for now
      this.currentWaveDisplay.textContent = `Wave: ${this.playerState.currentWave}/10`;
    }
  }

  private startNextWave(): void {
    this.playerState.currentWave++;
    this.updateHUD();
    this.waveInProgress = true;
    // Example wave configuration (can be loaded from a wave data structure)
    // For now, just one type of enemy per wave, increasing count
    this.currentWaveConfig = [
      { type: 'goblin', count: 5 + this.playerState.currentWave * 2, spawned: 0 },
      // { type: 'orc', count: this.playerState.currentWave, spawned: 0 } // Add more types later
    ];
    this.waveTimer = 0; // Reset spawn timer
    console.log(`Starting wave ${this.playerState.currentWave}`);
  }

  private spawnEnemy(type: EnemyType): void {
    const config = ENEMY_CONFIG[type];
    if (!config || this.mapGrid.path.length === 0) {
      console.warn('Cannot spawn enemy: No config or path is empty');
      return;
    }

    const startTile = this.mapGrid.path[0];
    if (!startTile) {
      // Explicit check for startTile
      console.warn('Cannot spawn enemy: Start tile is undefined.');
      return;
    }

    const enemy: Enemy = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, // More unique ID
      type,
      health: config.health,
      speed: config.speed,
      position: { x: startTile.x, y: startTile.y },
      pathIndex: 0,
    };
    this.enemies.push(enemy);

    // Create and store mesh for this enemy
    const tileSize = 5;
    const geometry = new SphereGeometry(tileSize / 3, 8, 8); // Adjusted size slightly
    let color = 0xff0000;
    if (enemy.type === 'orc') color = 0x00cc00; // Darker green
    if (enemy.type === 'ogre') color = 0x3333ff; // Darker blue
    const material = new MeshToonMaterial({ color });
    const mesh = new Mesh(geometry, material);
    // mesh.userData.type = 'enemy'; // Still useful for general queries if needed
    mesh.userData.id = enemy.id; // Store enemy ID on mesh for direct lookup
    mesh.position.set(
      enemy.position.x * tileSize + tileSize / 2,
      tileSize / 3,
      enemy.position.y * tileSize + tileSize / 2
    ); // Centered on tile, slightly above ground
    this.stage.add(mesh);
    this.enemyMeshes.set(enemy.id, mesh);
    console.log('Spawned enemy:', enemy.id, 'at mesh pos', mesh.position);
  }

  private updateEnemies(deltaTime: number): void {
    if (this.waveInProgress && this.currentWaveConfig) {
      this.waveTimer -= deltaTime;
      if (this.waveTimer <= 0) {
        let spawnedThisFrame = false;
        for (const waveEnemy of this.currentWaveConfig) {
          if (waveEnemy.spawned < waveEnemy.count) {
            this.spawnEnemy(waveEnemy.type);
            waveEnemy.spawned++;
            spawnedThisFrame = true;
            break; // Spawn one enemy type per interval tick for now
          }
        }
        if (spawnedThisFrame) {
          this.waveTimer = 1000; // Interval between spawns (1 second)
        }
      }
    }

    const tileSize = 5; // Must match renderGrid
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i]!;
      if (enemy.pathIndex >= this.mapGrid.path.length - 1) {
        // Reached end of path
        this.playerState.lives--;
        this.updateHUD();
        const enemyIdToRemove = enemy.id;
        this.removeEnemy(enemyIdToRemove, i); // Expect removeEnemy to exist
        console.log(`Enemy ${enemyIdToRemove} reached end. Lives: ${this.playerState.lives}`);
        if (this.playerState.lives <= 0) {
          void this.endGame(false); // Player lost - ADDED VOID HERE
        }
        continue;
      }

      const targetWaypoint = this.mapGrid.path[enemy.pathIndex + 1]!;
      const targetPosition = { x: targetWaypoint.x * tileSize, y: targetWaypoint.y * tileSize }; // Convert tile to world
      const enemyWorldPos = { x: enemy.position.x * tileSize, y: enemy.position.y * tileSize }; // Current world pos

      // Simplified movement towards target waypoint
      // More robust movement would involve vector math and normalization
      const dx = targetPosition.x - enemyWorldPos.x;
      const dy = targetPosition.y - enemyWorldPos.y; // Assuming 2D path movement on XZ plane for now
      const distance = Math.sqrt(dx * dx + dy * dy);
      const moveSpeed = (enemy.speed * tileSize * deltaTime) / 1000; // speed in units/sec

      if (distance < moveSpeed) {
        enemy.position.x = targetWaypoint.x; // Snap to waypoint tile index
        enemy.position.y = targetWaypoint.y;
        enemy.pathIndex++;
      } else {
        enemy.position.x += (dx / distance) * (moveSpeed / tileSize); // Move by tile fraction
        enemy.position.y += (dy / distance) * (moveSpeed / tileSize);
      }

      // TODO: Check for enemy death (health <= 0) - to be handled by troop attacks
    }

    // Check if wave is complete
    if (this.waveInProgress && this.currentWaveConfig && this.enemies.length === 0) {
      let allSpawned = true;
      for (const waveEnemy of this.currentWaveConfig) {
        if (waveEnemy.spawned < waveEnemy.count) {
          allSpawned = false;
          break;
        }
      }
      if (allSpawned) {
        this.waveInProgress = false;
        console.log(`Wave ${this.playerState.currentWave} complete.`);
        if (this.playerState.currentWave < 10) {
          void setTimeout(() => this.startNextWave(), 3000); // Added void
        } else {
          void this.endGame(true); // Added void
        }
      }
    }
  }

  private renderAttackVisuals(): void {
    // Remove old lines that are no longer active
    this.attackVisuals.forEach((line, troopId) => {
      if (!this.activeTargetLines.has(troopId)) {
        this.stage.remove(line);
        this.attackVisuals.delete(troopId);
      }
    });

    // Update or create lines for active attacks
    const tileSize = 5;
    for (const troopId of this.activeTargetLines) {
      const troop = this.playerState.troops.find((t) => t.id === troopId);
      // Find the current target of this troop (this info isn't directly stored on troop, need to re-evaluate or store target)
      // For simplicity, let's assume the target is still valid or re-find it briefly (not ideal for perf)
      // A better way: store troop.currentTargetId when attacking in updateTroops
      const troopWorldX = troop!.position.x * tileSize + tileSize / 2;
      const troopWorldZ = troop!.position.y * tileSize + tileSize / 2; // Y is Z for grid

      // Re-find target to draw line to (simplified)
      let currentTarget: Enemy | null = null;
      let closestDistanceSq = Infinity;
      for (const enemy of this.enemies) {
        const enemyWorldX = enemy.position.x * tileSize + tileSize / 2;
        const enemyWorldZ = enemy.position.y * tileSize + tileSize / 2;
        const dx = troopWorldX - enemyWorldX;
        const dz = troopWorldZ - enemyWorldZ;
        const distanceSq = dx * dx + dz * dz;
        const troopRangeWorld = troop!.range * tileSize;
        if (distanceSq < troopRangeWorld * troopRangeWorld && distanceSq < closestDistanceSq) {
          // Check if this enemy was likely the one attacked (health > 0 or was recently damaged)
          // This is a simplification; ideally troop would store its current target's ID
          currentTarget = enemy;
          closestDistanceSq = distanceSq;
        }
      }

      if (troop && currentTarget) {
        const existingLine = this.attackVisuals.get(troopId);
        const points = [
          new Vector3(troopWorldX, tileSize / 2, troopWorldZ), // Start point (troop center)
          new Vector3(
            currentTarget.position.x * tileSize + tileSize / 2,
            tileSize / 4,
            currentTarget.position.y * tileSize + tileSize / 2
          ), // End point (enemy center)
        ];

        if (existingLine) {
          existingLine.geometry.setFromPoints(points);
          if (existingLine.geometry.attributes.position) {
            existingLine.geometry.attributes.position.needsUpdate = true;
          }
        } else {
          const material = new LineBasicMaterial({ color: 0xffaa00, linewidth: 2 }); // Orange line
          const geometry = new BufferGeometry().setFromPoints(points);
          const line = new Line(geometry, material);
          this.attackVisuals.set(troopId, line);
          this.stage.add(line);
        }
      } else if (this.attackVisuals.has(troopId)) {
        // Troop exists but target doesn't, remove line
        this.removeAttackVisual(troopId);
      }
    }
  }

  private removeAttackVisual(troopId: string): void {
    const line = this.attackVisuals.get(troopId);
    if (line) {
      this.stage.remove(line);
      this.attackVisuals.delete(troopId);
    }
    this.activeTargetLines.delete(troopId); // Ensure it's also removed from active set
  }

  private removeEnemy(enemyId: string, enemyArrayIndex: number): void {
    // Logic for removing enemy data and mesh will be added here step-by-step.
    console.log(`Placeholder: Attempting to remove enemy ${enemyId} at index ${enemyArrayIndex}`);
  }

  private updateTroops(deltaTime: number): void {
    const tileSize = 5; // Assuming this is consistent for position calculations
    this.activeTargetLines.clear(); // Clear at the start of each update

    for (const troop of this.playerState.troops) {
      // Manage attack cooldown
      let timeUntilAttack = this.troopAttackTimers.get(troop.id) || 0;
      timeUntilAttack -= deltaTime;
      this.troopAttackTimers.set(troop.id, timeUntilAttack);

      if (timeUntilAttack > 0) {
        continue; // Troop is on cooldown
      }

      // Find a target
      let targetEnemy: Enemy | null = null;
      let closestDistanceSq = Infinity;

      const troopWorldX = troop.position.x * tileSize + tileSize / 2; // Center of the troop's tile
      const troopWorldY = troop.position.y * tileSize + tileSize / 2; // Using Y for Z in 3D typically

      for (const enemy of this.enemies) {
        const enemyWorldX = enemy.position.x * tileSize + tileSize / 2;
        const enemyWorldY = enemy.position.y * tileSize + tileSize / 2;

        const dx = troopWorldX - enemyWorldX;
        const dy = troopWorldY - enemyWorldY; // Assuming path/grid is on XZ plane
        const distanceSq = dx * dx + dy * dy;
        const troopRangeWorld = troop.range * tileSize; // Convert troop range (in tiles) to world units

        if (distanceSq < troopRangeWorld * troopRangeWorld && distanceSq < closestDistanceSq) {
          targetEnemy = enemy;
          closestDistanceSq = distanceSq;
        }
      }

      if (targetEnemy) {
        // Attack the target enemy
        console.log(`Troop ${troop.id} (${troop.type}) attacking enemy ${targetEnemy.id}`);
        targetEnemy.health -= troop.damage;
        // TODO: Add visual for attack (e.g., line, particle)
        this.activeTargetLines.add(troop.id); // Mark troop as actively attacking for rendering
        this.troopAttackTimers.set(troop.id, 1000 / troop.fireRate);

        if (targetEnemy.health <= 0) {
          console.log(`Enemy ${targetEnemy.id} defeated by troop ${troop.id}`);
          this.playerState.money += ENEMY_CONFIG[targetEnemy.type as EnemyType]?.reward || 0;
          this.updateHUD();
          // Remove enemy from the game
          const enemyIdToRemove = targetEnemy.id;
          const enemyIndexToRemove = this.enemies.findIndex((e) => e.id === enemyIdToRemove);
          if (enemyIndexToRemove > -1) {
            // Ensure index is valid before calling
            this.removeEnemy(enemyIdToRemove, enemyIndexToRemove); // Expect removeEnemy to exist
          }
          this.removeAttackVisual(troop.id); // Clean up visual if enemy dies
        }
      } else {
        this.removeAttackVisual(troop.id); // No target, remove visual
      }
    }
  }
}
