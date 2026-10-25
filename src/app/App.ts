import { Game, type GameState } from '../game/Game';
import { dailySeed, formatSeed, freshSeed } from '../game/Rng';
import type { LevelMode, LevelResult } from '../game/levels/Level';
import type { DifficultyId } from '../game/match/Director';
import type { RoundHistory, ShowResult, StampTone } from '../game/match/Match';
import {
  awardQualification,
  awardWin,
  browserStorage,
  readProfile,
  recordShowFinish,
  resetProfile,
  saveProfile,
  type Profile,
} from '../game/profile';
import { Hud } from './Hud';
import {
  FinishOverlay,
  PauseOverlay,
  ResultsOverlay,
  RoundIntro,
  ShowEndOverlay,
  formatTime,
  type RoundReward,
} from './screens/Overlays';
import { CustomizeScreen } from './screens/CustomizeScreen';
import { HowToScreen } from './screens/HowToScreen';
import { SettingsScreen } from './screens/SettingsScreen';
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

type ScreenName = 'menu' | 'customize' | 'settings' | 'howto';

interface ShowChoice {
  difficulty: DifficultyId;
  daily: boolean;
}

/**
 * Top-level UI router. Owns the DOM shell, every menu screen, the HUD, results,
 * spectate controls and the end screens. DOM/CSS only; the Game owns WebGL.
 */
export class App {
  private readonly root: HTMLElement;
  private readonly game: Game;
  private readonly hud: Hud;
  private readonly startScreen: StartScreen;
  private readonly customizeScreen: CustomizeScreen;
  private readonly settingsScreen: SettingsScreen;
  private readonly howToScreen: HowToScreen;
  private readonly roundIntro: RoundIntro;
  private readonly pauseOverlay: PauseOverlay;
  private readonly resultsOverlay: ResultsOverlay;
  private readonly showEndOverlay: ShowEndOverlay;
  private readonly finishOverlay: FinishOverlay;
  private readonly abort = new AbortController();
  private quickSeed: number;
  private readonly seedOverride: boolean;
  private readonly daily: { label: string; seed: number };
  private readonly touchDevice: boolean;
  private readonly live: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly ceremony: HTMLElement;
  private readonly ceremonyName: HTMLElement;
  private readonly storage = browserStorage();
  private profile: Profile;
  private screen: ScreenName = 'menu';
  private settingsReturn: 'menu' | 'pause' = 'menu';
  private hintTimer = 0;
  private toastTimer = 0;
  private ceremonyTimer = 0;
  private finishResult: LevelResult | null = null;
  private lastShowChoice: ShowChoice = { difficulty: 'show', daily: false };
  private introKey = '';
  private resultsKey = '';
  private endKey = '';
  private lastHudPhase = '';
  private firstQualificationAwarded = false;
  private winAwarded = false;
  private showKudos = 0;
  private showCrowns = 0;
  private showNewBest = false;
  private readonly rewardedRounds = new Map<string, RoundReward | null>();

  constructor(root: HTMLElement, seed: number) {
    this.root = root;
    this.quickSeed = seed;
    this.seedOverride = new URLSearchParams(window.location.search).has('seed');
    this.daily = dailySeed();
    const loaded = readProfile(this.storage);
    this.profile = loaded.profile;
    root.classList.add('tumble-app');
    this.touchDevice = detectTouch();
    root.dataset.state = 'menu';
    root.dataset.screen = 'menu';

    root.innerHTML = `
      <div id="scene" class="scene"></div>
      <div class="scene-grade" aria-hidden="true"></div>
      <div id="ui" class="ui-layer"></div>
      <div id="touch-controls" class="touch-controls" aria-label="Touch controls">${TOUCH_CONTROLS}</div>
      <div id="app-toast" class="app-toast" role="status" aria-live="polite"></div>
      <div id="app-live" class="sr-only" role="status" aria-live="polite"></div>
      <div id="show-ceremony" class="show-ceremony" role="status" aria-live="polite" hidden>
        <span class="show-ceremony__kicker">CROWN CEREMONY</span>
        <strong class="show-ceremony__name"></strong>
        <span class="show-ceremony__sub">THE SHOW HAS ITS WINNER</span>
      </div>
    `;

    const sceneMount = byId<HTMLElement>(root, 'scene');
    const touchRoot = byId<HTMLElement>(root, 'touch-controls');
    const ui = byId<HTMLElement>(root, 'ui');
    this.live = byId<HTMLElement>(root, 'app-live');
    this.toast = byId<HTMLElement>(root, 'app-toast');
    this.ceremony = byId<HTMLElement>(root, 'show-ceremony');
    this.ceremonyName = this.ceremony.querySelector<HTMLElement>('.show-ceremony__name')!;

    this.hud = new Hud({
      onPause: () => this.game.pause(),
      onSkipSpectate: () => this.game.match?.skipSpectate(),
    });
    this.startScreen = new StartScreen({
      seedLabel: formatSeed(seed),
      dailyLabel: this.daily.label,
      touch: this.touchDevice,
      initialDifficulty: 'show',
      profile: this.profile,
      onShow: (difficulty, daily) => this.startShow({ difficulty, daily }),
      onPractice: (mode) => this.startPractice(mode),
      onCustomize: () => this.openScreen('customize'),
      onSettings: () => this.openScreen('settings', 'menu'),
      onHowTo: () => this.openScreen('howto'),
      onToggleSound: () => this.toggleSound(),
      onDebugRound: (mode) => this.startDebugRound(mode),
    });
    this.customizeScreen = new CustomizeScreen(
      {
        onBack: () => this.closeScreen(),
        onChange: (profile, notice) => this.onProfileChanged(profile, notice),
        onNotice: (message) => this.announce(message),
      },
      this.profile,
    );
    this.settingsScreen = new SettingsScreen(
      {
        onBack: () => this.closeScreen(),
        onChange: (profile) => this.onProfileChanged(profile),
        onReset: () => this.resetProfile(),
        onNotice: (message) => this.announce(message),
      },
      this.profile,
    );
    this.howToScreen = new HowToScreen({ onBack: () => this.closeScreen() });
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
      onRestart: () => this.restartCurrent(),
      onSettings: () => this.openScreen('settings', 'pause'),
      onQuit: () => this.quitToMenu(),
    });
    this.finishOverlay = new FinishOverlay({
      onReplay: () => this.restartCurrent(),
      onQuit: () => this.quitToMenu(),
    });

    ui.appendChild(this.startScreen.element);
    ui.appendChild(this.customizeScreen.element);
    ui.appendChild(this.settingsScreen.element);
    ui.appendChild(this.howToScreen.element);
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
      identity: { name: this.profile.name, look: this.profile.look },
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
        onQualityStepDown: () => {
          this.hud.showToast('Performance mode on — keeping the show smooth.', 'normal');
          this.announce('Performance mode enabled to keep the frame rate smooth.');
        },
      },
    });

    ui.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('button')) this.game.audio.play('ui');
      },
      { signal: this.abort.signal },
    );

    this.applySettings();
    this.handleState('menu');
    this.bindKeyboard();
    this.game.start();

    if (import.meta.env.DEV) {
      window.__tumble = this.game.debug;
    }

    if (loaded.recovered) {
      requestAnimationFrame(() => {
        this.announce('Your saved profile could not be read, so a fresh Tumbler was created.');
      });
    }
    requestAnimationFrame(() => {
      if (this.game.state === 'menu' && this.screen === 'menu') this.startScreen.focusPlay();
    });
  }

  dispose(): void {
    this.abort.abort();
    window.clearTimeout(this.hintTimer);
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.ceremonyTimer);
    this.game.dispose();
    this.hud.dispose();
    this.startScreen.dispose();
    this.customizeScreen.dispose();
    this.settingsScreen.dispose();
    this.howToScreen.dispose();
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
    this.beginShow(choice);
  }

  private beginShow(choice: ShowChoice): void {
    this.resetShowUi();
    this.lastShowChoice = choice;
    if (!choice.daily) this.quickSeed = this.nextQuickSeed();
    const seed = choice.daily ? this.daily.seed : this.quickSeed;
    const seedLabel = choice.daily ? this.daily.label : formatSeed(this.quickSeed);
    this.startScreen.setSeedLabel(seedLabel);
    this.blurActive();
    this.game.setIdentity(this.profile.name, this.profile.look);
    this.game.startShow({ seed, seedLabel, difficulty: choice.difficulty });
  }

  private playAgain(): void {
    this.beginShow(this.lastShowChoice);
  }

  /** Restart from pause or an end card through the App's full per-show reset. */
  private restartCurrent(): void {
    if (this.game.match) {
      this.beginShow(this.lastShowChoice);
      return;
    }
    if (this.game.isPractice) this.beginPractice(this.game.mode);
    else this.startDebugRound(this.game.mode);
  }

  private startPractice(mode: LevelMode): void {
    if (this.game.state !== 'menu' && this.game.state !== 'finished') return;
    this.beginPractice(mode);
  }

  private beginPractice(mode: LevelMode): void {
    this.resetShowUi();
    this.blurActive();
    this.game.setIdentity(this.profile.name, this.profile.look);
    this.game.startPractice(mode);
  }

  /** Reset every per-show App value so a restart cannot inherit a stale card. */
  private resetShowUi(): void {
    this.clearCeremony();
    this.closeScreens(true);
    this.firstQualificationAwarded = false;
    this.winAwarded = false;
    this.introKey = '';
    this.resultsKey = '';
    this.endKey = '';
    this.lastHudPhase = '';
    this.showKudos = 0;
    this.showCrowns = 0;
    this.showNewBest = false;
    this.rewardedRounds.clear();
    this.finishResult = null;
  }

  /** Quick Shows get a fresh seed; ?seed= stays a deterministic override. */
  private nextQuickSeed(): number {
    if (this.seedOverride) return this.quickSeed;
    return freshSeed();
  }

  private startDebugRound(mode: LevelMode): void {
    this.resetShowUi();
    this.blurActive();
    this.game.startMode(mode);
  }

  private quitToMenu(): void {
    this.resetShowUi();
    this.game.quitToMenu();
    this.startScreen.setProfile(this.profile);
    this.startScreen.show();
    this.startScreen.focusPlay();
  }

  private onStamp(text: string, tone: StampTone): void {
    this.hud.showStamp(text, tone);
    this.announce(text);
  }

  private onShowEnd(result: ShowResult): void {
    if (result.won && !this.winAwarded) {
      awardWin(this.profile);
      this.winAwarded = true;
      this.showCrowns += 1;
      this.showKudos += 100;
    }
    const finish = recordShowFinish(this.profile, {
      won: result.won,
      placement: result.playerPlacement,
      daily: this.lastShowChoice.daily,
      date: this.daily.label,
    });
    this.showNewBest = finish.newBest;
    this.persistProfile();
    this.startScreen.setProfile(this.profile);
    if (result.won) {
      this.ceremonyName.textContent = `${result.winnerName} takes the crown!`;
      this.ceremony.hidden = false;
      this.ceremony.classList.add('is-visible');
      this.announce(`Crown ceremony. ${result.winnerName} wins the show.`);
      window.clearTimeout(this.ceremonyTimer);
      this.ceremonyTimer = window.setTimeout(() => {
        this.ceremonyTimer = 0;
        this.ceremony.classList.remove('is-visible');
        this.ceremony.hidden = true;
        this.syncMatch(true);
      }, 3200);
    } else {
      this.syncMatch(true);
    }
  }

  /** Earn kudos the moment a Round result is shown, and the crown on a final win. */
  private awardRound(match: NonNullable<Game['match']>, last: RoundHistory): RoundReward | null {
    const key = `${match.roundIndex}:${match.history.length}`;
    if (this.rewardedRounds.has(key)) return this.rewardedRounds.get(key) ?? null;
    const entry = last.placements.find((placement) => placement.isPlayer);
    if (!entry) {
      this.rewardedRounds.set(key, null);
      return null;
    }
    const reward: RoundReward = {
      qualified: entry.qualified,
      kudos: 0,
      bonus: 0,
      crown: 0,
      bestFinish: this.profile.bestFinish,
      newBest: false,
    };
    if (entry.qualified) {
      const first = !this.firstQualificationAwarded;
      const award = awardQualification(this.profile, first);
      this.firstQualificationAwarded = true;
      reward.kudos = award.kudos;
      reward.bonus = award.bonus;
      this.showKudos += award.kudos;
      if (entry.won && !this.winAwarded) {
        const win = awardWin(this.profile);
        this.winAwarded = true;
        reward.crown = win.crowns;
        reward.kudos += win.kudos;
        this.showCrowns += win.crowns;
        this.showKudos += win.kudos;
      }
      this.persistProfile();
    }
    this.rewardedRounds.set(key, reward);
    return reward;
  }

  private onProfileChanged(profile: Profile, notice?: string): void {
    this.profile = profile;
    this.persistProfile();
    this.applySettings();
    this.startScreen.setProfile(profile);
    this.settingsScreen.setProfile(profile);
    this.customizeScreen.setProfile(profile);
    if (notice) this.announce(notice);
  }

  private toggleSound(): void {
    this.profile.settings.muted = !this.profile.settings.muted;
    this.persistProfile();
    this.applySettings();
    this.startScreen.setProfile(this.profile);
    this.settingsScreen.setProfile(this.profile);
    this.announce(this.profile.settings.muted ? 'Sound muted.' : 'Sound on.');
  }

  private resetProfile(): Profile {
    this.profile = resetProfile(this.storage);
    this.applySettings();
    this.game.setIdentity(this.profile.name, this.profile.look);
    this.startScreen.setProfile(this.profile);
    this.settingsScreen.setProfile(this.profile);
    this.customizeScreen.setProfile(this.profile);
    return this.profile;
  }

  private persistProfile(): void {
    saveProfile(this.profile, this.storage);
  }

  private applySettings(): void {
    const settings = this.profile.settings;
    this.game.setAudioSettings({
      musicVolume: settings.musicVolume,
      sfxVolume: settings.sfxVolume,
      muted: settings.muted,
    });
    this.settingsScreen.setAudioLive(this.game.audio.isStarted);
    this.game.setQualitySetting(settings.quality);
    this.game.setReducedMotion(
      settings.reducedMotion ||
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    );
    this.game.setNameTagsVisible(settings.nameTags);
    this.game.setCameraPreferences(settings.cameraSensitivity, settings.invertY);
    this.root.classList.toggle('reduce-motion', settings.reducedMotion);
    const touch =
      settings.touchControls === 'on' ||
      (settings.touchControls === 'auto' && this.touchDevice);
    this.root.classList.toggle('app--touch', touch);
  }

  private openScreen(screen: ScreenName, from: 'menu' | 'pause' = 'menu'): void {
    if (this.screen !== 'menu' && this.screen !== screen) return;
    this.settingsReturn = from;
    this.screen = screen;
    this.root.dataset.screen = screen;
    this.startScreen.hide();
    this.customizeScreen.hide();
    this.settingsScreen.hide();
    this.howToScreen.hide();
    this.pauseOverlay.hide();
    if (screen === 'customize') this.customizeScreen.show(this.profile);
    else if (screen === 'settings') {
      this.settingsScreen.show(this.profile);
      this.settingsScreen.setAudioLive(this.game.audio.isStarted);
    }
    else if (screen === 'howto') this.howToScreen.show();
  }

  private closeScreen(): void {
    if (this.screen === 'menu') return;
    if (this.screen === 'settings' && this.settingsReturn === 'pause') {
      this.settingsScreen.hide();
      this.screen = 'menu';
      this.root.dataset.screen = 'menu';
      if (this.game.state === 'paused') {
        this.pauseOverlay.show(this.game.isPractice ? 'RESTART PRACTICE' : 'RESTART SHOW');
      }
      return;
    }
    if (this.screen === 'customize') {
      this.game.setIdentity(this.profile.name, this.profile.look);
      this.startScreen.setProfile(this.profile);
    }
    this.screen = 'menu';
    this.root.dataset.screen = 'menu';
    this.customizeScreen.hide();
    this.settingsScreen.hide();
    this.howToScreen.hide();
    if (this.game.state === 'menu') {
      this.startScreen.show();
      requestAnimationFrame(() => this.startScreen.focusPlay());
    }
  }

  private closeScreens(silent = false): void {
    if (this.screen !== 'menu') {
      this.customizeScreen.hide();
      this.settingsScreen.hide();
      this.howToScreen.hide();
      this.screen = 'menu';
      this.root.dataset.screen = 'menu';
    }
    this.pauseOverlay.hide();
    if (!silent) this.startScreen.hide();
  }

  private handleState(state: GameState): void {
    this.root.dataset.state = state;
    if (state === 'menu') {
      if (this.screen === 'menu') this.startScreen.show();
      else this.startScreen.hide();
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
      this.closeScreens();
      this.startScreen.hide();
      this.pauseOverlay.hide();
      this.finishOverlay.hide();
      this.showEndOverlay.hide();
      this.endKey = '';
      this.syncMatch();
      window.clearTimeout(this.hintTimer);
      this.hintTimer = window.setTimeout(() => this.hud.setHintVisible(false), 20_000);
    } else if (state === 'paused') {
      if (this.screen !== 'settings') {
        this.pauseOverlay.show(this.game.isPractice ? 'RESTART PRACTICE' : 'RESTART SHOW');
      }
    } else if (state === 'finished') {
      this.pauseOverlay.hide();
      this.roundIntro.hide();
      this.resultsOverlay.hide();
      if (this.game.match?.showResult) {
        if (this.ceremonyTimer !== 0) {
          this.hud.hide();
          return;
        }
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
      let reward = this.rewardedRounds.get(`${match.roundIndex}:${match.history.length}`) ?? null;
      if (key !== this.resultsKey || force) {
        this.resultsKey = key;
        reward = this.awardRound(match, last);
        this.resultsOverlay.show(
          match.roundIndex + 1,
          last.definition,
          last.placements,
          match.seedLabel,
          match.resultsTimer,
          reward ?? undefined,
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
      if (this.ceremonyTimer !== 0) return;
      const key = `${match.phase}:${match.showResult.seedLabel}:${match.showResult.won}`;
      if (key !== this.endKey || force) {
        this.endKey = key;
        this.showEndOverlay.show(match.showResult, this.profile, {
          kudos: this.showKudos,
          crowns: this.showCrowns,
          newBest: this.showNewBest,
        });
      }
    }
  }

  private announce(message: string): void {
    this.live.textContent = message;
    this.toast.textContent = message;
    this.toast.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('is-visible'), 2600);
  }

  private bindKeyboard(): void {
    const signal = this.abort.signal;
    window.addEventListener(
      'keydown',
      (event) => {
        const match = this.game.match;
        if (event.key === 'Escape') {
          if (this.screen !== 'menu') {
            event.preventDefault();
            this.closeScreen();
            return;
          }
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
          if (match?.phase === 'results' && !isInteractive(event.target)) {
            event.preventDefault();
            match.nextRound();
            return;
          }
          if (
            this.game.state === 'menu' &&
            this.screen === 'menu' &&
            !(event.target instanceof HTMLButtonElement)
          ) {
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
          this.screen === 'menu' &&
          !(event.target instanceof HTMLButtonElement)
        ) {
          event.preventDefault();
          this.startScreen.playSelected();
          return;
        }

        if (event.key === 'Tab' && (this.game.state === 'paused' || this.game.state === 'finished')) {
          if (this.screen === 'menu') this.trapFocus(event);
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

  private clearCeremony(): void {
    window.clearTimeout(this.ceremonyTimer);
    this.ceremonyTimer = 0;
    this.ceremony.hidden = true;
    this.ceremony.classList.remove('is-visible');
  }

  private blurActive(): void {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
}

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, input, textarea, select, a[href], [contenteditable="true"], [role="button"], [role="slider"], [role="textbox"]',
    ),
  );
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
