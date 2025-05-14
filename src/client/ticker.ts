export class Ticker {
  private started: boolean = false;
  private requestId: number | null = null;

  private lastTime: number = -1;

  private deltaMS: number;
  private targetFPMS: number;

  private maxElapsedMS = 100;

  private tick: (time: number) => void;

  private callback: (currentTime: number, deltaTime: number) => void;

  constructor(callback: (currentTime: number, deltaTime: number) => void, targetFPS: number = 60) {
    this.callback = callback;

    this.targetFPMS = targetFPS / 1000;
    this.deltaMS = 1 / this.targetFPMS;

    this.tick = (time: number): void => {
      this.requestId = null;
      if (!this.started) return;

      this.update(time);

      if (this.requestId !== null) return;
      this.requestId = requestAnimationFrame(this.tick);
    };
  }

  public start(): void {
    if (this.started) return;
    this.started = true;

    if (this.requestId !== null) return;
    this.lastTime = performance.now();
    this.requestId = requestAnimationFrame(this.tick);
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.requestId === null) return;
    cancelAnimationFrame(this.requestId);
    this.requestId = null;
  }

  private update(currentTime = performance.now()): void {
    if (currentTime > this.lastTime) {
      this.deltaMS = currentTime - this.lastTime;

      if (this.deltaMS > this.maxElapsedMS) {
        this.deltaMS = this.maxElapsedMS;
      }

      this.callback.call(this, currentTime, this.deltaMS * this.targetFPMS);
    }

    this.lastTime = currentTime;
  }
}
