import { el } from '../dom';

export interface StartScreenOptions {
  seedLabel: string;
  touch: boolean;
  onPlay: () => void;
}

/**
 * The phase-one splash: a designed cream game-show card over the live 3D deck.
 * It is deliberately a single screen: title, stakes, one clear CTA, controls.
 */
export class StartScreen {
  readonly element = el('section', 'start-screen');
  private readonly playButton: HTMLButtonElement;

  constructor(options: StartScreenOptions) {
    this.element.setAttribute('aria-labelledby', 'game-title');

    const backdrop = el('div', 'start-backdrop');
    backdrop.setAttribute('aria-hidden', 'true');
    this.element.appendChild(backdrop);

    const card = el('div', 'start-card');
    this.element.appendChild(card);

    const sunburst = el('div', 'start-sunburst');
    sunburst.setAttribute('aria-hidden', 'true');
    card.appendChild(sunburst);

    const sticker = el('span', 'sticker sticker--coral', 'SUNRISE CARNIVAL');
    card.appendChild(sticker);

    const logo = el('h1', 'logo');
    logo.id = 'game-title';
    logo.setAttribute('aria-label', 'Tumble Rush');
    logo.appendChild(el('span', 'logo__top', 'TUMBLE'));
    logo.appendChild(el('span', 'logo__bottom', 'RUSH'));
    card.appendChild(logo);

    const tagline = el('p', 'tagline', 'a bean-powered game show');
    card.appendChild(tagline);

    const meta = el('div', 'start-meta');
    meta.appendChild(el('span', 'chip chip--mint', 'TRAINING DECK'));
    meta.appendChild(el('span', 'chip chip--seed', `SEED ${options.seedLabel}`));
    meta.appendChild(el('span', 'chip chip--practice', 'PRACTICE'));
    card.appendChild(meta);

    const brief = el(
      'p',
      'brief',
      'The deck is open. Hop the gap, hug the wall, ride the moving platform, and stick the landing on the finish deck.',
    );
    card.appendChild(brief);

    this.playButton = el('button', 'btn btn--play', 'PLAY');
    this.playButton.type = 'button';
    this.playButton.id = 'play-button';
    this.playButton.setAttribute('aria-describedby', 'start-hint');
    const playIcon = el('span', 'btn__icon', '▶');
    playIcon.setAttribute('aria-hidden', 'true');
    this.playButton.appendChild(playIcon);
    this.playButton.addEventListener('click', () => options.onPlay());
    card.appendChild(this.playButton);

    const controls = el('div', 'controls-grid');
    controls.setAttribute('aria-label', 'Controls');
    const rows: ReadonlyArray<readonly [string, string]> = [
      ['WASD', 'Move'],
      ['SPACE', 'Jump'],
      ['SHIFT', 'Dive'],
      ['E', 'Grab'],
      ['Q', 'Emote'],
      ['DRAG', 'Camera'],
      ['WHEEL', 'Zoom'],
      ['ESC', 'Pause'],
    ];
    for (const [key, action] of rows) {
      const row = el('div', 'control-row');
      row.appendChild(el('kbd', 'keycap', key));
      row.appendChild(el('span', 'control-label', action));
      controls.appendChild(row);
    }
    card.appendChild(controls);

    const hint = el('p', 'start-hint');
    hint.id = 'start-hint';
    hint.textContent = options.touch
      ? 'Touch controls ready · left stick to move · buttons to tumble'
      : 'Press Enter or tap Play · no downloads · plays in your browser';
    card.appendChild(hint);

    const foot = el('div', 'start-foot');
    foot.appendChild(el('span', 'start-foot__dot'));
    foot.appendChild(el('span', '', 'Practice deck · Build 0.1 · Phase 1'));
    card.appendChild(foot);
  }

  focusPlay(): void {
    this.playButton.focus({ preventScroll: true });
  }

  show(): void {
    this.element.hidden = false;
    this.element.classList.remove('is-leaving');
  }

  hide(): void {
    this.element.classList.add('is-leaving');
    this.element.hidden = true;
  }

  dispose(): void {
    this.element.remove();
  }
}
