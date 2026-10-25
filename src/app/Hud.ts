import { el } from './dom';
import type { LevelStatus } from '../game/levels/Level';

export interface HudOptions {
  onPause: () => void;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

/** Minimal HUD for every phase-two Round. DOM/CSS only, diffed text updates. */
export class Hud {
  readonly element = el('div', 'hud');
  private readonly timeLabel: HTMLElement;
  private readonly limitLabel: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly roundName: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly metricLabel: HTMLElement;
  private readonly metricValue: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly progressText: HTMLElement;
  private readonly progressTrack: HTMLElement;
  private lastSecond = -1;
  private lastMode = '';
  private lastPhase = '';
  private lastMetric = '';
  private lastMetricLabel = '';
  private lastProgress = -1;
  private toastTimer = 0;

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
    round.appendChild(el('span', 'hud-kicker', 'SUNRISE CARNIVAL'));
    this.roundName = el('strong', 'hud-round__name', 'TRAINING DECK');
    round.appendChild(this.roundName);
    this.objective = el('span', 'hud-objective', 'Reach the finish gate');
    round.appendChild(this.objective);
    this.phase = el('span', 'hud-phase', 'PRACTICE');
    round.appendChild(this.phase);
    bar.appendChild(round);

    const stats = el('div', 'hud-stats');
    stats.appendChild(el('span', 'hud-stats__label', 'TIME'));
    const timeRow = el('div', 'hud-time-row');
    this.timeLabel = el('span', 'hud-time', '0:00');
    this.timeLabel.setAttribute('role', 'timer');
    this.timeLabel.setAttribute('aria-live', 'off');
    timeRow.appendChild(this.timeLabel);
    this.limitLabel = el('span', 'hud-time-limit', '');
    timeRow.appendChild(this.limitLabel);
    stats.appendChild(timeRow);
    bar.appendChild(stats);

    const metric = el('div', 'hud-metric');
    this.metricLabel = el('span', 'hud-metric__label', 'PROGRESS');
    metric.appendChild(this.metricLabel);
    this.metricValue = el('strong', 'hud-metric__value', '0%');
    metric.appendChild(this.metricValue);
    bar.appendChild(metric);

    this.element.appendChild(bar);

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
    this.element.appendChild(progress);

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

  setLevelStatus(status: LevelStatus): void {
    if (status.mode !== this.lastMode) {
      this.lastMode = status.mode;
      this.roundName.textContent = status.title;
      this.objective.textContent = status.objective;
      this.element.setAttribute('aria-label', `${status.title} heads-up display`);
    }
    if (status.phase !== this.lastPhase) {
      this.lastPhase = status.phase;
      this.phase.textContent = status.phase;
    }
    if (status.metricLabel !== this.lastMetricLabel) {
      this.lastMetricLabel = status.metricLabel;
      this.metricLabel.textContent = status.metricLabel;
    }
    if (status.metricValue !== this.lastMetric) {
      this.lastMetric = status.metricValue;
      this.metricValue.textContent = status.metricValue;
    }

    const second = Math.floor(status.elapsed);
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      this.timeLabel.textContent = clock(status.elapsed);
      this.limitLabel.textContent = status.timeLimit > 0 ? `/ ${clock(status.timeLimit)}` : '';
    }

    const percent = Math.round(status.progress * 100);
    if (percent !== this.lastProgress) {
      this.lastProgress = percent;
      this.progressFill.style.width = `${percent}%`;
      this.progressText.textContent = status.progressLabel;
      this.progressTrack.setAttribute('aria-valuenow', String(percent));
      this.progressTrack.setAttribute(
        'aria-valuetext',
        `${status.progressLabel} of the way through ${status.title}`,
      );
    }
  }

  setHintVisible(visible: boolean): void {
    this.hint.hidden = !visible;
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
    this.element.remove();
  }
}
