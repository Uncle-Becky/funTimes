import type { EnemyType } from '../../shared/types/game';
import type anime from 'animejs'; // Import animejs types

export interface WaveDefinition {
  enemies: Array<{ type: EnemyType; count: number; pathId?: string }>;
  isBoss?: boolean;
  announcement?: string;
}

export class WaveManager {
  private waves: WaveDefinition[] = [];
  private currentWaveIndex = -1;
  private anime: typeof anime; // Use the imported anime type

  constructor(animeInstance: typeof anime) { // Use the imported anime type
    this.anime = animeInstance;
    this.generateWaves();
  }

  private generateWaves(): void {
    // Example: 8 normal waves, 1 boss wave
    for (let i = 1; i <= 8; i++) {
      this.waves.push({
        enemies: [
          { type: 'goblin', count: 4 + i * 2 },
          ...(i > 3 ? [{ type: 'orc', count: Math.floor(i / 2) }] : []),
        ],
        announcement: `Wave ${i}`,
      });
    }
    // Boss wave
    this.waves.push({
      enemies: [
        { type: 'ogre', count: 1 },
        { type: 'orc', count: 4 },
        { type: 'goblin', count: 8 },
      ],
      isBoss: true,
      announcement: 'Boss Wave!',
    });
  }

  getNextWave(): WaveDefinition | null {
    this.currentWaveIndex++;
    if (this.currentWaveIndex < this.waves.length) {
      return this.waves[this.currentWaveIndex];
    }
    return null;
  }

  getCurrentWaveNumber(): number {
    return this.currentWaveIndex + 1;
  }

  isGameOver(): boolean {
    return this.currentWaveIndex >= this.waves.length;
  }

  reset(): void {
    this.currentWaveIndex = -1;
  }

  // Stub: Animate wave announcement (Anime.js pattern #8)
  animateWaveAnnouncement(announcement: string): void {
    let el = document.getElementById('wave-announcement');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wave-announcement';
      el.style.position = 'absolute';
      el.style.top = '40%';
      el.style.left = '50%';
      el.style.transform = 'translate(-50%, -50%)';
      el.style.fontSize = '3rem';
      el.style.fontWeight = 'bold';
      el.style.color = '#333344';
      el.style.background = 'rgba(255,255,255,0.85)';
      el.style.borderRadius = '1em';
      el.style.padding = '0.5em 2em';
      el.style.zIndex = '999';
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';
      document.body.appendChild(el);
    }
    el.textContent = announcement;
    this.anime.remove(el);
    this.anime({
      targets: el,
      translateY: [-100, 0],
      opacity: [0, 1],
      duration: 600,
      easing: 'easeOutBack',
      complete: () => {
        setTimeout(() => {
          this.anime({
            targets: el,
            translateY: [0, 100],
            opacity: [1, 0],
            duration: 500,
            easing: 'easeInCubic',
          });
        }, 1200);
      },
    });
  }
}
