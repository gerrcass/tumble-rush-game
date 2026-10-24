import { Game, type GameState } from '../game/Game';
import { formatSeed } from '../game/Rng';
import { Hud } from './Hud';
import { FinishOverlay, PauseOverlay, formatTime } from './screens/Overlays';
import { StartScreen } from './screens/StartScreen';
import { byId } from './dom';

const TOUCH_CONTROLS = `
  <div id="touch-joystick" class="joystick" role="group" aria-label="Movement joystick">
    <span class="joystick__ring" aria-hidden="true"></span>
    <span class="joystick__arrows" aria-hidden="true">▲<br />◀ ● ▶<br />▼</span>
    <span id="touch-joystick-knob" class="joystick__knob" aria-hidden="true"></span>
  </div>
  <div class="touch-actions">
    <button id="touch-emote" class="touch-btn touch-btn--mini" type="button" aria-label="Emote">EMOTE</button>
    <div class="touch-action-grid">
      <button id="touch-dive" class="touch-btn touch-btn--small" type="button" aria-label="Dive">DIVE</button>
      <button id="touch-grab" class="touch-btn touch-btn--small" type="button" aria-label="Grab">GRAB</button>
    </div>
    <button id="touch-jump" class="touch-btn touch-btn--jump" type="button" aria-label="Jump">JUMP</button>
  </div>
`;

/**
 * Top-level UI router for the phase-one slice. Owns the DOM shell and mirrors
 * Game state into the start screen, HUD and overlays. DOM/CSS only; no framework.
 */
export class App {
  private readonly root: HTMLElement;
  private readonly game: Game;
  private readonly hud: Hud;
  private readonly startScreen: StartScreen;
  private readonly pauseOverlay: PauseOverlay;
  private readonly finishOverlay: FinishOverlay;
  private readonly abort = new AbortController();
  private hintTimer = 0;
  private finishSeconds = 0;

  constructor(root: HTMLElement, seed: number) {
    this.root = root;
    root.classList.add('tumble-app');

    const touch = detectTouch();
    if (touch) root.classList.add('app--touch');
    root.dataset.state = 'menu';

    root.innerHTML = `
      <div id="scene" class="scene"></div>
      <div class="scene-grade" aria-hidden="true"></div>
      <div id="ui" class="ui-layer"></div>
      <div id="touch-controls" class="touch-controls" aria-label="Touch controls">${TOUCH_CONTROLS}</div>
    `;

    const sceneMount = byId<HTMLElement>(root, 'scene');
    const touchRoot = byId<HTMLElement>(root, 'touch-controls');
    const ui = byId<HTMLElement>(root, 'ui');

    this.hud = new Hud({ onPause: () => this.game.pause() });
    this.startScreen = new StartScreen({
      seedLabel: formatSeed(seed),
      touch,
      onPlay: () => this.startGame(),
    });
    this.pauseOverlay = new PauseOverlay({
      onResume: () => this.game.resume(),
      onRestart: () => this.game.restart(),
      onQuit: () => this.game.quitToMenu(),
    });
    this.finishOverlay = new FinishOverlay({
      onReplay: () => this.game.restart(),
      onQuit: () => this.game.quitToMenu(),
    });

    ui.appendChild(this.startScreen.element);
    ui.appendChild(this.hud.element);
    ui.appendChild(this.pauseOverlay.element);
    ui.appendChild(this.finishOverlay.element);

    this.game = new Game({
      mount: sceneMount,
      touchRoot,
      seed,
      callbacks: {
        onStateChange: (state) => this.handleState(state),
        onTick: (elapsed) => this.hud.setTime(elapsed),
        onFinish: (seconds) => {
          this.finishSeconds = seconds;
        },
        onCheckpoint: (index) => {
          this.hud.showToast(`Checkpoint ${index} reached!`, 'good');
        },
        onFall: () => {
          this.hud.showToast('Whoops! Back to the last checkpoint…', 'bad');
        },
        onRespawn: () => {
          this.hud.showToast('Back on the deck!', 'good');
        },
        onContextLost: () => {
          this.hud.showToast('Graphics context lost — reload the page.', 'bad');
        },
      },
    });

    // The game starts at the menu state; make the DOM agree before the first frame.
    this.handleState('menu');
    this.bindKeyboard();
    this.game.start();

    if (import.meta.env.DEV) {
      window.__tumble = this.game.debug;
    }

    requestAnimationFrame(() => {
      if (this.game.state === 'menu') this.startScreen.focusPlay();
    });
  }

  dispose(): void {
    this.abort.abort();
    window.clearTimeout(this.hintTimer);
    this.game.dispose();
    this.hud.dispose();
    this.startScreen.dispose();
    this.pauseOverlay.dispose();
    this.finishOverlay.dispose();
    if (import.meta.env.DEV && window.__tumble === this.game.debug) {
      delete window.__tumble;
    }
  }

  private startGame(): void {
    if (this.game.state !== 'menu') return;
    this.blurActive();
    this.game.play();
  }

  private handleState(state: GameState): void {
    this.root.dataset.state = state;
    if (state === 'menu') {
      this.startScreen.show();
      this.hud.hide();
      this.pauseOverlay.hide();
      this.finishOverlay.hide();
      window.clearTimeout(this.hintTimer);
    } else if (state === 'playing') {
      this.startScreen.hide();
      this.pauseOverlay.hide();
      this.finishOverlay.hide();
      this.hud.show();
      this.hud.setHintVisible(true);
      window.clearTimeout(this.hintTimer);
      this.hintTimer = window.setTimeout(() => this.hud.setHintVisible(false), 20_000);
    } else if (state === 'paused') {
      this.pauseOverlay.show();
    } else if (state === 'finished') {
      this.pauseOverlay.hide();
      this.hud.hide();
      this.finishOverlay.show(this.finishSeconds);
    }
  }

  private bindKeyboard(): void {
    const signal = this.abort.signal;
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          if (this.game.state === 'playing') {
            event.preventDefault();
            this.game.pause();
          } else if (this.game.state === 'paused') {
            event.preventDefault();
            this.game.resume();
            this.blurActive();
          } else if (this.game.state === 'finished') {
            event.preventDefault();
            this.game.quitToMenu();
          }
          return;
        }

        if (
          (event.key === 'Enter' || event.key === ' ') &&
          this.game.state === 'menu' &&
          !(event.target instanceof HTMLButtonElement)
        ) {
          event.preventDefault();
          this.startGame();
          return;
        }

        if (event.key === 'Tab' && (this.game.state === 'paused' || this.game.state === 'finished')) {
          this.trapFocus(event);
        }
      },
      { signal },
    );
  }

  private trapFocus(event: KeyboardEvent): void {
    const overlay =
      this.game.state === 'paused' ? this.pauseOverlay.element : this.finishOverlay.element;
    const buttons = Array.from(overlay.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !overlay.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !overlay.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  private blurActive(): void {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
}

function detectTouch(): boolean {
  const query = new URLSearchParams(window.location.search).get('touch');
  if (query === '1') return true;
  if (query === '0') return false;
  return (
    (navigator.maxTouchPoints ?? 0) > 0 ||
    window.matchMedia('(pointer: coarse)').matches ||
    'ontouchstart' in window
  );
}

export { formatTime };
