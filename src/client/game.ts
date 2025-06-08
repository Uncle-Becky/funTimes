import { Easing, Tween, update as tweenjsUpdate } from '@tweenjs/tween.js';
// anime.js will be dynamically imported
// Three.js components will be dynamically imported
import type * as ThreeType from 'three'; // For getting Three.js component types
import type StatsType from 'three/examples/jsm/libs/stats.module'; // For Stats type
import type anime from 'animejs'; // Import animejs types

import type {
  Enemy,
  EnemyType,
  MapGrid,
  ObstacleType,
  Path,
  PersistedGameState,
  PlayerState,
  TerrainType,
  Tile,
  Troop,
  TroopType,
} from '../shared/types/game';
import type { InitMessage } from '../shared/types/message';
import type { PostConfig } from '../shared/types/postConfig';
import type { User } from '../shared/types/user';
import { Devvit } from './devvit';
import { Stage } from './stage';
import { Ticker } from './ticker';
import { EnemyController } from './utils/enemyController';
import { getEnv } from './utils/env';
import { TroopController } from './utils/troopController';
import { WaveManager } from './utils/waveManager';

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
  private leaderboardList!: HTMLElement;
  private gameOverText!: HTMLElement;
  private ticker!: Ticker;

  private state: GameState = 'loading';
  private stage!: Stage;

  private stats!: StatsType;
  private THREE!: typeof ThreeType;
  private StatsModule!: typeof StatsType;
  private anime!: typeof anime; // Use the imported anime type

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

  private raycaster!: ThreeType.Raycaster;
  private mouse = { x: 0, y: 0 };
  private gridMeshes: ThreeType.Mesh[] = [];

  private playerState!: PlayerState;
  private playerMoneyDisplay!: HTMLElement;
  private playerLivesDisplay!: HTMLElement;
  private currentWaveDisplay!: HTMLElement;

  private ghostTroopElement: HTMLElement | null = null; // For the drag ghost

  private enemies: Enemy[] = [];
  private enemyMeshes: Map<string, ThreeType.Mesh> = new Map();
  private waveInProgress: boolean = false;
  private waveTimer: number = 0; // For spawning next enemy in wave
  private currentWaveConfig:
    | { type: EnemyType; count: number; spawned: number; pathId?: string | undefined }[]
    | null = null;

  private troopAttackTimers: Map<string, number> = new Map(); // Troop ID -> time until next attack
  private attackVisuals: Map<string, ThreeType.Line> = new Map();
  private activeTargetLines: Set<string> = new Set(); // Troop IDs currently showing an attack line

  private troopController!: TroopController;
  private enemyController!: EnemyController;

  private waveManager!: WaveManager;

  private postId: string | null = null;
  private userId: string | null = null;

  // Bound event handlers for mainContainer
  private boundHandleDragOver = (event: DragEvent): void => this.handleDragOver(event);
  private boundHandleMapDrop = (event: DragEvent): void => this.handleMapDrop(event);
  private boundHandleMapHover = (event: MouseEvent): void => this.handleMapHover(event);
  private boundHandleMapClick = (event: MouseEvent): void => this.handleMapClick(event);

  // Bound event handlers for window listeners (assuming onResize, onTouchStart, etc. are defined class methods)
  private boundOnResize = (): void => this.onResize();
  private boundOnTouchStart = async (event: TouchEvent): Promise<void> => this.onTouchStart(event);
  private boundOnMouseDown = async (event: MouseEvent): Promise<void> => this.onMouseDown(event);
  private boundOnKeyDown = async (event: KeyboardEvent): Promise<void> => this.onKeyDown(event);


  public async prepare(width: number, height: number, devicePixelRatio: number): Promise<void> {
    // --- Start of new dynamic import code ---
    try {
      const threeModule = await import('three');
      this.THREE = threeModule;

      const statsModule = await import('three/examples/jsm/libs/stats.module');
      this.StatsModule = statsModule.default; // Assuming Stats is the default export

    } catch (error) {
      console.error('Failed to dynamically load Three.js or Stats.module:', error);
      // Handle loading failure: display an error message to the user, stop game initialization.
      this.updateState('loading'); // Or an 'error' state
      const container = document.getElementById('container');
      if (container) {
        container.innerHTML = '<p style="color: red; padding: 1em;">Error loading critical game components. Please try refreshing.</p>';
      }
      return; // Prevent further execution in prepare()
    }
    // --- End of new dynamic import code ---

    // --- Start of new dynamic import code for anime.js ---
    try {
      const animeModule = await import('animejs');
      this.anime = animeModule.default || animeModule; // Common pattern for ES modules with default exports

      // Verify if anime and anime.remove are functions, as they are used this way.
      // The previous build errors (e.g. "remove" is not exported, Cannot call a namespace)
      // suggest that the structure of the imported animejs module might be tricky.
      if (typeof this.anime !== 'function' || (this.anime && typeof this.anime.remove !== 'function')) {
        console.warn(
          'anime.js loaded, but `anime` or `anime.remove` is not a function. Animations might not work.',
          this.anime
        );
        // Attempt to provide a no-op fallback if critical functions are missing to prevent runtime errors.
        if (typeof this.anime !== 'function') this.anime = () => {};
        if (this.anime && typeof this.anime.remove !== 'function') this.anime.remove = () => {};
      }
    } catch (error) {
      console.error('Failed to dynamically load anime.js:', error);
      // Provide a no-op function so game calls don't break if anime.js is critical.
      this.anime = () => {}; // Fallback for the main anime function
      // Ensure this.anime.remove also exists as a no-op function.
      // This structure (this.anime being a function and also having a .remove method)
      // is typical for anime.js.
      if (typeof this.anime === 'function') {
        // If this.anime is a function, @types/animejs might type .remove directly on it.
        // If not, this cast might be needed, or a more complex type for this.anime.
        (this.anime as any).remove = () => {}; // Keep as any for now if type is complex
      } else {
        // If this.anime itself isn't a function, then create it as an object with a no-op remove.
        // This case should ideally not be hit if animejs is packaged as expected.
        this.anime = { remove: () => {} };
      }
    }
    // --- End of new dynamic import code for anime.js ---

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
    this.leaderboardList = document.getElementById('leaderboard-list') as HTMLElement;
    this.gameOverText = document.getElementById('game-over-text') as HTMLElement;
    this.troopAccordionMenu = document.getElementById('troop-accordion-menu') as HTMLElement;

    this.updateLeaderboard(initData.leaderboard);

    this.scoreContainer.innerHTML = '0';

    this.stage = new Stage(this.config, devicePixelRatio, this.THREE);
    this.stage.resize(width, height);

    if (getEnv().MODE === 'development') {
      this.stats = this.StatsModule();
      document.body.appendChild(this.stats.dom);
    }

    this.ticker = new Ticker((currentTime: number, deltaTime: number) => {
      tweenjsUpdate(currentTime);

      this.update(deltaTime);
      this.render();

      this.stats?.update();
    });

    // Initialize a modular grid map (10x6 for now) with terrain and obstacles
    const gridWidth = 10;
    const gridHeight = 6;
    const tiles: Tile[][] = [];
    for (let y = 0; y < gridHeight; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < gridWidth; x++) {
        // Example: alternate terrain and random obstacles
        let terrainType: TerrainType = 'grass';
        if (y === 0 || y === gridHeight - 1) terrainType = 'mountain';
        else if (x === 0 || x === gridWidth - 1) terrainType = 'water';
        else if ((x + y) % 5 === 0) terrainType = 'dirt';
        let obstacle: ObstacleType = 'none';
        if ((x === 3 && y === 2) || (x === 6 && y === 4)) obstacle = 'rock';
        row.push({ x, y, occupied: false, highlight: 'none', terrainType, obstacle });
      }
      tiles.push(row);
    }
    // Multiple paths: one ground, one air (stub for future flying units)
    const groundPath: Path = {
      id: 'main',
      waypoints: Array.from({ length: gridWidth }, (_, i) => ({
        x: i,
        y: Math.floor(gridHeight / 2),
      })),
      type: 'ground',
    };
    const airPath: Path = {
      id: 'fly',
      waypoints: [
        { x: 0, y: 1 },
        { x: 3, y: 0 },
        { x: 6, y: 5 },
        { x: 9, y: 4 },
      ],
      type: 'air',
      splinePoints: [
        { x: 0, y: 1, z: 3 },
        { x: 3, y: 0, z: 6 },
        { x: 6, y: 5, z: 2 },
        { x: 9, y: 4, z: 4 },
      ],
    };
    this.mapGrid = { width: gridWidth, height: gridHeight, tiles, paths: [groundPath, airPath] };
    this.raycaster = new this.THREE.Raycaster();
    // Render the grid in three.js (now supports terrain, obstacles, and multiple paths)
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
    this.mainContainer.addEventListener('dragover', this.boundHandleDragOver);
    this.mainContainer.addEventListener('drop', this.boundHandleMapDrop);
    this.mainContainer.addEventListener('mousemove', this.boundHandleMapHover);
    this.mainContainer.addEventListener('click', this.boundHandleMapClick);

    // Example window listeners (assuming these methods exist or will be added)
    window.addEventListener('resize', this.boundOnResize, false);
    window.addEventListener('orientationchange', this.boundOnResize, false); // Reuse same handler
    window.addEventListener('touchstart', this.boundOnTouchStart, { passive: false });
    window.addEventListener('mousedown', this.boundOnMouseDown, false);
    window.addEventListener('keydown', this.boundOnKeyDown);


    this.playerMoneyDisplay = document.getElementById('player-money') as HTMLElement;
    this.playerLivesDisplay = document.getElementById('player-lives') as HTMLElement;
    this.currentWaveDisplay = document.getElementById('current-wave') as HTMLElement;

    this.troopController = new TroopController();
    this.enemyController = new EnemyController(
      this.THREE, // Pass the dynamically loaded THREE module
      (mesh) => this.stage.add(mesh),
      (mesh) => this.stage.remove(mesh)
    );

    this.waveManager = new WaveManager(this.anime);

    this.postId = initData.postId;
    this.userId = initData.user.id;
    // Try to load saved state
    if (this.postId && this.userId) {
      const saved = await this.devvit.loadState(this.postId, this.userId);
      if (saved) {
        this.restoreState(saved);
        this.updateHUD();
        this.renderGrid();
        this.updateState('ready');
        return;
      }
    }

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
        break;
      case 'ended':
        await this.restartGame();
        break;
    }
  }

  private async startGame(): Promise<void> {
    if (this.state === 'playing') return;
    this.scoreContainer.innerHTML = '0';
    this.updateState('playing');
    this.startNextWave();
  }

  private async restartGame(): Promise<void> {
    this.updateState('resetting');

    const length = this.enemies.length;
    const duration = 200;
    const delay = 20;

    for (let i = length - 1; i > 0; i--) {
      new Tween(this.enemies[i]!.position)
        .to({ x: 0, y: 0, z: 0 }, duration)
        .delay((length - i - 1) * delay)
        .easing(Easing.Cubic.In)
        .onComplete(() => {
          this.stage.remove(this.enemyMeshes.get(this.enemies[i]!.id)!);
          this.enemyMeshes.delete(this.enemies[i]!.id);
        })
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
      this.enemies = this.enemies.slice(0, 1);
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

    // Create a set of path coordinates for quick lookup (all paths)
    const pathCoords = new Set<string>();
    for (const path of this.mapGrid.paths) {
      for (const p of path.waypoints) {
        pathCoords.add(`${p.x},${p.y}`);
      }
    }

    for (let y = 0; y < this.mapGrid.height; y++) {
      for (let x = 0; x < this.mapGrid.width; x++) {
        const tile = this.mapGrid.tiles[y]?.[x];
        let tileColor = 0xcccccc; // Default tile color
        // Terrain coloring
        if (tile?.terrainType === 'grass') tileColor = 0x99cc66;
        else if (tile?.terrainType === 'dirt') tileColor = 0xcc9966;
        else if (tile?.terrainType === 'water') tileColor = 0x3399ff;
        else if (tile?.terrainType === 'mountain') tileColor = 0x888888;
        else if (tile?.terrainType === 'road') tileColor = 0xddddbb;
        // Path highlight
        if (pathCoords.has(`${x},${y}`)) {
          tileColor = 0x99cc99; // Path color (e.g., light green)
        }
        // Obstacle coloring
        if (tile?.obstacle && tile.obstacle !== 'none') {
          tileColor = 0x444444; // Obstacle color (dark gray)
        }
        if (tile?.highlight === 'valid') {
          tileColor = 0x66ff66; // Valid placement highlight (bright green)
        } else if (tile?.highlight === 'invalid') {
          tileColor = 0xff6666; // Invalid placement highlight (bright red)
        }
        const geometry = new this.THREE.BoxGeometry(tileSize, 0.2, tileSize);
        const material = new this.THREE.MeshToonMaterial({ color: tileColor });
        const mesh = new this.THREE.Mesh(geometry, material);
        mesh.position.set(x * tileSize, 0, y * tileSize);
        mesh.userData = { x, y }; // Store tile coordinates in mesh for raycasting
        this.stage.add(mesh);
        this.gridMeshes.push(mesh);
        // TODO: Add stub for Anime.js path highlight (future)
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
    const camera = this.stage.camera as ThreeType.OrthographicCamera;
    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObjects(this.gridMeshes);
    if (intersects.length > 0) {
      const firstIntersect = intersects[0];
      if (firstIntersect && firstIntersect.object) {
        const mesh = firstIntersect.object as ThreeType.Mesh;
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
      id: `${type}-${Date.now()}-${x}-${y}`,
      type,
      position: { x, y },
      level: 1,
      range: troopConfig.range,
      damage: troopConfig.damage,
      fireRate: troopConfig.fireRate,
      cost: troopConfig.cost,
    };
    this.troopController.addTroop(troop);
    this.troops.push(troop);
    this.playerState.troops.push(troop);
    // Render the troop (simple colored box for now)
    const geometry = new this.THREE.BoxGeometry(3, 2, 3);
    const material = new this.THREE.MeshToonMaterial({ color: 0x3366cc });
    const mesh = new this.THREE.Mesh(geometry, material);
    const tileSize = 5;
    mesh.position.set(x * tileSize, 1.1, y * tileSize);
    this.stage.add(mesh);
    console.log(`Placed ${type} at (${x},${y}). Money left: ${this.playerState.money}`);
    void this.saveState();
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
      if (this.playerMoneyDisplay.textContent !== `Money: ${this.playerState.money}`) {
        this.anime.remove(this.playerMoneyDisplay);
        this.anime({
          targets: this.playerMoneyDisplay,
          scale: [1, 1.25, 1],
          color: ['#333344', this.playerState.money > 0 ? '#44bb44' : '#bb4444', '#333344'],
          duration: 400,
          easing: 'easeOutElastic(1, .5)',
        });
      }
      this.playerMoneyDisplay.textContent = `Money: ${this.playerState.money}`;
    }
    if (this.playerLivesDisplay) {
      if (this.playerLivesDisplay.textContent !== `Lives: ${this.playerState.lives}`) {
        this.anime.remove(this.playerLivesDisplay);
        this.anime({
          targets: this.playerLivesDisplay,
          scale: [1, 1.25, 1],
          color: ['#333344', this.playerState.lives > 0 ? '#44bb44' : '#bb4444', '#333344'],
          duration: 400,
          easing: 'easeOutElastic(1, .5)',
        });
      }
      this.playerLivesDisplay.textContent = `Lives: ${this.playerState.lives}`;
    }
    if (this.currentWaveDisplay) {
      const totalWaves = 9; // 8 normal + 1 boss (sync with WaveManager)
      this.currentWaveDisplay.textContent = `Wave: ${this.playerState.currentWave}/${totalWaves}`;
    }
  }

  private startNextWave(): void {
    const wave = this.waveManager.getNextWave();
    if (!wave) {
      void this.endGame(true);
      return;
    }
    this.playerState.currentWave = this.waveManager.getCurrentWaveNumber();
    this.updateHUD();
    this.waveInProgress = true;
    if (wave.announcement) {
      this.waveManager.animateWaveAnnouncement(wave.announcement);
    }
    this.currentWaveConfig = wave.enemies.map((e) => ({
      type: e.type,
      count: e.count,
      spawned: 0,
      pathId: e.pathId,
    }));
    this.waveTimer = 0;
    console.log(`Starting wave ${this.playerState.currentWave}`);
    void this.saveState();
  }

  private spawnEnemy(type: EnemyType, pathId?: string): void {
    const path = this.mapGrid.paths.find((p) => p.id === (pathId || 'main'));
    if (!path || !path.waypoints.length) {
      console.warn('Cannot spawn enemy: No path is available');
      return;
    }
    const enemy = this.enemyController.spawnEnemy(type, path);
    console.log('Spawned enemy:', enemy.id);
  }

  private updateEnemies(deltaTime: number): void {
    if (this.waveInProgress && this.currentWaveConfig) {
      this.waveTimer -= deltaTime;
      if (this.waveTimer <= 0) {
        let spawnedThisFrame = false;
        for (const waveEnemy of this.currentWaveConfig) {
          if (waveEnemy.spawned < waveEnemy.count) {
            this.spawnEnemy(waveEnemy.type, waveEnemy.pathId);
            waveEnemy.spawned++;
            spawnedThisFrame = true;
            break;
          }
        }
        if (spawnedThisFrame) {
          this.waveTimer = 1000;
        }
      }
    }
    const tileSize = 5;
    const enemies = this.enemyController.getAll();
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i]!;
      const path = this.mapGrid.paths.find((p) => p.id === 'main');
      if (!path || !Array.isArray(path.waypoints) || !path.waypoints.length) continue;
      if (typeof enemy.pathIndex !== 'number' || enemy.pathIndex >= path.waypoints.length - 1) {
        this.playerState.lives--;
        this.updateHUD();
        const enemyIdToRemove = enemy.id;
        this.enemyController.removeEnemy(enemyIdToRemove);
        console.log(`Enemy ${enemyIdToRemove} reached end. Lives: ${this.playerState.lives}`);
        if (this.playerState.lives <= 0) {
          void this.endGame(false);
        }
        continue;
      }
      if (!Array.isArray(path.waypoints) || !path.waypoints[enemy.pathIndex + 1]) continue;
      const targetWaypoint = path.waypoints[enemy.pathIndex + 1];
      if (
        !targetWaypoint ||
        typeof targetWaypoint.x !== 'number' ||
        typeof targetWaypoint.y !== 'number'
      )
        continue;
      const targetPosition = { x: targetWaypoint.x * tileSize, y: targetWaypoint.y * tileSize };
      const enemyWorldPos = { x: enemy.position.x * tileSize, y: enemy.position.y * tileSize };
      const dx = targetPosition.x - enemyWorldPos.x;
      const dy = targetPosition.y - enemyWorldPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const moveSpeed = (enemy.speed * tileSize * deltaTime) / 1000;
      if (distance < moveSpeed) {
        enemy.position.x = targetWaypoint.x;
        enemy.position.y = targetWaypoint.y;
        enemy.pathIndex++;
      } else {
        enemy.position.x += (dx / distance) * (moveSpeed / tileSize);
        enemy.position.y += (dy / distance) * (moveSpeed / tileSize);
      }
      // TODO: Use enemyController.moveEnemy for extensibility
    }
    // Check if wave is complete
    if (
      this.waveInProgress &&
      this.currentWaveConfig &&
      this.enemyController.getAll().length === 0
    ) {
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
          void setTimeout(() => this.startNextWave(), 3000);
        } else {
          void this.endGame(true);
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
      const troop = this.troopController.getAll().find(t => t.id === troopId);
      if (!troop || !troop.currentTargetId) {
        this.removeAttackVisual(troopId); // Troop or its target is gone
        continue;
      }

      const currentTarget = this.enemyController.getAll().find(e => e.id === troop.currentTargetId);
      if (!currentTarget) {
        this.removeAttackVisual(troopId); // Target enemy not found (e.g., already removed)
        continue;
      }

      // Troop and currentTarget are valid
      const troopWorldX = troop.position.x * tileSize + tileSize / 2;
      const troopWorldZ = troop.position.y * tileSize + tileSize / 2; // Y on grid is Z in world

      const existingLine = this.attackVisuals.get(troopId);
      const points = [
        new this.THREE.Vector3(troopWorldX, tileSize / 2, troopWorldZ), // Start point (troop center)
        new this.THREE.Vector3(
          currentTarget.position.x * tileSize + tileSize / 2,
          tileSize / 4, // Assuming enemies are slightly lower or for visual effect
          currentTarget.position.y * tileSize + tileSize / 2 // Y on grid is Z in world
        ), // End point (enemy center)
      ];

      if (existingLine) {
        existingLine.geometry.setFromPoints(points);
        if (existingLine.geometry.attributes.position) {
          existingLine.geometry.attributes.position.needsUpdate = true;
        }
      } else {
        const material = new this.THREE.LineBasicMaterial({ color: 0xffaa00, linewidth: 2 }); // Orange line
        const geometry = new this.THREE.BufferGeometry().setFromPoints(points);
        const line = new this.THREE.Line(geometry, material);
        this.attackVisuals.set(troopId, line);
        this.stage.add(line);
      }
      // Note: The 'else if (this.attackVisuals.has(troopId))' block for removing visuals
      // when troop exists but target doesn't is now handled by the checks at the beginning of the loop.
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

  private removeEnemy(enemyId: string, _enemyArrayIndex: number): void {
    this.enemyController.removeEnemy(enemyId);
  }

  private updateTroops(deltaTime: number): void {
    const tileSize = 5;
    this.activeTargetLines.clear();
    for (const troop of this.troopController.getAll()) {
      // Manage attack cooldown
      let timeUntilAttack = this.troopAttackTimers.get(troop.id) || 0;
      timeUntilAttack -= deltaTime;
      this.troopAttackTimers.set(troop.id, timeUntilAttack);
      if (timeUntilAttack > 0) {
        continue;
      }
      // Find a target (use TroopController.attack for extensibility)
      // The old target-finding loop has been removed from here.
      // this.troopController.attack will now find the target and also set troop.currentTargetId.
      const targetEnemy: Enemy | null = this.troopController.attack(troop, this.enemies);

      if (targetEnemy) {
        // Attack the target enemy
        // Use TroopController.fireProjectile for Anime.js-powered animation (stub)
        this.troopController.fireProjectile(troop, targetEnemy);
        targetEnemy.health -= troop.damage;
        this.activeTargetLines.add(troop.id);
        this.troopAttackTimers.set(troop.id, 1000 / troop.fireRate);
        if (targetEnemy.health <= 0) {
          this.playerState.money += ENEMY_CONFIG[targetEnemy.type as EnemyType]?.reward || 0;
          this.updateHUD();
          const enemyIdToRemove = targetEnemy.id;
          const enemyIndexToRemove = this.enemies.findIndex((e) => e.id === enemyIdToRemove);
          if (enemyIndexToRemove > -1) {
            this.removeEnemy(enemyIdToRemove, enemyIndexToRemove);
          }
          this.removeAttackVisual(troop.id);
        }
      } else {
        this.removeAttackVisual(troop.id);
      }
    }
  }

  private async saveState(): Promise<void> {
    if (!this.postId || !this.userId) return;
    const state: PersistedGameState = {
      userId: this.userId,
      postId: this.postId,
      money: this.playerState.money,
      lives: this.playerState.lives,
      currentWave: this.playerState.currentWave,
      troops: this.playerState.troops,
      timestamp: Date.now(),
    };
    await this.devvit.saveState(state);
  }

  private restoreState(state: PersistedGameState): void {
    this.playerState.money = state.money;
    this.playerState.lives = state.lives;
    this.playerState.currentWave = state.currentWave;
    this.playerState.troops = state.troops;
    // Optionally, restore more (e.g., upgrades, map, etc.)
  }

  // --- Existing methods like onResize, onTouchStart, onMouseDown, onKeyDown are assumed to be here ---
  // For example:
  private onResize(): void {
    // Actual resize logic for the game, e.g., this.stage.resize(...)
    // For now, just a placeholder if it's not fully implemented from original task context
    const width = window.innerWidth; // or from a specific container
    const height = window.innerHeight; // or from a specific container
    if (this.stage) {
      this.resize(width, height); // Call the existing Game.resize method
    }
  }

  private async onTouchStart(event: TouchEvent): Promise<void> {
    // Example: this.action(); event.preventDefault();
    if (event.touches.length === 1) {
      // Simulate a click or specific touch action
      await this.action();
      event.preventDefault(); // Prevent mouse event emulation
    }
  }

  private async onMouseDown(event: MouseEvent): Promise<void> {
    // Example: if (event.button === 0) this.action();
    if (event.button === 0) { // Left mouse button
      await this.action();
    }
  }

  private async onKeyDown(event: KeyboardEvent): Promise<void> {
    // Example: if (event.code === 'Space') this.action();
    if (event.code === 'Space') {
      await this.action();
      event.preventDefault(); // Prevent spacebar scrolling the page
    }
  }


  public destroy(): void {
    // Window listeners
    window.removeEventListener('resize', this.boundOnResize, false);
    window.removeEventListener('orientationchange', this.boundOnResize, false);
    window.removeEventListener('touchstart', this.boundOnTouchStart, { passive: false } as AddEventListenerOptions);
    window.removeEventListener('mousedown', this.boundOnMouseDown, false);
    window.removeEventListener('keydown', this.boundOnKeyDown);

    // Main container listeners
    if (this.mainContainer) { // Check if mainContainer exists
      this.mainContainer.removeEventListener('dragover', this.boundHandleDragOver);
      this.mainContainer.removeEventListener('drop', this.boundHandleMapDrop);
      this.mainContainer.removeEventListener('mousemove', this.boundHandleMapHover);
      this.mainContainer.removeEventListener('click', this.boundHandleMapClick);
    }

    // Stop the ticker
    if (this.ticker) {
      this.ticker.stop();
    }

    // Remove Stats.dom if it was added
    if (this.stats && this.stats.dom && this.stats.dom.parentElement) {
      this.stats.dom.parentElement.removeChild(this.stats.dom);
    }

    // Potentially clear other resources, e.g., tell stage to release Three.js resources if necessary
    // For now, focus on event listeners.
    console.log('Game instance destroyed and listeners removed.');
  }
}
