import { el } from '../dom';
import { LEVEL_MODES, MODE_CATALOGUE, type LevelMode } from '../../game/levels/Level';

export interface StartScreenOptions {
  seedLabel: string;
  touch: boolean;
  initialMode?: LevelMode;
  onPlay: (mode: LevelMode) => void;
}

const BRIEFS: Readonly<Record<LevelMode, string>> = {
  training:
    'The deck is open. Hop the gap, hug the wall, ride the moving platform, and stick the landing on the finish deck.',
  course:
    'Five Sections of Sunrise Carnival chaos: hurdles, sweepers, pendulums, jelly gaps, pushers and the raised Crown Gate. Race the clock and hit the Finish Gate.',
  hexapop:
    'Three honeycomb tiers over hungry pink slime. Every tile warns before it drops. Survive the Sugar Rush and keep something under your feet.',
  'crown-climb':
    'Climb 48 units of spinning beams, rising donuts and pendulums while candy slime rises below. Touch the giant crown before the clock or the slime decides it.',
};

/**
 * The phase-two splash: designed cream game-show card over the live 3D scene,
 * with a clearly-labelled temporary mode selector so every Round can be played
 * and screenshotted. Phase three replaces this with the real show flow.
 */
export class StartScreen {
  readonly element = el('section', 'start-screen');
  private readonly playButton: HTMLButtonElement;
  private readonly modeChip: HTMLElement;
  private readonly kindChip: HTMLElement;
  private readonly brief: HTMLElement;
  private readonly modeButtons = new Map<LevelMode, HTMLButtonElement>();
  private selectedMode: LevelMode;
  private readonly onPlay: (mode: LevelMode) => void;

  constructor(options: StartScreenOptions) {
    this.onPlay = options.onPlay;
    this.selectedMode = options.initialMode ?? 'training';
    this.element.setAttribute('aria-labelledby', 'game-title');

    const backdrop = el('div', 'start-backdrop');
    backdrop.setAttribute('aria-hidden', 'true');
    this.element.appendChild(backdrop);

    const card = el('div', 'start-card start-card--modes');
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
    this.modeChip = el('span', 'chip chip--mint', MODE_CATALOGUE[this.selectedMode].label);
    meta.appendChild(this.modeChip);
    meta.appendChild(el('span', 'chip chip--seed', `SEED ${options.seedLabel}`));
    this.kindChip = el('span', 'chip chip--practice', 'PRACTICE');
    meta.appendChild(this.kindChip);
    card.appendChild(meta);

    const modeLabel = el('div', 'mode-picker__label');
    modeLabel.appendChild(el('span', 'mode-picker__kicker', 'TEMP MODE SELECT'));
    modeLabel.appendChild(el('span', 'mode-picker__hint', 'phase 3 brings the real show flow'));
    card.appendChild(modeLabel);

    const picker = el('div', 'mode-picker');
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Choose a Round');
    for (const mode of LEVEL_MODES) {
      const entry = MODE_CATALOGUE[mode];
      const button = el('button', 'mode-btn');
      button.type = 'button';
      button.id = `mode-${mode}`;
      button.dataset.mode = mode;
      button.setAttribute('aria-pressed', String(mode === this.selectedMode));
      button.appendChild(el('span', 'mode-btn__name', entry.label));
      button.appendChild(el('span', 'mode-btn__tag', entry.tagline));
      button.addEventListener('click', () => this.selectMode(mode));
      picker.appendChild(button);
      this.modeButtons.set(mode, button);
    }
    card.appendChild(picker);

    this.brief = el('p', 'brief', BRIEFS[this.selectedMode]);
    card.appendChild(this.brief);

    this.playButton = el('button', 'btn btn--play', 'PLAY');
    this.playButton.type = 'button';
    this.playButton.id = 'play-button';
    this.playButton.setAttribute('aria-describedby', 'start-hint');
    const playIcon = el('span', 'btn__icon', '▶');
    playIcon.setAttribute('aria-hidden', 'true');
    this.playButton.appendChild(playIcon);
    this.playButton.addEventListener('click', () => this.onPlay(this.selectedMode));
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
    foot.appendChild(el('span', '', 'Build 0.2 · Phase 2 · four Rounds playable'));
    card.appendChild(foot);

    this.selectMode(this.selectedMode);
  }

  focusPlay(): void {
    this.playButton.focus({ preventScroll: true });
  }

  playSelected(): void {
    this.onPlay(this.selectedMode);
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

  private selectMode(mode: LevelMode): void {
    this.selectedMode = mode;
    const entry = MODE_CATALOGUE[mode];
    this.modeChip.textContent = entry.label;
    this.kindChip.textContent =
      mode === 'training'
        ? 'PRACTICE'
        : mode === 'course'
          ? 'ROUND 1'
          : mode === 'hexapop'
            ? 'ROUND 2'
            : 'FINAL';
    this.brief.textContent = BRIEFS[mode];
    for (const [candidate, button] of this.modeButtons) {
      const active = candidate === mode;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
}
