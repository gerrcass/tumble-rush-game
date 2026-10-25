import { el } from '../dom';
import type { LevelResult } from '../../game/levels/Level';

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
    this.addButton(card, 'btn btn--ghost', 'RESTART ROUND', options.onRestart);
    this.addButton(card, 'btn btn--ghost', 'QUIT TO MENU', options.onQuit);
    card.appendChild(el('p', 'overlay-hint', 'Esc resumes · restarting resets this Round'));
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

interface EndCopy {
  sticker: string;
  tone: string;
  title: string;
  copy: string;
  stat: string;
  statLabel: string;
}

function endCopy(result: LevelResult): EndCopy {
  switch (result.kind) {
    case 'finish':
      return {
        sticker: 'FINISH GATE',
        tone: 'mint',
        title: result.title,
        copy: result.detail,
        stat: 'QUALIFIED',
        statLabel: 'RESULT',
      };
    case 'crown':
      return {
        sticker: 'CROWN CLIMB',
        tone: 'mango',
        title: result.title,
        copy: result.detail,
        stat: 'WINNER',
        statLabel: 'RESULT',
      };
    case 'survived':
      return {
        sticker: 'HEXAPOP',
        tone: 'mint',
        title: result.title,
        copy: result.detail,
        stat: 'SURVIVED',
        statLabel: 'RESULT',
      };
    case 'timeout':
      return {
        sticker: 'TIME!',
        tone: 'mango',
        title: result.title,
        copy: result.detail,
        stat: result.winner ?? 'NOBODY',
        statLabel: 'HIGHEST',
      };
    case 'eliminated':
    default:
      return {
        sticker: 'SUNRISE CARNIVAL',
        tone: 'coral',
        title: 'ELIMINATED',
        copy: result.detail,
        stat: 'OUT',
        statLabel: 'RESULT',
      };
  }
}

export class FinishOverlay {
  readonly element = el('div', 'overlay');
  private readonly replayButton: HTMLButtonElement;
  private readonly timeLabel: HTMLElement;
  private readonly statLabel: HTMLElement;
  private readonly statValue: HTMLElement;
  private readonly sticker: HTMLElement;
  private readonly title: HTMLElement;
  private readonly copy: HTMLElement;
  private readonly roundLabel: HTMLElement;

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

    this.sticker = el('span', 'sticker sticker--mint', 'TRAINING COMPLETE');
    card.appendChild(this.sticker);
    this.title = el('h2', 'overlay-title overlay-title--finish', 'DECK CLEARED!');
    this.title.id = 'finish-title';
    card.appendChild(this.title);
    this.roundLabel = el('p', 'overlay-round', '');
    card.appendChild(this.roundLabel);
    this.copy = el('p', 'overlay-copy', 'That is the Training Deck.');
    card.appendChild(this.copy);

    const stats = el('div', 'finish-stats');
    const timeBlock = el('div', 'finish-stat');
    timeBlock.appendChild(el('span', 'finish-stat__label', 'YOUR TIME'));
    this.timeLabel = el('strong', 'finish-stat__value', '0:00.0');
    timeBlock.appendChild(this.timeLabel);
    stats.appendChild(timeBlock);
    const rankBlock = el('div', 'finish-stat');
    this.statLabel = el('span', 'finish-stat__label', 'RESULT');
    this.statValue = el('strong', 'finish-stat__value', 'QUALIFIED');
    rankBlock.appendChild(this.statLabel);
    rankBlock.appendChild(this.statValue);
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

  show(result: LevelResult): void {
    const copy = endCopy(result);
    this.sticker.textContent = copy.sticker;
    this.sticker.className = `sticker sticker--${copy.tone}`;
    this.title.textContent = copy.title;
    this.roundLabel.textContent = result.roundTitle ?? '';
    this.copy.textContent = copy.copy;
    this.statLabel.textContent = copy.statLabel;
    this.statValue.textContent = copy.stat;
    this.timeLabel.textContent = formatTime(result.time);
    this.replayButton.textContent = result.kind === 'eliminated' ? 'RESTART ROUND' : 'RUN IT AGAIN';
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
