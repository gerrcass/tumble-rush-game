import { el } from '../dom';
import { LEVEL_MODES, MODE_CATALOGUE, type LevelMode } from '../../game/levels/Level';
import { DIFFICULTY_PRESETS, type DifficultyId } from '../../game/match/Director';
import { colorFor } from '../../game/cosmetics';
import { formatBest, formatNumber, type Profile } from '../../game/profile';

export interface StartScreenOptions {
  seedLabel: string;
  dailyLabel: string;
  touch: boolean;
  initialDifficulty?: DifficultyId;
  profile: Profile;
  onShow: (difficulty: DifficultyId, daily: boolean) => void;
  onPractice: (mode: LevelMode) => void;
  onCustomize: () => void;
  onSettings: () => void;
  onHowTo: () => void;
  onToggleSound: () => void;
  onDebugRound: (mode: LevelMode) => void;
}

/**
 * The show's front door: a live 3D diorama on the right, the cream ticket
 * counter on the left. All five real destinations are here, plus the seed and
 * difficulty pickers. The labelled dev drawer keeps the old Round hooks out of
 * the player's path.
 */
export class StartScreen {
  readonly element = el('section', 'start-screen menu');
  private readonly playButton: HTMLButtonElement;
  private readonly practiceButton: HTMLButtonElement;
  private readonly customizeButton: HTMLButtonElement;
  private readonly nameLabel: HTMLElement;
  private readonly crownsLabel: HTMLElement;
  private readonly kudosLabel: HTMLElement;
  private readonly bestLabel: HTMLElement;
  private readonly avatar: HTMLElement;
  private readonly seedChip: HTMLElement;
  private readonly kindChip: HTMLElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly dailyChip: HTMLElement;
  private seedLabel: string;
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

    const shell = el('div', 'menu-shell');

    // ---- Ticket counter -------------------------------------------------
    const panel = el('div', 'menu-panel');
    panel.appendChild(el('span', 'sticker sticker--coral', 'SUNRISE CARNIVAL'));
    const logo = el('h1', 'logo menu-logo');
    logo.id = 'game-title';
    logo.setAttribute('aria-label', 'Tumble Rush');
    logo.appendChild(el('span', 'logo__top', 'TUMBLE'));
    logo.appendChild(el('span', 'logo__bottom', 'RUSH'));
    panel.appendChild(logo);
    panel.appendChild(el('p', 'tagline', 'a bean-powered game show'));

    const profile = el('div', 'profile-chip');
    profile.id = 'menu-profile';
    profile.setAttribute('aria-label', 'Player profile');
    this.avatar = el('span', 'profile-chip__avatar');
    this.avatar.setAttribute('aria-hidden', 'true');
    profile.appendChild(this.avatar);
    const identity = el('span', 'profile-chip__identity');
    this.nameLabel = el('strong', 'profile-chip__name', options.profile.name);
    identity.appendChild(this.nameLabel);
    this.bestLabel = el('span', 'profile-chip__best', 'BEST —');
    identity.appendChild(this.bestLabel);
    profile.appendChild(identity);
    const wallet = el('span', 'profile-chip__wallet');
    const crowns = el('span', 'profile-chip__stat profile-chip__stat--crown');
    crowns.appendChild(el('span', 'profile-chip__icon', '♛'));
    this.crownsLabel = el('strong', '', '0');
    crowns.appendChild(this.crownsLabel);
    crowns.appendChild(el('span', 'profile-chip__unit', 'CROWNS'));
    wallet.appendChild(crowns);
    const kudos = el('span', 'profile-chip__stat profile-chip__stat--kudos');
    kudos.appendChild(el('span', 'profile-chip__icon', '✦'));
    this.kudosLabel = el('strong', '', '0');
    kudos.appendChild(this.kudosLabel);
    kudos.appendChild(el('span', 'profile-chip__unit', 'KUDOS'));
    wallet.appendChild(kudos);
    profile.appendChild(wallet);
    panel.appendChild(profile);

    const showRow = el('div', 'menu-play-row');
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
    panel.appendChild(showRow);

    const destinations = el('div', 'menu-destinations');
    this.customizeButton = this.destination(
      destinations,
      'CUSTOMIZE',
      'Color, pattern, hat, emote',
      options.onCustomize,
      'open-customize',
    );
    this.destination(
      destinations,
      'HOW TO PLAY',
      'Controls and the three Rounds',
      options.onHowTo,
      'open-howto',
    );
    this.destination(
      destinations,
      'SETTINGS',
      'Quality, motion, controls',
      options.onSettings,
      'open-settings',
    );
    panel.appendChild(destinations);

    const seedGroup = el('div', 'menu-seed');
    const seedHead = el('div', 'menu-section-head');
    seedHead.appendChild(el('span', 'menu-section-kicker', 'SHOW SEED'));
    this.dailyChip = el('span', 'chip chip--seed', '');
    seedHead.appendChild(this.dailyChip);
    seedGroup.appendChild(seedHead);
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
    seedGroup.appendChild(toggleRow);
    const meta = el('div', 'start-meta menu-meta');
    this.seedChip = el('span', 'chip chip--seed', '');
    meta.appendChild(this.seedChip);
    this.kindChip = el('span', 'chip chip--mint', 'QUICK SHOW');
    meta.appendChild(this.kindChip);
    seedGroup.appendChild(meta);
    panel.appendChild(seedGroup);

    const diffHead = el('div', 'menu-section-head');
    diffHead.appendChild(el('span', 'menu-section-kicker', 'BOT DIFFICULTY'));
    panel.appendChild(diffHead);
    const diffRow = el('div', 'diff-row');
    diffRow.setAttribute('role', 'group');
    diffRow.setAttribute('aria-label', 'Bot difficulty');
    for (const preset of Object.values(DIFFICULTY_PRESETS)) {
      const button = el('button', 'diff-chip');
      button.type = 'button';
      button.dataset.difficulty = preset.id;
      button.appendChild(el('strong', '', preset.label));
      button.appendChild(el('span', '', preset.blurb));
      button.addEventListener('click', () => this.setDifficulty(preset.id));
      button.setAttribute('aria-pressed', String(preset.id === this.difficulty));
      diffRow.appendChild(button);
      this.difficultyButtons.set(preset.id, button);
    }
    panel.appendChild(diffRow);

    const footer = el('div', 'menu-footer');
    this.soundButton = el('button', 'menu-sound', 'SOUND ON');
    this.soundButton.type = 'button';
    this.soundButton.id = 'menu-sound';
    this.soundButton.setAttribute('aria-pressed', String(!options.profile.settings.muted));
    this.soundButton.addEventListener('click', () => this.options.onToggleSound());
    footer.appendChild(this.soundButton);
    const hint = el('span', 'menu-footer__hint');
    hint.textContent = options.touch
      ? 'Touch controls ready · left stick to move'
      : 'Press PLAY SHOW · 16 Tumblers · about six minutes';
    footer.appendChild(hint);
    panel.appendChild(footer);

    const dev = el('details', 'dev-panel');
    dev.appendChild(el('summary', 'dev-panel__summary', 'DEV / QA'));
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
    panel.appendChild(dev);

    shell.appendChild(panel);

    // ---- Live diorama stage --------------------------------------------
    const stage = el('div', 'menu-stage');
    stage.setAttribute('aria-hidden', 'true');
    stage.appendChild(el('span', 'menu-balloon menu-balloon--a'));
    stage.appendChild(el('span', 'menu-balloon menu-balloon--b'));
    stage.appendChild(el('span', 'menu-balloon menu-balloon--c'));
    const confetti = el('div', 'menu-confetti');
    for (let i = 0; i < 22; i += 1) {
      const bit = el('span', 'menu-confetti__bit');
      bit.style.setProperty('--i', String(i));
      confetti.appendChild(bit);
    }
    stage.appendChild(confetti);
    const caption = el('div', 'menu-stage__caption');
    caption.appendChild(el('span', 'menu-stage__kicker', 'LIVE FROM THE START DECK'));
    caption.appendChild(el('strong', '', 'THE PACK IS WARMING UP'));
    stage.appendChild(caption);
    shell.appendChild(stage);
    this.element.appendChild(shell);

    this.setProfile(options.profile);
    this.setDifficulty(this.difficulty);
    this.setDaily(false);
  }

  focusPlay(): void {
    this.playButton.focus({ preventScroll: true });
  }

  focusCustomize(): void {
    this.customizeButton.focus({ preventScroll: true });
  }

  playSelected(): void {
    this.options.onShow(this.difficulty, this.daily);
  }

  /** A fresh Quick Show seed gets a fresh menu chip, including after a replay. */
  setSeedLabel(label: string): void {
    this.seedLabel = label;
    if (!this.daily) this.seedChip.textContent = `SEED ${label}`;
  }

  setProfile(profile: Profile): void {
    this.nameLabel.textContent = profile.name;
    this.crownsLabel.textContent = formatNumber(profile.crowns);
    this.kudosLabel.textContent = formatNumber(profile.kudos);
    this.bestLabel.textContent = `BEST ${formatBest(profile.bestFinish)}`;
    this.avatar.style.setProperty('--look-color', colorFor(profile.look.colorId).hex);
    this.avatar.style.setProperty('--look-accent', colorFor(profile.look.colorId).accent);
    this.avatar.dataset.pattern = profile.look.patternId;
    this.soundButton.textContent = profile.settings.muted ? 'SOUND OFF' : 'SOUND ON';
    this.soundButton.setAttribute('aria-pressed', String(!profile.settings.muted));
    this.element.setAttribute(
      'aria-label',
      `${profile.name}, ${profile.crowns} crowns, ${profile.kudos} kudos`,
    );
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

  private destination(
    parent: HTMLElement,
    label: string,
    detail: string,
    action: () => void,
    id: string,
  ): HTMLButtonElement {
    const button = el('button', 'menu-destination');
    button.type = 'button';
    button.id = id;
    button.appendChild(el('strong', '', label));
    button.appendChild(el('span', '', detail));
    button.addEventListener('click', action);
    parent.appendChild(button);
    return button;
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
    this.dailyChip.textContent = daily ? 'ONE RECORDED RESULT TODAY' : 'A FRESH SEEDED SHOW';
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('.chip-toggle')) {
      const active = button.dataset.seed === (daily ? 'daily' : 'quick');
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
}
