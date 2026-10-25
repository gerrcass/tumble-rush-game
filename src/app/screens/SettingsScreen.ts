import { el } from '../dom';
import type { Profile, QualitySetting, TouchSetting } from '../../game/profile';

export interface SettingsScreenOptions {
  onBack: () => void;
  onChange: (profile: Profile) => void;
  onReset: () => Profile;
  onNotice: (message: string) => void;
}

const QUALITY: ReadonlyArray<readonly [QualitySetting, string, string]> = [
  ['auto', 'AUTO', 'Matches the device'],
  ['high', 'HIGH', 'Shadows and outlines'],
  ['low', 'LOW', 'Fastest on phones'],
];

const TOUCH: ReadonlyArray<readonly [TouchSetting, string]> = [
  ['auto', 'AUTO'],
  ['on', 'ON'],
  ['off', 'OFF'],
];

export class SettingsScreen {
  readonly element = el('section', 'screen settings-screen');
  private readonly music: HTMLInputElement;
  private readonly sfx: HTMLInputElement;
  private readonly musicValue: HTMLElement;
  private readonly sfxValue: HTMLElement;
  private readonly sensitivity: HTMLInputElement;
  private readonly sensitivityValue: HTMLElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly motionButton: HTMLButtonElement;
  private readonly tagsButton: HTMLButtonElement;
  private readonly invertButton: HTMLButtonElement;
  private readonly qualityButtons = new Map<QualitySetting, HTMLButtonElement>();
  private readonly touchButtons = new Map<TouchSetting, HTMLButtonElement>();
  private readonly resetButton: HTMLButtonElement;
  private readonly confirmPanel: HTMLElement;
  private readonly confirmReset: HTMLButtonElement;
  private readonly cancelReset: HTMLButtonElement;
  private readonly backButton: HTMLButtonElement;
  private readonly audioBadge: HTMLElement;
  private readonly optionsRef: SettingsScreenOptions;
  private profile: Profile;
  private confirming = false;

  constructor(options: SettingsScreenOptions, profile: Profile) {
    this.optionsRef = options;
    this.profile = profile;
    this.element.hidden = true;
    this.element.setAttribute('aria-labelledby', 'settings-title');

    const shell = el('div', 'screen-shell settings-shell');
    this.element.appendChild(shell);

    const top = el('header', 'screen-top');
    this.backButton = el('button', 'btn btn--tiny screen-back', '← BACK');
    this.backButton.type = 'button';
    this.backButton.addEventListener('click', options.onBack);
    top.appendChild(this.backButton);
    const titleWrap = el('div', 'screen-title-wrap');
    titleWrap.appendChild(el('span', 'sticker sticker--mint', 'TUNE THE SHOW'));
    const title = el('h1', 'screen-title', 'SETTINGS');
    title.id = 'settings-title';
    titleWrap.appendChild(title);
    top.appendChild(titleWrap);
    top.appendChild(el('span', 'settings-saved', 'CHANGES SAVE INSTANTLY'));
    shell.appendChild(top);

    const body = el('div', 'settings-body');
    shell.appendChild(body);

    // Sound ---------------------------------------------------------------
    const sound = this.card(
      body,
      'SOUND',
      'Live procedural music and effects, generated in your browser. No files, no downloads.',
      'music',
    );
    this.audioBadge = el('span', 'settings-audio-badge', 'AUDIO STARTS ON YOUR FIRST TAP');
    sound.appendChild(this.audioBadge);
    const soundGrid = el('div', 'settings-sliders');
    this.music = this.slider(
      soundGrid,
      'music',
      'MUSIC',
      (value) => {
        this.profile.settings.musicVolume = value / 100;
        this.musicValue.textContent = `${value}%`;
        this.persist();
      },
    );
    this.musicValue = soundGrid.lastElementChild?.querySelector('.slider__value') as HTMLElement;
    this.sfx = this.slider(
      soundGrid,
      'sfx',
      'EFFECTS',
      (value) => {
        this.profile.settings.sfxVolume = value / 100;
        this.sfxValue.textContent = `${value}%`;
        this.persist();
      },
    );
    this.sfxValue = soundGrid.lastElementChild?.querySelector('.slider__value') as HTMLElement;
    sound.appendChild(soundGrid);
    this.muteButton = this.toggle(sound, 'MUTE ALL SOUND', () => {
      this.profile.settings.muted = !this.profile.settings.muted;
      this.sync();
      this.persist();
    });

    // Presentation --------------------------------------------------------
    const presentation = this.card(
      body,
      'PRESENTATION',
      'Quality and motion apply immediately; reduced motion also removes camera shake.',
      'presentation',
    );
    const qualityRow = el('div', 'segmented');
    qualityRow.setAttribute('role', 'group');
    qualityRow.setAttribute('aria-label', 'Graphics quality');
    for (const [id, label, detail] of QUALITY) {
      const button = el('button', 'segment');
      button.type = 'button';
      button.dataset.quality = id;
      button.appendChild(el('strong', '', label));
      button.appendChild(el('span', '', detail));
      button.addEventListener('click', () => {
        this.profile.settings.quality = id;
        this.sync();
        this.persist();
      });
      qualityRow.appendChild(button);
      this.qualityButtons.set(id, button);
    }
    presentation.appendChild(qualityRow);
    this.motionButton = this.toggle(presentation, 'REDUCED MOTION', () => {
      this.profile.settings.reducedMotion = !this.profile.settings.reducedMotion;
      this.sync();
      this.persist();
    });
    this.tagsButton = this.toggle(presentation, 'NAME TAGS', () => {
      this.profile.settings.nameTags = !this.profile.settings.nameTags;
      this.sync();
      this.persist();
    });

    // Camera and touch ----------------------------------------------------
    const controls = this.card(
      body,
      'CAMERA & TOUCH',
      'Sensitivity and invert apply to drag, gamepad and touch look controls.',
      'camera',
    );
    const cameraGrid = el('div', 'settings-sliders');
    this.sensitivity = this.slider(
      cameraGrid,
      'sensitivity',
      'CAMERA SENSITIVITY',
      (value) => {
        this.profile.settings.cameraSensitivity = value / 100;
        this.sensitivityValue.textContent = `${value}%`;
        this.persist();
      },
      { min: 50, max: 160, step: 5, initial: 100 },
    );
    this.sensitivityValue = cameraGrid.lastElementChild?.querySelector('.slider__value') as HTMLElement;
    controls.appendChild(cameraGrid);
    this.invertButton = this.toggle(controls, 'INVERT LOOK Y', () => {
      this.profile.settings.invertY = !this.profile.settings.invertY;
      this.sync();
      this.persist();
    });
    const touchHead = el('div', 'settings-row-label', 'TOUCH CONTROLS');
    controls.appendChild(touchHead);
    const touchRow = el('div', 'segmented segmented--compact');
    touchRow.setAttribute('role', 'group');
    touchRow.setAttribute('aria-label', 'Touch controls visibility');
    for (const [id, label] of TOUCH) {
      const button = el('button', 'segment segment--compact', label);
      button.type = 'button';
      button.dataset.touch = id;
      button.addEventListener('click', () => {
        this.profile.settings.touchControls = id;
        this.sync();
        this.persist();
      });
      touchRow.appendChild(button);
      this.touchButtons.set(id, button);
    }
    controls.appendChild(touchRow);

    // Reset ---------------------------------------------------------------
    const danger = this.card(
      body,
      'PROFILE',
      'Reset clears your name, look, crowns, kudos, stats and settings on this browser.',
      'profile',
    );
    this.resetButton = el('button', 'btn btn--danger', 'RESET PROFILE');
    this.resetButton.type = 'button';
    this.resetButton.addEventListener('click', () => {
      this.confirming = true;
      this.sync();
    });
    danger.appendChild(this.resetButton);
    this.confirmPanel = el('div', 'reset-confirm');
    this.confirmPanel.hidden = true;
    this.confirmPanel.setAttribute('role', 'alertdialog');
    this.confirmPanel.setAttribute('aria-label', 'Confirm profile reset');
    this.confirmPanel.appendChild(
      el('p', '', 'Start over? This cannot be undone.'),
    );
    const confirmRow = el('div', 'reset-confirm__actions');
    this.confirmReset = el('button', 'btn btn--danger', 'YES, RESET EVERYTHING');
    this.confirmReset.type = 'button';
    this.confirmReset.addEventListener('click', () => {
      this.profile = options.onReset();
      this.confirming = false;
      this.sync();
      options.onNotice('Profile reset. Fresh bean, fresh slate.');
      this.backButton.focus({ preventScroll: true });
    });
    this.cancelReset = el('button', 'btn btn--ghost', 'KEEP MY PROFILE');
    this.cancelReset.type = 'button';
    this.cancelReset.addEventListener('click', () => {
      this.confirming = false;
      this.sync();
      this.resetButton.focus({ preventScroll: true });
    });
    confirmRow.appendChild(this.confirmReset);
    confirmRow.appendChild(this.cancelReset);
    this.confirmPanel.appendChild(confirmRow);
    danger.appendChild(this.confirmPanel);

    const hint = el('p', 'screen-hint');
    hint.textContent = 'Settings are stored only in this browser. Esc goes back.';
    shell.appendChild(hint);

    this.setProfile(profile);
  }

  setProfile(profile: Profile): void {
    this.profile = profile;
    this.sync();
  }

  /** Reflect whether the Web Audio context has been unlocked by a gesture. */
  setAudioLive(started: boolean): void {
    this.audioBadge.textContent = started ? 'AUDIO LIVE · GENERATED IN YOUR BROWSER' : 'AUDIO STARTS ON YOUR FIRST TAP';
    this.audioBadge.classList.toggle('is-live', started);
  }

  show(profile: Profile): void {
    this.setProfile(profile);
    this.element.hidden = false;
    this.confirming = false;
    this.sync();
    requestAnimationFrame(() => this.backButton.focus({ preventScroll: true }));
  }

  hide(): void {
    this.element.hidden = true;
    this.confirming = false;
    this.sync();
  }

  dispose(): void {
    this.element.remove();
  }

  private sync(): void {
    const settings = this.profile.settings;
    if (document.activeElement !== this.music) this.music.value = String(Math.round(settings.musicVolume * 100));
    if (document.activeElement !== this.sfx) this.sfx.value = String(Math.round(settings.sfxVolume * 100));
    this.musicValue.textContent = `${Math.round(settings.musicVolume * 100)}%`;
    this.sfxValue.textContent = `${Math.round(settings.sfxVolume * 100)}%`;
    this.muteButton.textContent = settings.muted ? 'SOUND MUTED' : 'MUTE ALL SOUND';
    this.muteButton.setAttribute('aria-pressed', String(settings.muted));
    this.muteButton.classList.toggle('is-on', settings.muted);
    this.motionButton.textContent = settings.reducedMotion ? 'REDUCED MOTION ON' : 'REDUCED MOTION';
    this.motionButton.setAttribute('aria-pressed', String(settings.reducedMotion));
    this.motionButton.classList.toggle('is-on', settings.reducedMotion);
    this.tagsButton.textContent = settings.nameTags ? 'NAME TAGS ON' : 'NAME TAGS OFF';
    this.tagsButton.setAttribute('aria-pressed', String(settings.nameTags));
    this.tagsButton.classList.toggle('is-on', settings.nameTags);
    this.invertButton.textContent = settings.invertY ? 'INVERT LOOK Y ON' : 'INVERT LOOK Y';
    this.invertButton.setAttribute('aria-pressed', String(settings.invertY));
    this.invertButton.classList.toggle('is-on', settings.invertY);
    if (document.activeElement !== this.sensitivity) {
      this.sensitivity.value = String(Math.round(settings.cameraSensitivity * 100));
    }
    this.sensitivityValue.textContent = `${Math.round(settings.cameraSensitivity * 100)}%`;
    for (const [id, button] of this.qualityButtons) {
      const active = settings.quality === id;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const [id, button] of this.touchButtons) {
      const active = settings.touchControls === id;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
    this.resetButton.hidden = this.confirming;
    this.confirmPanel.hidden = !this.confirming;
    if (this.confirming) requestAnimationFrame(() => this.cancelReset.focus({ preventScroll: true }));
  }

  private persist(): void {
    this.optionsRef.onChange(this.profile);
  }

  private card(
    parent: HTMLElement,
    title: string,
    copy: string,
    id: string,
  ): HTMLElement {
    const card = el('section', 'settings-card');
    card.id = `settings-${id}`;
    card.setAttribute('aria-labelledby', `settings-${id}-title`);
    const head = el('div', 'settings-card__head');
    const titleEl = el('h2', 'settings-card__title', title);
    titleEl.id = `settings-${id}-title`;
    head.appendChild(titleEl);
    card.appendChild(head);
    card.appendChild(el('p', 'settings-card__copy', copy));
    parent.appendChild(card);
    return card;
  }

  private toggle(parent: HTMLElement, label: string, action: () => void): HTMLButtonElement {
    const button = el('button', 'settings-toggle', label);
    button.type = 'button';
    button.addEventListener('click', action);
    parent.appendChild(button);
    return button;
  }

  private slider(
    parent: HTMLElement,
    id: string,
    label: string,
    onInput: (value: number) => void,
    options: { min?: number; max?: number; step?: number; initial?: number } = {},
  ): HTMLInputElement {
    const row = el('label', 'slider');
    row.setAttribute('for', `setting-${id}`);
    const head = el('span', 'slider__head');
    head.appendChild(el('span', 'slider__label', label));
    const value = el('output', 'slider__value', '0%');
    value.setAttribute('for', `setting-${id}`);
    head.appendChild(value);
    row.appendChild(head);
    const input = el('input', 'slider__input');
    input.type = 'range';
    input.id = `setting-${id}`;
    input.min = String(options.min ?? 0);
    input.max = String(options.max ?? 100);
    input.step = String(options.step ?? 1);
    input.value = String(options.initial ?? 60);
    input.addEventListener('input', () => onInput(Number(input.value)));
    row.appendChild(input);
    parent.appendChild(row);
    return input;
  }
}
