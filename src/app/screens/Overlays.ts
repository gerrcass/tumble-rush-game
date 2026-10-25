import { el } from '../dom';
import type { LevelResult } from '../../game/levels/Level';
import type { RoundDefinition, RoundPlacement } from '../../game/match/Director';
import type { ShowResult } from '../../game/match/Match';
import type { Profile } from '../../game/profile';

export interface PauseOverlayOptions {
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export class PauseOverlay {
  readonly element = el('div', 'overlay');
  private readonly resumeButton: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;

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
    this.restartButton = this.addButton(card, 'btn btn--ghost', 'RESTART SHOW', options.onRestart);
    this.addButton(card, 'btn btn--ghost', 'SETTINGS', options.onSettings);
    this.addButton(card, 'btn btn--ghost', 'QUIT TO MENU', options.onQuit);
    card.appendChild(el('p', 'overlay-hint', 'Esc resumes · settings returns here · restart replays the Show'));
  }

  show(restartLabel = 'RESTART SHOW'): void {
    this.restartButton.textContent = restartLabel;
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

/**
 * Full-screen Round card: number, name, objective, field size, qualifier count
 * and the 3-2-1-TUMBLE countdown. Inputs are physically locked by Match during
 * this phase; this overlay only reports it.
 */
export class RoundIntro {
  readonly element = el('section', 'round-intro');
  private readonly roundNumber: HTMLElement;
  private readonly roundName: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly starters: HTMLElement;
  private readonly qualifiers: HTMLElement;
  private readonly seed: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly countdownLabel: HTMLElement;
  private lastCount = '';
  private lastPhase = '';

  constructor() {
    this.element.hidden = true;
    this.element.setAttribute('aria-labelledby', 'round-intro-title');

    const card = el('div', 'round-intro__card');
    this.element.appendChild(card);
    card.appendChild(el('span', 'sticker sticker--mango', 'NEXT UP'));

    const meta = el('div', 'round-intro__meta');
    this.roundNumber = el('span', 'round-intro__number', 'ROUND 1');
    meta.appendChild(this.roundNumber);
    this.seed = el('span', 'chip chip--seed', '');
    meta.appendChild(this.seed);
    card.appendChild(meta);

    this.roundName = el('h2', 'round-intro__title', 'SUNRISE SCRAMBLE');
    this.roundName.id = 'round-intro-title';
    card.appendChild(this.roundName);
    this.objective = el('p', 'round-intro__objective', '');
    card.appendChild(this.objective);

    const facts = el('div', 'round-intro__facts');
    const startersFact = el('div', 'round-intro__fact');
    startersFact.appendChild(el('span', 'round-intro__fact-label', 'TUMBLERS'));
    this.starters = el('strong', 'round-intro__fact-value', '16');
    startersFact.appendChild(this.starters);
    facts.appendChild(startersFact);
    const qualifiersFact = el('div', 'round-intro__fact round-intro__fact--mint');
    qualifiersFact.appendChild(el('span', 'round-intro__fact-label', 'QUALIFY'));
    this.qualifiers = el('strong', 'round-intro__fact-value', 'TOP 8');
    qualifiersFact.appendChild(this.qualifiers);
    facts.appendChild(qualifiersFact);
    card.appendChild(facts);

    const countdownWrap = el('div', 'round-intro__countdown');
    this.countdownLabel = el('span', 'round-intro__countdown-label', 'GET READY');
    countdownWrap.appendChild(this.countdownLabel);
    this.countdown = el('strong', 'round-intro__countdown-value', '3');
    this.countdown.setAttribute('aria-live', 'assertive');
    countdownWrap.appendChild(this.countdown);
    card.appendChild(countdownWrap);

    card.appendChild(el('p', 'round-intro__hint', 'Inputs unlock on TUMBLE!'));
  }

  show(
    roundNumber: number,
    definition: RoundDefinition,
    seedLabel: string,
    phase: 'intro' | 'countdown',
    countdown: number,
  ): void {
    this.element.hidden = false;
    this.roundNumber.textContent = `ROUND ${roundNumber}`;
    this.roundName.textContent = definition.label;
    this.objective.textContent = definition.objective;
    this.starters.textContent = String(definition.starters);
    this.qualifiers.textContent = `TOP ${definition.qualifiers}`;
    this.seed.textContent = `SEED ${seedLabel}`;
    this.update(phase, countdown);
  }

  update(phase: 'intro' | 'countdown', countdown: number): void {
    const value =
      phase === 'intro'
        ? 'READY'
        : countdown <= 0.55
          ? 'TUMBLE!'
          : String(Math.max(1, Math.ceil(countdown - 0.5)));
    const label =
      phase === 'intro' ? 'THE SHOW IS ABOUT TO START' : countdown <= 0.55 ? 'GO!' : 'STARTING IN';
    const key = `${phase}:${value}`;
    if (key === this.lastCount) return;
    this.lastCount = key;
    this.countdown.textContent = value;
    this.countdown.classList.toggle('is-go', value === 'TUMBLE!');
    this.countdownLabel.textContent = label;
    this.lastPhase = phase;
    this.element.dataset.phase = this.lastPhase;
  }

  hide(): void {
    this.element.hidden = true;
  }

  dispose(): void {
    this.element.remove();
  }
}

export interface ResultsOptions {
  onContinue: () => void;
}

export interface RoundReward {
  qualified: boolean;
  kudos: number;
  bonus: number;
  crown: number;
  bestFinish: number | null;
  newBest: boolean;
}

/** Round results table. Human row highlighted, auto-advance countdown. */
export class ResultsOverlay {
  readonly element = el('section', 'results');
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly tableBody: HTMLElement;
  private readonly seed: HTMLElement;
  private readonly continueButton: HTMLButtonElement;
  private readonly countdown: HTMLElement;
  private readonly reward: HTMLElement;
  private lastSecond = -1;

  constructor(options: ResultsOptions) {
    this.element.hidden = true;
    this.element.setAttribute('aria-labelledby', 'results-title');

    const card = el('div', 'results__card');
    this.element.appendChild(card);
    card.appendChild(el('span', 'sticker sticker--mint', 'ROUND RESULTS'));

    this.title = el('h2', 'results__title', 'SUNRISE SCRAMBLE');
    this.title.id = 'results-title';
    card.appendChild(this.title);
    this.subtitle = el('p', 'results__subtitle', '');
    card.appendChild(this.subtitle);

    const head = el('div', 'results__row results__row--head');
    head.setAttribute('role', 'row');
    for (const [label, className] of [
      ['#', 'results__cell results__cell--place'],
      ['TUMBLER', 'results__cell results__cell--name'],
      ['STATUS', 'results__cell results__cell--status'],
      ['TIME / PROGRESS', 'results__cell results__cell--stat'],
    ] as const) {
      const cell = el('span', className, label);
      cell.setAttribute('role', 'columnheader');
      head.appendChild(cell);
    }
    card.appendChild(head);

    this.tableBody = el('div', 'results__body');
    this.tableBody.setAttribute('role', 'rowgroup');
    card.appendChild(this.tableBody);

    this.reward = el('div', 'results__reward');
    this.reward.setAttribute('role', 'status');
    card.appendChild(this.reward);

    const foot = el('div', 'results__foot');
    this.seed = el('span', 'results__seed', '');
    foot.appendChild(this.seed);
    this.countdown = el('span', 'results__countdown', '');
    foot.appendChild(this.countdown);
    this.continueButton = el('button', 'btn btn--primary', 'CONTINUE');
    this.continueButton.type = 'button';
    this.continueButton.addEventListener('click', options.onContinue);
    foot.appendChild(this.continueButton);
    card.appendChild(foot);
    card.appendChild(el('p', 'overlay-hint', 'Continues automatically, or press Enter'));
  }

  show(
    roundNumber: number,
    definition: RoundDefinition,
    placements: readonly RoundPlacement[],
    seedLabel: string,
    secondsLeft: number,
    reward?: RoundReward,
  ): void {
    this.element.hidden = false;
    this.title.textContent = definition.label;
    this.subtitle.textContent = `ROUND ${roundNumber} · TOP ${definition.qualifiers} QUALIFY`;
    this.seed.textContent = `SEED ${seedLabel}`;
    this.reward.replaceChildren();
    if (reward) {
      this.reward.hidden = false;
      if (reward.qualified) {
        this.reward.appendChild(el('strong', 'results__reward-value', `+${reward.kudos} KUDOS`));
        if (reward.bonus > 0) {
          this.reward.appendChild(el('span', 'results__reward-bonus', `FIRST QUALIFY +${reward.bonus}`));
        }
        if (reward.crown > 0) {
          this.reward.appendChild(
            el(
              'span',
              'results__reward-crown',
              `+${reward.crown} CROWN${reward.crown === 1 ? '' : 'S'}`,
            ),
          );
        }
        this.reward.appendChild(
          el(
            'span',
            'results__reward-best',
            reward.newBest ? 'NEW CAREER BEST!' : `CAREER BEST #${reward.bestFinish ?? '—'}`,
          ),
        );
      } else {
        this.reward.appendChild(el('strong', 'results__reward-value', 'NO KUDOS'));
        this.reward.appendChild(
          el('span', 'results__reward-best', 'You did not qualify — the Show ends here.'),
        );
      }
    } else {
      this.reward.hidden = true;
    }
    this.tableBody.replaceChildren();
    for (const entry of placements) {
      const row = el('div', `results__row${entry.isPlayer ? ' is-player' : ''}`);
      row.setAttribute('role', 'row');
      const place = el('span', 'results__cell results__cell--place', String(entry.placement));
      place.setAttribute('role', 'cell');
      row.appendChild(place);
      const name = el('span', 'results__cell results__cell--name');
      name.setAttribute('role', 'cell');
      name.appendChild(el('span', 'results__name', entry.name));
      if (entry.isPlayer) name.appendChild(el('span', 'results__you', 'YOU'));
      row.appendChild(name);
      const status = el(
        'span',
        `results__cell results__cell--status ${entry.qualified ? 'is-qualified' : 'is-eliminated'}${entry.won ? ' is-crowned' : ''}`,
      );
      status.setAttribute('role', 'cell');
      status.textContent = entry.won ? 'CROWNED' : entry.qualified ? 'QUALIFIED' : 'ELIMINATED';
      row.appendChild(status);
      const stat = el('span', 'results__cell results__cell--stat');
      stat.setAttribute('role', 'cell');
      stat.textContent = resultStat(definition, entry);
      row.appendChild(stat);
      this.tableBody.appendChild(row);
    }
    this.update(secondsLeft);
    this.continueButton.focus({ preventScroll: true });
  }

  update(secondsLeft: number): void {
    const second = Math.max(0, Math.ceil(secondsLeft));
    if (second === this.lastSecond) return;
    this.lastSecond = second;
    this.countdown.textContent = `NEXT IN ${second}`;
    if (second === 0) this.countdown.textContent = 'READY';
  }

  hide(): void {
    this.element.hidden = true;
  }

  dispose(): void {
    this.element.remove();
  }
}

function resultStat(definition: RoundDefinition, entry: RoundPlacement): string {
  if (entry.finishTime !== null) return formatTime(entry.finishTime);
  if (definition.mode === 'hexapop') return `${entry.height.toFixed(1)} u high`;
  if (definition.mode === 'crown-climb') return `${entry.height.toFixed(1)} u`;
  return `${Math.round(entry.progress * 100)}% course`;
}

export interface ShowEndOptions {
  onReplay: () => void;
  onMenu: () => void;
}

/** Victory crown ceremony and the defeat screen share one accessible shell. */
export class ShowEndOverlay {
  readonly element = el('section', 'show-end');
  private readonly card: HTMLElement;
  private readonly sticker: HTMLElement;
  private readonly title: HTMLElement;
  private readonly winner: HTMLElement;
  private readonly copy: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly replayButton: HTMLButtonElement;
  private readonly menuButton: HTMLButtonElement;
  private readonly career: HTMLElement;

  constructor(options: ShowEndOptions) {
    this.element.hidden = true;
    this.element.setAttribute('aria-labelledby', 'show-end-title');

    this.card = el('div', 'show-end__card');
    this.element.appendChild(this.card);

    const rays = el('div', 'show-end__rays');
    rays.setAttribute('aria-hidden', 'true');
    this.card.appendChild(rays);

    const crown = el('div', 'show-end__crown');
    crown.setAttribute('aria-hidden', 'true');
    crown.appendChild(el('span', 'show-end__crown-base'));
    for (let i = 0; i < 5; i += 1) {
      const spike = el('span', 'show-end__crown-spike');
      spike.style.setProperty('--i', String(i));
      crown.appendChild(spike);
    }
    this.card.appendChild(crown);

    this.sticker = el('span', 'sticker sticker--mango', 'CROWN CEREMONY');
    this.card.appendChild(this.sticker);
    this.title = el('h2', 'show-end__title', 'CROWNED!');
    this.title.id = 'show-end-title';
    this.card.appendChild(this.title);
    this.winner = el('p', 'show-end__winner', '');
    this.card.appendChild(this.winner);
    this.copy = el('p', 'show-end__copy', '');
    this.card.appendChild(this.copy);
    this.stats = el('div', 'show-end__stats');
    this.card.appendChild(this.stats);
    this.career = el('p', 'show-end__profile');
    this.card.appendChild(this.career);

    const actions = el('div', 'show-end__actions');
    this.replayButton = el('button', 'btn btn--primary', 'PLAY AGAIN');
    this.replayButton.type = 'button';
    this.replayButton.addEventListener('click', options.onReplay);
    actions.appendChild(this.replayButton);
    this.menuButton = el('button', 'btn btn--ghost', 'MAIN MENU');
    this.menuButton.type = 'button';
    this.menuButton.addEventListener('click', options.onMenu);
    actions.appendChild(this.menuButton);
    this.card.appendChild(actions);
    this.card.appendChild(el('p', 'overlay-hint', 'Enter replays · Esc returns to the menu'));
  }

  show(
    result: ShowResult,
    profile: Profile,
    summary: { kudos: number; crowns: number; newBest: boolean },
  ): void {
    const won = result.won;
    // A crown can only be claimed when the Show actually reached Crown Climb.
    // Losing Round 1 or 2 means the pack moves on, not that a bot was crowned.
    const crownEnding = result.finalRoundMode === 'crown-climb';
    this.card.classList.toggle('is-victory', won);
    this.card.classList.toggle('is-defeat', !won);
    this.sticker.textContent = won ? 'CROWN CEREMONY' : crownEnding ? 'CROWN MISSED' : 'SHOW OVER';
    this.sticker.className = `sticker sticker--${won ? 'mango' : 'coral'}`;
    this.title.textContent = won ? 'CROWNED!' : 'ELIMINATED';
    this.winner.textContent = won
      ? `${profile.name} takes the crown!`
      : crownEnding
        ? `${result.winnerName} takes the crown.`
        : `${result.winnerName} leads the pack.`;
    this.copy.textContent = won
      ? 'Sixteen Tumblers entered. You are the one with the crown and the confetti in your hair.'
      : crownEnding
        ? `You placed #${result.playerPlacement}. The crown stays on the dais.`
        : `You placed #${result.playerPlacement}. The pack moves on without you.`;
    this.replayButton.textContent = won ? 'PLAY AGAIN' : 'TRY AGAIN';
    this.stats.replaceChildren();
    for (const [label, value] of [
      ['PLACEMENT', `#${result.playerPlacement}`],
      ['ROUNDS QUALIFIED', `${result.roundsQualified} / 3`],
      ['SHOW TIME', formatTime(result.totalTime)],
      ['BEST FINISH', summary.newBest ? 'NEW #' + String(profile.bestFinish ?? result.playerPlacement) : `#${profile.bestFinish ?? '—'}`],
      ['KUDOS EARNED', `+${summary.kudos}`],
      ['CROWNS', `${profile.crowns}`],
    ] as const) {
      const stat = el('div', 'show-end__stat');
      stat.appendChild(el('span', 'show-end__stat-label', label));
      stat.appendChild(el('strong', 'show-end__stat-value', value));
      this.stats.appendChild(stat);
    }
    this.career.textContent = `${profile.name} · ${profile.wins} wins · ${profile.qualifications} qualifications · ${profile.kudos} kudos · seed ${result.seedLabel}`;
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

/** Small legacy overlay for Practice and debug free-play. */
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
