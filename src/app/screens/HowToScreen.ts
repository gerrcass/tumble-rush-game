import { el } from '../dom';

export interface HowToScreenOptions {
  onBack: () => void;
}

const ROUNDS: ReadonlyArray<readonly [string, string, string, string, string]> = [
  [
    '01',
    'SUNRISE SCRAMBLE',
    'Race',
    'Top 8 of 16 qualify',
    'Sprint through five candy sections. Jump the hurdles, time the sweepers, dive the wide gaps and be through the Finish Gate before the clock runs out.',
  ],
  [
    '02',
    'HEXAPOP',
    'Survive',
    'Top 4 of 8 qualify',
    'Every tile you touch starts a short warning and drops. Keep moving, read the cracks, and outlast the Sugar Rush as the arena collapses from the outside in.',
  ],
  [
    '03',
    'CROWN CLIMB',
    'Final',
    'One winner',
    'Climb the spiral before the rising slime catches you. First Tumbler to touch the crown takes it. If the clock runs out, the highest Tumbler wins.',
  ],
];

const CONTROLS: ReadonlyArray<readonly [string, string, string]> = [
  ['WASD / ARROWS', 'MOVE', 'Left stick on touch'],
  ['SPACE', 'JUMP', 'JUMP button'],
  ['SHIFT / RIGHT CLICK', 'DIVE', 'DIVE button'],
  ['E / LEFT CLICK', 'GRAB & SHOVE', 'GRAB button'],
  ['Q', 'EMOTE', 'EMOTE button'],
  ['ESC', 'PAUSE', 'Pause button'],
];

/** Static but complete: controls, the three Rounds, the economy, and tips. */
export class HowToScreen {
  readonly element = el('section', 'screen howto-screen');
  private readonly backButton: HTMLButtonElement;

  constructor(options: HowToScreenOptions) {
    this.element.hidden = true;
    this.element.setAttribute('aria-labelledby', 'howto-title');

    const shell = el('div', 'screen-shell howto-shell');
    this.element.appendChild(shell);

    const top = el('header', 'screen-top');
    this.backButton = el('button', 'btn btn--tiny screen-back', '← BACK');
    this.backButton.type = 'button';
    this.backButton.addEventListener('click', options.onBack);
    top.appendChild(this.backButton);
    const titleWrap = el('div', 'screen-title-wrap');
    titleWrap.appendChild(el('span', 'sticker sticker--coral', 'READ THE ROOM'));
    const title = el('h1', 'screen-title', 'HOW TO PLAY');
    title.id = 'howto-title';
    titleWrap.appendChild(title);
    top.appendChild(titleWrap);
    shell.appendChild(top);

    const intro = el('div', 'howto-intro');
    intro.appendChild(
      el(
        'p',
        'howto-lead',
        'Sixteen Tumblers. Three Rounds. One crown. Qualify in the Course, survive Hexapop, then win the climb. If you fall, you spectate the rest of the Round — and the Show is over when you do not qualify.',
      ),
    );
    const economy = el('div', 'howto-economy');
    for (const [label, value, copy] of [
      ['QUALIFY', '+25', 'kudos every Round you qualify'],
      ['FIRST QUALIFY', '+50', 'bonus, once per Show'],
      ['CROWN', '+1', 'and +100 kudos for the win'],
    ] as const) {
      const block = el('div', 'howto-money');
      block.appendChild(el('span', 'howto-money__label', label));
      block.appendChild(el('strong', 'howto-money__value', value));
      block.appendChild(el('span', 'howto-money__copy', copy));
      economy.appendChild(block);
    }
    intro.appendChild(economy);
    shell.appendChild(intro);

    const rounds = el('div', 'howto-rounds');
    for (const [number, name, tag, qualifiers, copy] of ROUNDS) {
      const card = el('article', 'howto-round');
      const head = el('div', 'howto-round__head');
      head.appendChild(el('span', 'howto-round__number', number));
      const names = el('div', 'howto-round__names');
      names.appendChild(el('h2', 'howto-round__title', name));
      names.appendChild(el('span', 'howto-round__tag', tag));
      head.appendChild(names);
      card.appendChild(head);
      card.appendChild(el('span', 'chip chip--mint howto-round__qual', qualifiers));
      card.appendChild(el('p', 'howto-round__copy', copy));
      rounds.appendChild(card);
    }
    shell.appendChild(rounds);

    const lower = el('div', 'howto-lower');
    const controls = el('section', 'howto-panel');
    controls.appendChild(el('h2', 'howto-panel__title', 'CONTROLS'));
    const table = el('div', 'howto-controls');
    for (const [keys, action, touch] of CONTROLS) {
      const row = el('div', 'howto-controls__row');
      row.appendChild(el('kbd', 'keycap keycap--small', keys));
      row.appendChild(el('strong', '', action));
      row.appendChild(el('span', '', touch));
      table.appendChild(row);
    }
    controls.appendChild(table);
    lower.appendChild(controls);

    const tips = el('section', 'howto-panel howto-panel--tips');
    tips.appendChild(el('h2', 'howto-panel__title', 'SHOW TIPS'));
    const list = el('ul', 'howto-tips');
    for (const tip of [
      'Camera drag is free. The show auto-follows, but you can always look around.',
      'Dives cross gaps and shove rivals. A dive into nothing is still very funny.',
      'In Hexapop, never stand still — the tile under you is already on a timer.',
      'In Crown Climb, keep an eye on the slime line. Height is also the timeout tie-break.',
      'Kudos go to the Customize tent: colors, patterns, hats and emotes.',
    ]) {
      list.appendChild(el('li', '', tip));
    }
    tips.appendChild(list);
    lower.appendChild(tips);
    shell.appendChild(lower);

    const footer = el('div', 'howto-footer');
    const back = el('button', 'btn btn--primary', 'GOT IT — BACK TO MENU');
    back.type = 'button';
    back.addEventListener('click', options.onBack);
    footer.appendChild(back);
    footer.appendChild(el('span', 'screen-hint', 'Esc also returns to the menu.'));
    shell.appendChild(footer);
  }

  show(): void {
    this.element.hidden = false;
    requestAnimationFrame(() => this.backButton.focus({ preventScroll: true }));
  }

  hide(): void {
    this.element.hidden = true;
  }

  dispose(): void {
    this.element.remove();
  }
}
