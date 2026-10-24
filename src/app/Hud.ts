import { el } from './dom';

export interface HudOptions {
  onPause: () => void;
}

/** Minimal HUD for the Training Deck slice. DOM/CSS only, updated by diffing text. */
export class Hud {
  readonly element = el('div', 'hud');
  private readonly timeLabel: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private readonly hint: HTMLElement;
  private lastSecond = -1;
  private toastTimer = 0;

  constructor(options: HudOptions) {
    this.element.id = 'hud';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Training deck heads-up display');

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
    round.appendChild(el('strong', 'hud-round__name', 'TRAINING DECK'));
    round.appendChild(el('span', 'hud-objective', 'Reach the finish gate'));
    bar.appendChild(round);

    const stats = el('div', 'hud-stats');
    stats.appendChild(el('span', 'hud-stats__label', 'TIME'));
    this.timeLabel = el('span', 'hud-time', '0:00');
    this.timeLabel.setAttribute('role', 'timer');
    this.timeLabel.setAttribute('aria-live', 'off');
    stats.appendChild(this.timeLabel);
    bar.appendChild(stats);

    this.element.appendChild(bar);

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

  setTime(seconds: number): void {
    const whole = Math.max(0, Math.floor(seconds));
    if (whole === this.lastSecond) return;
    this.lastSecond = whole;
    const minutes = Math.floor(whole / 60);
    const rest = String(whole % 60).padStart(2, '0');
    this.timeLabel.textContent = `${minutes}:${rest}`;
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
