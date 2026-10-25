import { el } from '../dom';
import { LEVEL_MODES, MODE_CATALOGUE, type LevelMode } from '../../game/levels/Level';
import { DIFFICULTY_PRESETS, type DifficultyId } from '../../game/match/Director';

export interface StartScreenOptions {
  seedLabel: string;
  dailyLabel: string;
  touch: boolean;
  initialDifficulty?: DifficultyId;
  onShow: (difficulty: DifficultyId, daily: boolean) => void;
  onPractice: (mode: LevelMode) => void;
  onDebugRound: (mode: LevelMode) => void;
}

/**
 * Sunrise Carnival start card. Phase three keeps the final menu art for later,
 * but every real control is here: Play Show, Practice, difficulty and the
 * quick/daily seed. The old Round jump buttons survive inside a labelled dev
 * drawer for QA and evidence capture.
 */
export class StartScreen {
  readonly element = el('section', 'start-screen');
  private readonly playButton: HTMLButtonElement;
  private readonly practiceButton: HTMLButtonElement;
  private readonly seedChip: HTMLElement;
  private readonly kindChip: HTMLElement;
  private readonly seedLabel: string;
  private readonly dailyLabel: string;
  private readonly difficultyButtons = new Map<DifficultyId, HTMLButtonElement>();
  private difficulty: DifficultyId;
  private daily = false;
  private readonly options: StartScreenOptions;

  constructor(options: StartScreenOptions) {
    this.options = options;
    this.seedLabel = options.seedLabel;
    this.dailyLabel = options.dailyLabel;
    this.difficulty = options.initialDifficulty ?? 'show';
    this.element.setAttribute('aria-labelledby', 'game-title');

    const backdrop = el('div', 'start-backdrop');
    backdrop.setAttribute('aria-hidden', 'true');
    this.element.appendChild(backdrop);

    const card = el('div', 'start-card start-card--show');
    this.element.appendChild(card);

    const sunburst = el('div', 'start-sunburst');
    sunburst.setAttribute('aria-hidden', 'true');
    card.appendChild(sunburst);

    card.appendChild(el('span', 'sticker sticker--coral', 'SUNRISE CARNIVAL'));
    const logo = el('h1', 'logo');
    logo.id = 'game-title';
    logo.setAttribute('aria-label', 'Tumble Rush');
    logo.appendChild(el('span', 'logo__top', 'TUMBLE'));
    logo.appendChild(el('span', 'logo__bottom', 'RUSH'));
    card.appendChild(logo);
    card.appendChild(el('p', 'tagline', 'a bean-powered game show'));

    const meta = el('div', 'start-meta');
    this.seedChip = el('span', 'chip chip--seed', '');
    meta.appendChild(this.seedChip);
    this.kindChip = el('span', 'chip chip--mint', 'QUICK SHOW');
    meta.appendChild(this.kindChip);
    card.appendChild(meta);

    const showRow = el('div', 'start-actions');
    this.playButton = el('button', 'btn btn--play', 'PLAY SHOW');
    this.playButton.type = 'button';
    this.playButton.id = 'play-show';
    const playIcon = el('span', 'btn__icon', '▶');
    playIcon.setAttribute('aria-hidden', 'true');
    this.playButton.appendChild(playIcon);
    this.playButton.addEventListener('click', () => this.options.onShow(this.difficulty, this.daily));
    showRow.appendChild(this.playButton);

    this.practiceButton = el('button', 'btn btn--practice', 'PRACTICE');
    this.practiceButton.type = 'button';
    this.practiceButton.id = 'play-practice';
    this.practiceButton.addEventListener('click', () => this.options.onPractice('course'));
    showRow.appendChild(this.practiceButton);
    card.appendChild(showRow);

    const toggleRow = el('div', 'seed-toggle');
    const quick = el('button', 'chip-toggle', 'QUICK SHOW');
    quick.type = 'button';
    quick.dataset.seed = 'quick';
    quick.addEventListener('click', () => this.setDaily(false));
    const daily = el('button', 'chip-toggle', 'DAILY SHOW');
    daily.type = 'button';
    daily.dataset.seed = 'daily';
    daily.addEventListener('click', () => this.setDaily(true));
    toggleRow.appendChild(quick);
    toggleRow.appendChild(daily);
    card.appendChild(toggleRow);

    const diffLabel = el('div', 'diff-label');
    diffLabel.appendChild(el('span', 'diff-label__kicker', 'BOT DIFFICULTY'));
    card.appendChild(diffLabel);
    const diffRow = el('div', 'diff-row');
    diffRow.setAttribute('role', 'group');
    diffRow.setAttribute('aria-label', 'Bot difficulty');
    for (const preset of Object.values(DIFFICULTY_PRESETS)) {
      const button = el('button', 'diff-chip');
      button.type = 'button';
      button.dataset.difficulty = preset.id;
      button.addEventListener('click', () => this.setDifficulty(preset.id));
      button.appendChild(el('strong', '', preset.label));
      button.appendChild(el('span', '', preset.blurb));
      diffRow.appendChild(button);
      this.difficultyButtons.set(preset.id, button);
    }
    card.appendChild(diffRow);

    const copy = el('p', 'brief');
    copy.textContent =
      'Sixteen Tumblers. Three Rounds. One crown. Race the Course, survive Hexapop, then climb for the crown.';
    card.appendChild(copy);

    const controls = el('div', 'start-controls');
    const rows: ReadonlyArray<readonly [string, string]> = [
      ['WASD', 'move'],
      ['SPACE', 'jump'],
      ['SHIFT', 'dive'],
      ['E', 'grab'],
      ['Q', 'emote'],
      ['ESC', 'pause'],
    ];
    for (const [key, action] of rows) {
      const row = el('span', 'start-control');
      row.appendChild(el('kbd', 'keycap keycap--small', key));
      row.appendChild(el('span', '', action));
      controls.appendChild(row);
    }
    card.appendChild(controls);

    const hint = el('p', 'start-hint');
    hint.id = 'start-hint';
    hint.textContent = options.touch
      ? 'Touch controls ready · left stick to move · buttons to tumble'
      : 'Press PLAY SHOW · 16 Tumblers · about six minutes';
    card.appendChild(hint);

    const dev = el('details', 'dev-panel');
    const summary = el('summary', 'dev-panel__summary', 'DEV / QA');
    dev.appendChild(summary);
    dev.appendChild(
      el(
        'p',
        'dev-panel__hint',
        'Debug Round jumps bypass the Show. Kept out of the main flow.',
      ),
    );
    const devButtons = el('div', 'dev-panel__buttons');
    for (const mode of LEVEL_MODES) {
      const button = el('button', 'dev-btn', MODE_CATALOGUE[mode].label);
      button.type = 'button';
      button.id = `mode-${mode}`;
      button.addEventListener('click', () => this.options.onDebugRound(mode));
      devButtons.appendChild(button);
    }
    const tutorial = el('button', 'dev-btn', 'TUTORIAL DECK');
    tutorial.type = 'button';
    tutorial.id = 'practice-tutorial';
    tutorial.addEventListener('click', () => this.options.onPractice('training'));
    devButtons.appendChild(tutorial);
    dev.appendChild(devButtons);
    card.appendChild(dev);

    this.setDifficulty(this.difficulty);
    this.setDaily(false);
  }

  focusPlay(): void {
    this.playButton.focus({ preventScroll: true });
  }

  playSelected(): void {
    this.options.onShow(this.difficulty, this.daily);
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

  private setDifficulty(id: DifficultyId): void {
    this.difficulty = id;
    for (const [candidate, button] of this.difficultyButtons) {
      const active = candidate === id;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  private setDaily(daily: boolean): void {
    this.daily = daily;
    this.seedChip.textContent = `SEED ${daily ? this.dailyLabel : this.seedLabel}`;
    this.kindChip.textContent = daily ? 'DAILY SHOW' : 'QUICK SHOW';
    this.kindChip.className = `chip ${daily ? 'chip--daily' : 'chip--mint'}`;
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('.chip-toggle')) {
      const active = button.dataset.seed === (daily ? 'daily' : 'quick');
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
}
