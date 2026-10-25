import { el } from './dom';
import type { MatchHud, StampTone } from '../game/match/Match';
import type { LevelStatus } from '../game/levels/Level';

export interface HudOptions {
  onPause: () => void;
  onSkipSpectate: () => void;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

/**
 * Show HUD: round, countdown/clock, qualifier slots, remaining Tumblers,
 * objective metric, phase, stamps, spectate banner. DOM/CSS only and diffed by
 * value so a 60 Hz tick does not rebuild nodes.
 */
export class Hud {
  readonly element = el('div', 'hud');
  private readonly timeLabel: HTMLElement;
  private readonly limitLabel: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly roundNumber: HTMLElement;
  private readonly roundName: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly metricLabel: HTMLElement;
  private readonly metricValue: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly progressText: HTMLElement;
  private readonly progressTrack: HTMLElement;
  private readonly qualifiedValue: HTMLElement;
  private readonly qualifiedSlots: HTMLElement;
  private readonly remainingValue: HTMLElement;
  private readonly playerState: HTMLElement;
  private readonly spectateBar: HTMLElement;
  private readonly spectateName: HTMLElement;
  private readonly stamp: HTMLElement;
  private readonly live: HTMLElement;

  private readonly skipButton: HTMLButtonElement;
  private lastSecond = -1;
  private lastRound = '';
  private lastPhase = '';
  private lastMetric = '';
  private lastMetricLabel = '';
  private lastProgress = -1;
  private lastQualified = -1;
  private lastRemaining = -1;
  private lastPlayerState = '';
  private lastSpectating = false;
  private toastTimer = 0;
  private stampTimer = 0;

  constructor(options: HudOptions) {
    this.element.id = 'hud';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Round heads-up display');

    const bar = el('div', 'hud-bar');

    this.pauseButton = el('button', 'hud-pause');
    this.pauseButton.type = 'button';
    this.pauseButton.setAttribute('aria-label', 'Pause game');
    this.pauseButton.appendChild(el('span', 'hud-pause__bar'));
    this.pauseButton.appendChild(el('span', 'hud-pause__bar'));
    this.pauseButton.addEventListener('click', () => options.onPause());
    bar.appendChild(this.pauseButton);

    const round = el('div', 'hud-round');
    const kicker = el('div', 'hud-kicker');
    this.roundNumber = el('span', 'hud-round__number', 'ROUND 1');
    kicker.appendChild(this.roundNumber);
    kicker.appendChild(el('span', 'hud-kicker__dot', '·'));
    kicker.appendChild(el('span', '', 'SUNRISE CARNIVAL'));
    round.appendChild(kicker);
    this.roundName = el('strong', 'hud-round__name', 'SUNRISE SCRAMBLE');
    round.appendChild(this.roundName);
    this.objective = el('span', 'hud-objective', 'Race through the Finish Gate');
    round.appendChild(this.objective);
    this.phase = el('span', 'hud-phase', 'SHOWTIME');
    round.appendChild(this.phase);
    bar.appendChild(round);

    const stats = el('div', 'hud-stats');
    stats.appendChild(el('span', 'hud-stats__label', 'CLOCK'));
    const timeRow = el('div', 'hud-time-row');
    this.timeLabel = el('span', 'hud-time', '2:00');
    this.timeLabel.setAttribute('role', 'timer');
    this.timeLabel.setAttribute('aria-live', 'off');
    timeRow.appendChild(this.timeLabel);
    this.limitLabel = el('span', 'hud-time-limit', '');
    timeRow.appendChild(this.limitLabel);
    stats.appendChild(timeRow);
    bar.appendChild(stats);

    const qualified = el('div', 'hud-slot hud-slot--qualified');
    qualified.appendChild(el('span', 'hud-slot__label', 'QUALIFIED'));
    const qualifiedRow = el('div', 'hud-slot__row');
    this.qualifiedValue = el('strong', 'hud-slot__value', '0');
    this.qualifiedSlots = el('span', 'hud-slot__slots', '/ 8');
    qualifiedRow.appendChild(this.qualifiedValue);
    qualifiedRow.appendChild(this.qualifiedSlots);
    qualified.appendChild(qualifiedRow);
    bar.appendChild(qualified);

    const remaining = el('div', 'hud-slot hud-slot--remaining');
    remaining.appendChild(el('span', 'hud-slot__label', 'REMAINING'));
    this.remainingValue = el('strong', 'hud-slot__value', '16');
    remaining.appendChild(this.remainingValue);
    bar.appendChild(remaining);

    const metric = el('div', 'hud-metric');
    this.metricLabel = el('span', 'hud-metric__label', 'PROGRESS');
    metric.appendChild(this.metricLabel);
    this.metricValue = el('strong', 'hud-metric__value', '0%');
    metric.appendChild(this.metricValue);
    bar.appendChild(metric);

    this.element.appendChild(bar);

    const subBar = el('div', 'hud-subbar');
    this.playerState = el('span', 'hud-player-state', 'YOU · RACING');
    subBar.appendChild(this.playerState);
    const progress = el('div', 'hud-progress');
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', 'Round progress');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    this.progressTrack = progress;
    const track = el('div', 'hud-progress__track');
    this.progressFill = el('span', 'hud-progress__fill');
    track.appendChild(this.progressFill);
    progress.appendChild(track);
    this.progressText = el('span', 'hud-progress__text', '0%');
    progress.appendChild(this.progressText);
    subBar.appendChild(progress);
    this.element.appendChild(subBar);

    this.spectateBar = el('div', 'hud-spectate');
    this.spectateBar.hidden = true;
    this.spectateBar.appendChild(el('span', 'hud-spectate__kicker', 'SPECTATING'));
    this.spectateName = el('strong', 'hud-spectate__name', '');
    this.spectateBar.appendChild(this.spectateName);
    this.skipButton = el('button', 'btn btn--tiny', 'SKIP TO RESULTS');
    this.skipButton.type = 'button';
    this.skipButton.addEventListener('click', () => options.onSkipSpectate());
    this.spectateBar.appendChild(this.skipButton);
    this.element.appendChild(this.spectateBar);

    this.hint = el('div', 'hud-hint');
    this.hint.appendChild(el('kbd', 'keycap keycap--small', 'WASD'));
    this.hint.appendChild(el('span', '', 'move'));
    this.hint.appendChild(el('kbd', 'keycap keycap--small', 'SPACE'));
    this.hint.appendChild(el('span', '', 'jump'));
    this.hint.appendChild(el('kbd', 'keycap keycap--small', 'SHIFT'));
    this.hint.appendChild(el('span', '', 'dive'));
    this.hint.appendChild(el('kbd', 'keycap keycap--small', 'E'));
    this.hint.appendChild(el('span', '', 'grab'));
    this.hint.appendChild(el('kbd', 'keycap keycap--small', 'DRAG'));
    this.hint.appendChild(el('span', '', 'camera'));
    this.element.appendChild(this.hint);

    this.stamp = el('div', 'hud-stamp');
    this.stamp.hidden = true;
    this.element.appendChild(this.stamp);

    this.live = el('div', 'sr-only');
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-live', 'assertive');
    this.element.appendChild(this.live);

    this.toast = el('div', 'hud-toast');
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');
    this.element.appendChild(this.toast);
  }

  show(): void {
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }

  setShow(hud: MatchHud): void {
    const roundKey = `${hud.roundNumber}|${hud.roundTitle}`;
    if (roundKey !== this.lastRound) {
      this.lastRound = roundKey;
      this.roundNumber.textContent = `ROUND ${hud.roundNumber}`;
      this.roundName.textContent = hud.roundTitle;
      this.objective.textContent = hud.objective;
      this.element.setAttribute('aria-label', `${hud.roundTitle} heads-up display`);
    }
    if (hud.phaseLabel !== this.lastPhase) {
      this.lastPhase = hud.phaseLabel;
      this.phase.textContent = hud.phaseLabel;
    }
    if (hud.metricLabel !== this.lastMetricLabel) {
      this.lastMetricLabel = hud.metricLabel;
      this.metricLabel.textContent = hud.metricLabel;
    }
    if (hud.metricValue !== this.lastMetric) {
      this.lastMetric = hud.metricValue;
      this.metricValue.textContent = hud.metricValue;
    }

    const remaining = Math.max(0, hud.timeLimit - hud.time);
    const second = Math.ceil(remaining);
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      this.timeLabel.textContent = clock(remaining);
      this.limitLabel.textContent = clock(hud.timeLimit);
    }

    if (hud.qualified !== this.lastQualified) {
      this.lastQualified = hud.qualified;
      this.qualifiedValue.textContent = String(hud.qualified);
    }
    this.qualifiedSlots.textContent = `/ ${hud.qualifiers}`;

    if (hud.remaining !== this.lastRemaining) {
      this.lastRemaining = hud.remaining;
      this.remainingValue.textContent = String(hud.remaining);
    }
    if (hud.playerStatus !== this.lastPlayerState) {
      this.lastPlayerState = hud.playerStatus;
      this.playerState.textContent = `YOU · ${hud.playerStatus}`;
      this.playerState.dataset.status = hud.playerStatus;
    }

    const percent = Math.round(hud.progress * 100);
    if (percent !== this.lastProgress) {
      this.lastProgress = percent;
      this.progressFill.style.width = `${percent}%`;
      this.progressText.textContent = hud.progressLabel;
      this.progressTrack.setAttribute('aria-valuenow', String(percent));
      this.progressTrack.setAttribute(
        'aria-valuetext',
        `${hud.progressLabel} through ${hud.roundTitle}`,
      );
    }

    if (hud.spectating !== this.lastSpectating) {
      this.lastSpectating = hud.spectating;
      this.spectateBar.hidden = !hud.spectating;
    }
    if (hud.spectating) this.spectateName.textContent = hud.spectateName;
  }

  /** Practice/free-play fallback: no Show record, just the Level numbers. */
  setPractice(status: LevelStatus): void {
    this.setShow({
      phase: 'playing',
      roundNumber: 1,
      roundTitle: status.title,
      objective: status.objective,
      time: status.elapsed,
      timeLimit: status.timeLimit,
      qualified: 0,
      qualifiers: 0,
      remaining: 1,
      total: 1,
      metricLabel: status.metricLabel,
      metricValue: status.metricValue,
      phaseLabel: `PRACTICE · ${status.phase}`,
      progress: status.progress,
      progressLabel: status.progressLabel,
      spectating: false,
      spectateName: '',
      playerStatus: 'RACING',
      seedLabel: '',
    });
    this.qualifiedSlots.textContent = '';
  }

  setHintVisible(visible: boolean): void {
    this.hint.hidden = !visible;
  }

  showStamp(text: string, tone: StampTone = 'normal'): void {
    this.stamp.textContent = text;
    this.stamp.className = `hud-stamp is-visible hud-stamp--${tone}`;
    this.stamp.hidden = false;
    this.live.textContent = text;
    window.clearTimeout(this.stampTimer);
    this.stampTimer = window.setTimeout(() => {
      this.stamp.className = 'hud-stamp';
      this.stamp.hidden = true;
    }, 2100);
  }

  announce(message: string): void {
    this.live.textContent = message;
  }

  showToast(message: string, tone: 'normal' | 'good' | 'bad' = 'normal'): void {
    this.toast.textContent = message;
    this.toast.className = `hud-toast is-visible hud-toast--${tone}`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.className = 'hud-toast';
    }, 1800);
  }

  dispose(): void {
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.stampTimer);
    this.element.remove();
  }
}
