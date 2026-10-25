import { Game, type GameState } from '../game/Game';
import { dailySeed, formatSeed } from '../game/Rng';
import type { LevelMode, LevelResult } from '../game/levels/Level';
import type { DifficultyId } from '../game/match/Director';
import type { ShowResult, StampTone } from '../game/match/Match';
import { Hud } from './Hud';
import {
  FinishOverlay,
  PauseOverlay,
  ResultsOverlay,
  RoundIntro,
  ShowEndOverlay,
  formatTime,
} from './screens/Overlays';
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

interface ShowChoice {
  difficulty: DifficultyId;
  daily: boolean;
}

/**
 * Top-level UI router. Owns the DOM shell, Start Screen, Round intro, HUD,
 * results, spectate controls and the end screens. DOM/CSS only.
 */
export class App {
  private readonly root: HTMLElement;
  private readonly game: Game;
  private readonly hud: Hud;
  private readonly startScreen: StartScreen;
  private readonly roundIntro: RoundIntro;
  private readonly pauseOverlay: PauseOverlay;
  private readonly resultsOverlay: ResultsOverlay;
  private readonly showEndOverlay: ShowEndOverlay;
  private readonly finishOverlay: FinishOverlay;
  private readonly abort = new AbortController();
  private readonly quickSeed: number;
  private readonly daily: { label: string; seed: number };
  private hintTimer = 0;
  private finishResult: LevelResult | null = null;
  private lastShowChoice: ShowChoice = { difficulty: 'show', daily: false };
  private introKey = '';
  private resultsKey = '';
  private endKey = '';
  private lastHudPhase = '';

  constructor(root: HTMLElement, seed: number) {
    this.root = root;
    this.quickSeed = seed;
    this.daily = dailySeed();
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

    this.hud = new Hud({
      onPause: () => this.game.pause(),
      onSkipSpectate: () => this.game.match?.skipSpectate(),
    });
    this.startScreen = new StartScreen({
      seedLabel: formatSeed(seed),
      dailyLabel: this.daily.label,
      touch,
      initialDifficulty: 'show',
      onShow: (difficulty, daily) => this.startShow({ difficulty, daily }),
      onPractice: (mode) => this.startPractice(mode),
      onDebugRound: (mode) => this.startDebugRound(mode),
    });
    this.roundIntro = new RoundIntro();
    this.resultsOverlay = new ResultsOverlay({
      onContinue: () => this.game.match?.nextRound(),
    });
    this.showEndOverlay = new ShowEndOverlay({
      onReplay: () => this.playAgain(),
      onMenu: () => this.quitToMenu(),
    });
    this.pauseOverlay = new PauseOverlay({
      onResume: () => this.game.resume(),
      onRestart: () => this.game.restart(),
      onQuit: () => this.quitToMenu(),
    });
    this.finishOverlay = new FinishOverlay({
      onReplay: () => this.game.restart(),
      onQuit: () => this.quitToMenu(),
    });

    ui.appendChild(this.startScreen.element);
    ui.appendChild(this.roundIntro.element);
    ui.appendChild(this.hud.element);
    ui.appendChild(this.resultsOverlay.element);
    ui.appendChild(this.showEndOverlay.element);
    ui.appendChild(this.pauseOverlay.element);
    ui.appendChild(this.finishOverlay.element);

    this.game = new Game({
      mount: sceneMount,
      touchRoot,
      seed,
      callbacks: {
        onStateChange: (state) => this.handleState(state),
        onTick: () => this.syncMatch(),
        onStamp: (text, tone) => this.onStamp(text, tone),
        onShowPhase: () => this.syncMatch(),
        onShowEnd: (result) => this.onShowEnd(result),
        onFinish: (result) => {
          this.finishResult = result;
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
    this.roundIntro.dispose();
    this.pauseOverlay.dispose();
    this.resultsOverlay.dispose();
    this.showEndOverlay.dispose();
    this.finishOverlay.dispose();
    if (import.meta.env.DEV && window.__tumble === this.game.debug) {
      delete window.__tumble;
    }
  }

  private startShow(choice: ShowChoice): void {
    if (this.game.state !== 'menu' && this.game.state !== 'finished') return;
    this.lastShowChoice = choice;
    const seed = choice.daily ? this.daily.seed : this.quickSeed;
    const seedLabel = choice.daily ? this.daily.label : formatSeed(this.quickSeed);
    this.finishResult = null;
    this.blurActive();
    this.game.startShow({ seed, seedLabel, difficulty: choice.difficulty });
  }

  private playAgain(): void {
    if (this.game.match) {
      this.startShow(this.lastShowChoice);
    } else {
      this.finishResult = null;
      this.game.restart();
    }
  }

  private startPractice(mode: LevelMode): void {
    if (this.game.state !== 'menu' && this.game.state !== 'finished') return;
    this.finishResult = null;
    this.blurActive();
    this.game.startPractice(mode);
  }

  private startDebugRound(mode: LevelMode): void {
    this.finishResult = null;
    this.blurActive();
    this.game.startMode(mode);
  }

  private quitToMenu(): void {
    this.finishResult = null;
    this.game.quitToMenu();
    this.startScreen.show();
    this.startScreen.focusPlay();
  }

  private onStamp(text: string, tone: StampTone): void {
    this.hud.showStamp(text, tone);
  }

  private onShowEnd(result: ShowResult): void {
    void result;
    this.syncMatch(true);
  }

  private handleState(state: GameState): void {
    this.root.dataset.state = state;
    if (state === 'menu') {
      this.startScreen.show();
      this.roundIntro.hide();
      this.hud.hide();
      this.resultsOverlay.hide();
      this.showEndOverlay.hide();
      this.pauseOverlay.hide();
      this.finishOverlay.hide();
      this.introKey = '';
      this.resultsKey = '';
      this.endKey = '';
      this.lastHudPhase = '';
      window.clearTimeout(this.hintTimer);
    } else if (state === 'playing') {
      this.startScreen.hide();
      this.pauseOverlay.hide();
      this.finishOverlay.hide();
      this.showEndOverlay.hide();
      this.endKey = '';
      this.syncMatch();
      window.clearTimeout(this.hintTimer);
      this.hintTimer = window.setTimeout(() => this.hud.setHintVisible(false), 20_000);
    } else if (state === 'paused') {
      this.pauseOverlay.show(this.game.isPractice ? 'RESTART PRACTICE' : 'RESTART SHOW');
    } else if (state === 'finished') {
      this.pauseOverlay.hide();
      this.roundIntro.hide();
      this.resultsOverlay.hide();
      if (this.game.match?.showResult) {
        this.syncMatch(true);
      } else if (this.finishResult) {
        this.hud.hide();
        this.finishOverlay.show(this.finishResult);
      }
    }
  }

  /**
   * Mirror Match/Level state into the DOM. Called on every tick but every
   * widget diffs; overlays only rebuild when their identity key changes.
   */
  private syncMatch(force = false): void {
    const match = this.game.match;
    const state = this.game.state;
    if (!match) {
      this.roundIntro.hide();
      this.resultsOverlay.hide();
      this.showEndOverlay.hide();
      this.introKey = '';
      this.resultsKey = '';
      this.endKey = '';
      if (state === 'playing') {
        this.hud.show();
        this.hud.setPractice(this.game.level.status());
      }
      return;
    }

    if (match.phase === 'intro' || match.phase === 'countdown') {
      this.hud.hide();
      this.resultsOverlay.hide();
      this.showEndOverlay.hide();
      const key = `${match.roundIndex}:${match.phase}:${match.seedLabel}`;
      if (key !== this.introKey || force) {
        this.introKey = key;
        this.roundIntro.show(
          match.roundIndex + 1,
          match.definition,
          match.seedLabel,
          match.phase,
          match.countdown,
        );
      } else {
        this.roundIntro.update(match.phase, match.countdown);
      }
      return;
    }

    if (match.phase === 'playing') {
      this.roundIntro.hide();
      this.resultsOverlay.hide();
      this.showEndOverlay.hide();
      if (this.lastHudPhase !== 'playing') {
        this.lastHudPhase = 'playing';
        this.hud.setHintVisible(true);
      }
      this.hud.show();
      this.hud.setShow(match.hud(this.game.level));
      return;
    }

    if (match.phase === 'results') {
      this.hud.hide();
      this.roundIntro.hide();
      this.showEndOverlay.hide();
      const last = match.history[match.history.length - 1];
      if (!last) return;
      const key = `${match.history.length}:${last.definition.mode}`;
      if (key !== this.resultsKey || force) {
        this.resultsKey = key;
        this.resultsOverlay.show(
          match.roundIndex + 1,
          last.definition,
          last.placements,
          match.seedLabel,
          match.resultsTimer,
        );
      } else {
        this.resultsOverlay.update(match.resultsTimer);
      }
      return;
    }

    // victory / defeat
    this.hud.hide();
    this.roundIntro.hide();
    this.resultsOverlay.hide();
    if (match.showResult) {
      const key = `${match.phase}:${match.showResult.seedLabel}:${match.showResult.won}`;
      if (key !== this.endKey || force) {
        this.endKey = key;
        this.showEndOverlay.show(match.showResult);
      }
    }
  }

  private bindKeyboard(): void {
    const signal = this.abort.signal;
    window.addEventListener(
      'keydown',
      (event) => {
        const match = this.game.match;
        if (event.key === 'Escape') {
          if (this.game.state === 'playing') {
            event.preventDefault();
            this.game.pause();
          } else if (this.game.state === 'paused') {
            event.preventDefault();
            this.game.resume();
            this.blurActive();
          } else if (match?.phase === 'results') {
            event.preventDefault();
            match.nextRound();
          } else if (this.game.state === 'finished') {
            event.preventDefault();
            if (match?.phase === 'victory' || match?.phase === 'defeat') this.quitToMenu();
            else this.game.quitToMenu();
          }
          return;
        }

        if (event.key === 'Enter') {
          if (match?.phase === 'results') {
            event.preventDefault();
            match.nextRound();
            return;
          }
          if (this.game.state === 'menu' && !(event.target instanceof HTMLButtonElement)) {
            event.preventDefault();
            this.startScreen.playSelected();
            return;
          }
          if (
            this.game.state === 'finished' &&
            match &&
            !(event.target instanceof HTMLButtonElement)
          ) {
            event.preventDefault();
            this.playAgain();
            return;
          }
        }

        if (
          event.key === ' ' &&
          this.game.state === 'menu' &&
          !(event.target instanceof HTMLButtonElement)
        ) {
          event.preventDefault();
          this.startScreen.playSelected();
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
    let overlay: HTMLElement | null = null;
    if (this.game.state === 'paused') overlay = this.pauseOverlay.element;
    else if (this.game.match?.phase === 'victory' || this.game.match?.phase === 'defeat') {
      overlay = this.showEndOverlay.element;
    } else overlay = this.finishOverlay.element;
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
