import { Game } from './game';

const game = new Game();

function onResize(): void {
  game.resize(window.innerWidth, window.innerHeight);
}

async function onTouchStart(event: TouchEvent): Promise<void> {
  event.preventDefault();
  await game.action();
}

async function onMouseDown(event: MouseEvent): Promise<void> {
  event.preventDefault();
  window.focus();
  await game.action();
}

async function onKeyDown(event: KeyboardEvent): Promise<void> {
  if (event.code === 'Space') {
    event.preventDefault();
    await game.action();
  }
}

async function onLoad(): Promise<void> {
  await game.prepare(window.innerWidth, window.innerHeight, window.devicePixelRatio);

  await game.start();

  window.addEventListener('resize', onResize, false);
  window.addEventListener('orientationchange', onResize, false);
  window.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('mousedown', onMouseDown, false);
  window.focus();
  window.addEventListener('keydown', onKeyDown);
}

window.addEventListener('load', onLoad, false);
