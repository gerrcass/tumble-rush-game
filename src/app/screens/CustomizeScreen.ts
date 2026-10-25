import { el } from '../dom';
import {
  cosmeticCatalogue,
  cosmeticItem,
  cosmeticKey,
  cosmeticName,
  colorFor,
  emoteFor,
  type BeanLook,
  type CosmeticKind,
} from '../../game/cosmetics';
import {
  equipCosmetic,
  isUnlocked,
  purchaseCosmetic,
  randomizeLook,
  resetLook,
  sanitizeName,
  type Profile,
} from '../../game/profile';
import { Rng } from '../../game/Rng';
import { BeanPreview } from './BeanPreview';

export interface CustomizeScreenOptions {
  onBack: () => void;
  onChange: (profile: Profile, notice?: string) => void;
  onNotice: (message: string) => void;
}

const TABS: ReadonlyArray<readonly [CosmeticKind, string]> = [
  ['color', 'COLOR'],
  ['pattern', 'PATTERN'],
  ['hat', 'HAT'],
  ['emote', 'EMOTE'],
];

const HAT_GLYPHS: Readonly<Record<string, string>> = {
  none: '∅',
  propeller: '✿',
  crown: '♛',
  antenna: '✦',
  ducky: '◒',
  cone: '▲',
  halo: '◯',
  flower: '❀',
};

const EMOTE_GLYPHS: Readonly<Record<string, string>> = {
  wave: '👋',
  flex: '💪',
  facepalm: '🤦',
  dance: '🕺',
};

export class CustomizeScreen {
  readonly element = el('section', 'screen customize-screen');
  private readonly previewHost = el('div', 'bean-preview');
  private readonly grid = el('div', 'swatch-grid');
  private readonly tabs = new Map<CosmeticKind, HTMLButtonElement>();
  private readonly nameInput: HTMLInputElement;
  private readonly backButton: HTMLButtonElement;
  private readonly kudosLabel: HTMLElement;
  private readonly optionsRef: CustomizeScreenOptions;
  private profile: Profile;
  private preview: BeanPreview | null = null;
  private tab: CosmeticKind = 'color';

  constructor(options: CustomizeScreenOptions, profile: Profile) {
    this.optionsRef = options;
    this.profile = profile;
    this.element.hidden = true;
    this.element.setAttribute('aria-labelledby', 'customize-title');

    const shell = el('div', 'screen-shell customize-shell');
    this.element.appendChild(shell);

    const top = el('header', 'screen-top');
    this.backButton = el('button', 'btn btn--tiny screen-back', '← BACK');
    this.backButton.type = 'button';
    this.backButton.addEventListener('click', options.onBack);
    top.appendChild(this.backButton);
    const titleWrap = el('div', 'screen-title-wrap');
    titleWrap.appendChild(el('span', 'sticker sticker--mango', 'YOUR TUMBLER'));
    const title = el('h1', 'screen-title', 'CUSTOMIZE');
    title.id = 'customize-title';
    titleWrap.appendChild(title);
    top.appendChild(titleWrap);
    const wallet = el('div', 'screen-wallet');
    wallet.appendChild(el('span', 'screen-wallet__icon', '✦'));
    this.kudosLabel = el('strong', 'screen-wallet__value', '0');
    wallet.appendChild(this.kudosLabel);
    wallet.appendChild(el('span', 'screen-wallet__unit', 'KUDOS'));
    top.appendChild(wallet);
    shell.appendChild(top);

    const body = el('div', 'customize-body');
    shell.appendChild(body);

    const left = el('div', 'customize-preview');
    left.appendChild(this.previewHost);
    const previewMeta = el('div', 'customize-preview__meta');
    previewMeta.appendChild(el('span', 'customize-preview__label', 'LIVE PREVIEW'));
    previewMeta.appendChild(el('span', 'customize-preview__hint', 'This is exactly who runs the show.'));
    left.appendChild(previewMeta);

    const nameRow = el('label', 'name-edit');
    nameRow.appendChild(el('span', 'name-edit__label', 'TUMBLER NAME'));
    this.nameInput = el('input', 'name-edit__input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = 16;
    this.nameInput.autocomplete = 'off';
    this.nameInput.spellcheck = false;
    this.nameInput.setAttribute('aria-describedby', 'name-edit-hint');
    this.nameInput.addEventListener('change', () => this.commitName());
    this.nameInput.addEventListener('blur', () => this.commitName());
    nameRow.appendChild(this.nameInput);
    const nameHint = el('span', 'name-edit__hint', '1–16 letters, numbers, spaces or ! . -');
    nameHint.id = 'name-edit-hint';
    nameRow.appendChild(nameHint);
    left.appendChild(nameRow);
    body.appendChild(left);

    const right = el('div', 'customize-options');
    const tabList = el('div', 'tab-list');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Cosmetic categories');
    for (const [kind, label] of TABS) {
      const button = el('button', 'tab');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.dataset.tab = kind;
      button.textContent = label;
      button.addEventListener('click', () => this.setTab(kind));
      tabList.appendChild(button);
      this.tabs.set(kind, button);
    }
    right.appendChild(tabList);
    right.appendChild(this.grid);

    const actions = el('div', 'customize-actions');
    const randomize = el('button', 'btn btn--ghost', 'RANDOMIZE');
    randomize.type = 'button';
    randomize.addEventListener('click', () => {
      randomizeLook(this.profile, new Rng((Date.now() ^ 0x5eed) >>> 0));
      this.sync(this.optionsRef, 'A fresh look, zero kudos spent.');
    });
    actions.appendChild(randomize);
    const reset = el('button', 'btn btn--ghost', 'RESET LOOK');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      resetLook(this.profile);
      this.sync(this.optionsRef, 'Back to the starter look.');
    });
    actions.appendChild(reset);
    right.appendChild(actions);
    body.appendChild(right);

    const footer = el('p', 'screen-hint');
    footer.textContent =
      'Equipping is free. Locked items spend kudos the moment you unlock them.';
    shell.appendChild(footer);

    this.setProfile(profile);
  }

  setProfile(profile: Profile): void {
    this.profile = profile;
    this.kudosLabel.textContent = String(profile.kudos);
    if (document.activeElement !== this.nameInput) this.nameInput.value = profile.name;
    this.renderGrid();
    this.preview?.setLook(profile.look);
  }

  show(profile: Profile): void {
    this.setProfile(profile);
    this.element.hidden = false;
    if (!this.preview) {
      this.preview = new BeanPreview(this.previewHost);
      this.preview.setLook(profile.look);
    }
    this.setTab(this.tab);
    requestAnimationFrame(() => this.backButton.focus({ preventScroll: true }));
  }

  hide(): void {
    this.element.hidden = true;
    this.preview?.dispose();
    this.preview = null;
  }

  dispose(): void {
    this.hide();
    this.element.remove();
  }

  private setTab(kind: CosmeticKind): void {
    this.tab = kind;
    for (const [candidate, button] of this.tabs) {
      const active = candidate === kind;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    this.renderGrid();
  }

  private renderGrid(): void {
    this.grid.replaceChildren();
    const look = this.profile.look;
    for (const item of cosmeticCatalogue(this.tab)) {
      const owned = isUnlocked(this.profile, this.tab, item.id);
      const equipped = lookValue(look, this.tab) === item.id;
      const button = el(
        'button',
        `swatch${equipped ? ' is-equipped' : ''}${owned ? '' : ' is-locked'}`,
      );
      button.type = 'button';
      button.dataset.cosmetic = `${this.tab}:${item.id}`;
      button.setAttribute('aria-pressed', String(equipped));
      const label = owned
        ? `${item.name}${equipped ? ', equipped' : ''}`
        : `${item.name}, locked, ${item.cost} kudos`;
      button.setAttribute('aria-label', label);
      const art = el('span', 'swatch__art');
      art.dataset.kind = this.tab;
      art.dataset.id = item.id;
      if (this.tab === 'color') {
        art.style.setProperty('--swatch', colorFor(item.id as BeanLook['colorId']).hex);
      } else if (this.tab === 'pattern') {
        art.dataset.pattern = item.id;
      } else if (this.tab === 'hat') {
        art.textContent = HAT_GLYPHS[item.id] ?? '?';
      } else {
        art.textContent = EMOTE_GLYPHS[item.id] ?? '✦';
        art.title = emoteFor(item.id as BeanLook['emoteId']).name;
      }
      button.appendChild(art);
      button.appendChild(el('span', 'swatch__name', item.name));
      const status = el(
        'span',
        `swatch__status${owned ? ' is-owned' : ''}`,
        owned ? (equipped ? 'EQUIPPED' : 'EQUIP') : `✦ ${item.cost}`,
      );
      button.appendChild(status);
      if (!owned) button.appendChild(el('span', 'swatch__lock', 'LOCKED'));
      button.addEventListener('click', () => this.choose(item.id));
      this.grid.appendChild(button);
    }
  }

  private choose(id: string): void {
    const kind = this.tab;
    const owned = isUnlocked(this.profile, kind, id);
    if (!owned) {
      const result = purchaseCosmetic(this.profile, kind, id);
      if (!result.ok) {
        const item = cosmeticItem(kind, id);
        this.optionsRef.onNotice(
          result.reason === 'kudos'
            ? `Need ${result.cost - this.profile.kudos} more kudos for ${item?.name ?? 'that'}.`
            : 'That item is not in the catalogue.',
        );
        return;
      }
      equipCosmetic(this.profile, kind, id);
      this.sync(this.optionsRef, `Unlocked ${cosmeticName(kind, id)}!`);
      return;
    }
    equipCosmetic(this.profile, kind, id);
    this.sync(this.optionsRef);
  }

  private commitName(): void {
    const value = sanitizeName(this.nameInput.value);
    this.nameInput.value = value;
    if (this.profile.name === value) return;
    this.profile.name = value;
    this.sync(this.optionsRef);
  }

  private sync(options: CustomizeScreenOptions, notice?: string): void {
    this.kudosLabel.textContent = String(this.profile.kudos);
    this.renderGrid();
    this.preview?.setLook(this.profile.look);
    options.onChange(this.profile, notice);
  }
}

function lookValue(look: BeanLook, kind: CosmeticKind): string {
  switch (kind) {
    case 'color':
      return look.colorId;
    case 'pattern':
      return look.patternId;
    case 'hat':
      return look.hatId;
    case 'emote':
      return look.emoteId;
  }
}

export function cosmeticSwatchLabel(kind: CosmeticKind, id: string): string {
  return `${cosmeticKey(kind, id)} ${cosmeticName(kind, id)}`;
}
