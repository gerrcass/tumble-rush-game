import { el } from '../dom';

export interface PauseOverlayOptions {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

export class PauseOverlay {
  readonly element = el('div', 'overlay');
  private readonly resumeButton: HTMLButtonElement;

  constructor(options: PauseOverlayOptions) {
    this.element.id = 'pause-overlay';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'pause-title');

    const card = el('div', 'overlay-card overlay-card--pause');
    this.element.appendChild(card);
    card.appendChild(el('span', 'sticker sticker--mango', 'TAKE A BREATHER'));
    const title = el('h2', 'overlay-title', 'PAUSED');
    title.id = 'pause-title';
    card.appendChild(title);
    card.appendChild(el('p', 'overlay-copy', 'The show can wait. The beans are not going anywhere.'));

    this.resumeButton = this.addButton(card, 'btn btn--primary', 'RESUME', options.onResume);
    this.addButton(card, 'btn btn--ghost', 'RESTART DECK', options.onRestart);
    this.addButton(card, 'btn btn--ghost', 'QUIT TO MENU', options.onQuit);
    card.appendChild(el('p', 'overlay-hint', 'Esc resumes · all progress on this deck resets'));
  }

  show(): void {
    this.element.hidden = false;
    this.resumeButton.focus({ preventScroll: true });
  }

  hide(): void {
    this.element.hidden = true;
  }

  dispose(): void {
    this.element.remove();
  }

  private addButton(
    parent: HTMLElement,
    className: string,
    label: string,
    action: () => void,
  ): HTMLButtonElement {
    const button = el('button', className, label);
    button.type = 'button';
    button.addEventListener('click', action);
    parent.appendChild(button);
    return button;
  }
}

export interface FinishOverlayOptions {
  onReplay: () => void;
  onQuit: () => void;
}

export class FinishOverlay {
  readonly element = el('div', 'overlay');
  private readonly replayButton: HTMLButtonElement;
  private readonly timeLabel: HTMLElement;
  private readonly rankLabel: HTMLElement;

  constructor(options: FinishOverlayOptions) {
    this.element.id = 'finish-overlay';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'finish-title');

    const card = el('div', 'overlay-card overlay-card--finish');
    this.element.appendChild(card);

    const burst = el('div', 'finish-burst');
    burst.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 14; i += 1) {
      const bit = el('span', 'finish-burst__bit');
      bit.style.setProperty('--i', String(i));
      burst.appendChild(bit);
    }
    card.appendChild(burst);

    card.appendChild(el('span', 'sticker sticker--mint', 'TRAINING COMPLETE'));
    const title = el('h2', 'overlay-title overlay-title--finish', 'DECK CLEARED!');
    title.id = 'finish-title';
    card.appendChild(title);
    card.appendChild(el('p', 'overlay-copy', 'That is the Training Deck. The full show is still warming up.'));

    const stats = el('div', 'finish-stats');
    const timeBlock = el('div', 'finish-stat');
    timeBlock.appendChild(el('span', 'finish-stat__label', 'YOUR TIME'));
    this.timeLabel = el('strong', 'finish-stat__value', '0:00.0');
    timeBlock.appendChild(this.timeLabel);
    stats.appendChild(timeBlock);
    const rankBlock = el('div', 'finish-stat');
    rankBlock.appendChild(el('span', 'finish-stat__label', 'DECK RANK'));
    this.rankLabel = el('strong', 'finish-stat__value', 'GOLD');
    rankBlock.appendChild(this.rankLabel);
    stats.appendChild(rankBlock);
    card.appendChild(stats);

    this.replayButton = el('button', 'btn btn--primary', 'RUN IT AGAIN');
    this.replayButton.type = 'button';
    this.replayButton.addEventListener('click', options.onReplay);
    card.appendChild(this.replayButton);

    const menu = el('button', 'btn btn--ghost', 'BACK TO MENU');
    menu.type = 'button';
    menu.addEventListener('click', options.onQuit);
    card.appendChild(menu);
    card.appendChild(el('p', 'overlay-hint', 'Enter replays · Esc returns to the menu'));
  }

  show(seconds: number): void {
    this.timeLabel.textContent = formatTime(seconds);
    this.rankLabel.textContent = seconds <= 25 ? 'PLATINUM' : seconds <= 45 ? 'GOLD' : 'CANDY';
    this.element.hidden = false;
    this.replayButton.focus({ preventScroll: true });
  }

  hide(): void {
    this.element.hidden = true;
  }

  dispose(): void {
    this.element.remove();
  }
}

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}
