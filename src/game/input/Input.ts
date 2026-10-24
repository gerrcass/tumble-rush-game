export interface InputFrame {
  moveX: number;
  moveZ: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  divePressed: boolean;
  grabPressed: boolean;
  grabHeld: boolean;
  emotePressed: boolean;
}

export interface ViewDelta {
  orbitX: number;
  orbitY: number;
  zoom: number;
}

type Action = 'jump' | 'dive' | 'grab' | 'emote';

const KEY_ACTIONS: Readonly<Record<string, Action>> = {
  Space: 'jump',
  ShiftLeft: 'dive',
  ShiftRight: 'dive',
  KeyE: 'grab',
  KeyQ: 'emote',
};

/**
 * Unified input for keyboard + mouse drag, touch joystick/buttons and gamepad.
 *
 * Key/button edges are latched until the game consumes them after a fixed
 * physics step, so pressing jump on a high-refresh display can never be lost
 * between render frames. All listeners are owned by one AbortController and are
 * cleared on blur or tab hide so no key can stick.
 */
export class Input {
  readonly touchCapable: boolean;
  private readonly canvas: HTMLCanvasElement;
  private readonly abort = new AbortController();

  private readonly keys = new Set<string>();
  private readonly actionPressed = { jump: false, dive: false, grab: false, emote: false };
  private readonly touchHeld = { jump: false, dive: false, grab: false, emote: false };
  private readonly touchPressed = { jump: false, dive: false, grab: false, emote: false };

  private joystickX = 0;
  private joystickZ = 0;
  private joystickPointer: number | null = null;

  private mouseDragging = false;
  private dragPointerId: number | null = null;
  private dragDistance = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private orbitX = 0;
  private orbitY = 0;
  private zoom = 0;

  private gamepad: Gamepad | null = null;
  private padHeld = { jump: false, dive: false, grab: false, emote: false };
  private padPressed = { jump: false, dive: false, grab: false, emote: false };
  private readonly padPrevious = new Array<boolean>(17).fill(false);
  private padStartHeld = false;
  private padPausePressed = false;

  private readonly joystickBase: HTMLElement | null;
  private readonly joystickKnob: HTMLElement | null;
  private readonly touchButtons = new Map<Action, HTMLElement>();

  constructor(canvas: HTMLCanvasElement, touchRoot: HTMLElement) {
    this.canvas = canvas;

    const query = new URLSearchParams(window.location.search);
    const forced = query.get('touch');
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    this.touchCapable =
      forced === '1' ||
      (forced !== '0' &&
        ((navigator.maxTouchPoints ?? 0) > 0 || coarse || 'ontouchstart' in window));

    this.joystickBase = touchRoot.querySelector<HTMLElement>('#touch-joystick');
    this.joystickKnob = touchRoot.querySelector<HTMLElement>('#touch-joystick-knob');
    for (const action of ['jump', 'dive', 'grab', 'emote'] as const) {
      const button = touchRoot.querySelector<HTMLElement>(`#touch-${action}`);
      if (button) this.touchButtons.set(action, button);
    }

    this.bindKeyboard();
    this.bindMouseAndTouchCamera();
    this.bindTouchControls();
  }

  get usingTouch(): boolean {
    return this.touchCapable;
  }

  get pausePressed(): boolean {
    const pressed = this.padPausePressed;
    this.padPausePressed = false;
    return pressed;
  }

  poll(dt: number): void {
    this.pollGamepad(dt);
  }

  readFrame(): InputFrame {
    let x = 0;
    let z = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;

    x += this.joystickX;
    z += this.joystickZ;
    if (this.gamepad) {
      x += axisWithDeadzone(this.gamepad.axes[0] ?? 0, 0.2);
      z -= axisWithDeadzone(this.gamepad.axes[1] ?? 0, 0.2);
    }
    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }

    const jumpHeld = this.keys.has('Space') || this.touchHeld.jump || this.padHeld.jump;
    const grabHeld = this.keys.has('KeyE') || this.touchHeld.grab || this.padHeld.grab;

    return {
      moveX: x,
      moveZ: z,
      jumpPressed: this.actionPressed.jump || this.touchPressed.jump || this.padPressed.jump,
      jumpHeld,
      divePressed: this.actionPressed.dive || this.touchPressed.dive || this.padPressed.dive,
      grabPressed: this.actionPressed.grab || this.touchPressed.grab || this.padPressed.grab,
      grabHeld,
      emotePressed: this.actionPressed.emote || this.touchPressed.emote || this.padPressed.emote,
    };
  }

  takeViewDelta(): ViewDelta {
    const delta = { orbitX: this.orbitX, orbitY: this.orbitY, zoom: this.zoom };
    this.orbitX = 0;
    this.orbitY = 0;
    this.zoom = 0;
    return delta;
  }

  clearPressed(): void {
    this.actionPressed.jump = false;
    this.actionPressed.dive = false;
    this.actionPressed.grab = false;
    this.actionPressed.emote = false;
    this.touchPressed.jump = false;
    this.touchPressed.dive = false;
    this.touchPressed.grab = false;
    this.touchPressed.emote = false;
    this.padPressed.jump = false;
    this.padPressed.dive = false;
    this.padPressed.grab = false;
    this.padPressed.emote = false;
    this.padPausePressed = false;
  }

  reset(): void {
    this.keys.clear();
    for (const action of ['jump', 'dive', 'grab', 'emote'] as const) {
      this.actionPressed[action] = false;
      this.touchHeld[action] = false;
      this.touchPressed[action] = false;
      this.padHeld[action] = false;
      this.padPressed[action] = false;
    }
    this.padPrevious.fill(false);
    this.padStartHeld = false;
    this.padPausePressed = false;
    this.joystickX = 0;
    this.joystickZ = 0;
    this.joystickPointer = null;
    this.mouseDragging = false;
    this.dragPointerId = null;
    this.dragDistance = 0;
    this.orbitX = 0;
    this.orbitY = 0;
    this.zoom = 0;
    if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(-50%, -50%)';
  }

  dispose(): void {
    this.abort.abort();
  }

  private bindKeyboard(): void {
    const signal = this.abort.signal;
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.code === 'Space' || event.code.startsWith('Arrow')) {
          event.preventDefault();
        }
        if (event.repeat) return;
        this.keys.add(event.code);
        const action = KEY_ACTIONS[event.code];
        if (action) this.actionPressed[action] = true;
      },
      { signal },
    );

    window.addEventListener(
      'keyup',
      (event) => {
        this.keys.delete(event.code);
      },
      { signal },
    );

    const releaseAll = (): void => this.reset();
    window.addEventListener('blur', releaseAll, { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) releaseAll();
      },
      { signal },
    );
  }

  private bindMouseAndTouchCamera(): void {
    const signal = this.abort.signal;

    this.canvas.addEventListener(
      'pointerdown',
      (event) => {
        event.preventDefault();
        if (event.pointerType === 'mouse' && event.button === 2) {
          this.actionPressed.dive = true;
          return;
        }
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (this.dragPointerId !== null) return;
        this.dragPointerId = event.pointerId;
        this.mouseDragging = true;
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
        this.dragDistance = 0;
        this.canvas.setPointerCapture?.(event.pointerId);
      },
      { signal },
    );

    this.canvas.addEventListener(
      'pointermove',
      (event) => {
        if (!this.mouseDragging || event.pointerId !== this.dragPointerId) return;
        const dx = event.clientX - this.lastPointerX;
        const dy = event.clientY - this.lastPointerY;
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
        this.dragDistance += Math.abs(dx) + Math.abs(dy);
        this.orbitX += dx;
        this.orbitY += dy;
      },
      { signal },
    );

    const endDrag = (event: PointerEvent): void => {
      if (event.pointerId !== this.dragPointerId) return;
      // A click (rather than a drag) is a grab, matching the mouse control table.
      if (event.pointerType === 'mouse' && this.dragDistance < 3) {
        this.actionPressed.grab = true;
      }
      this.mouseDragging = false;
      this.dragPointerId = null;
      this.dragDistance = 0;
      if (this.canvas.hasPointerCapture?.(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };
    this.canvas.addEventListener('pointerup', endDrag, { signal });
    this.canvas.addEventListener('pointercancel', endDrag, { signal });

    this.canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.zoom += event.deltaY;
      },
      { signal, passive: false },
    );

    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
  }

  private bindTouchControls(): void {
    const signal = this.abort.signal;
    const base = this.joystickBase;
    if (base) {
      const updateJoystick = (event: PointerEvent): void => {
        if (this.joystickPointer !== event.pointerId) return;
        const rect = base.getBoundingClientRect();
        const radius = rect.width * 0.34;
        let dx = event.clientX - (rect.left + rect.width / 2);
        let dy = event.clientY - (rect.top + rect.height / 2);
        const length = Math.hypot(dx, dy);
        if (length > radius) {
          dx = (dx / length) * radius;
          dy = (dy / length) * radius;
        }
        this.joystickX = dx / radius;
        this.joystickZ = -dy / radius;
        if (this.joystickKnob) {
          this.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        }
      };

      base.addEventListener(
        'pointerdown',
        (event) => {
          event.preventDefault();
          this.joystickPointer = event.pointerId;
          base.setPointerCapture?.(event.pointerId);
          updateJoystick(event);
        },
        { signal },
      );
      base.addEventListener('pointermove', updateJoystick, { signal });
      const endStick = (event: PointerEvent): void => {
        if (this.joystickPointer !== event.pointerId) return;
        this.joystickPointer = null;
        this.joystickX = 0;
        this.joystickZ = 0;
        if (this.joystickKnob) {
          this.joystickKnob.style.transform = 'translate(-50%, -50%)';
        }
      };
      base.addEventListener('pointerup', endStick, { signal });
      base.addEventListener('pointercancel', endStick, { signal });
    }

    for (const [action, button] of this.touchButtons) {
      button.addEventListener(
        'pointerdown',
        (event) => {
          event.preventDefault();
          button.setPointerCapture?.(event.pointerId);
          this.touchHeld[action] = true;
          this.touchPressed[action] = true;
        },
        { signal },
      );
      const release = (event: PointerEvent): void => {
        event.preventDefault();
        this.touchHeld[action] = false;
      };
      button.addEventListener('pointerup', release, { signal });
      button.addEventListener('pointercancel', release, { signal });
      button.addEventListener('lostpointercapture', release, { signal });
    }
  }

  private pollGamepad(dt: number): void {
    if (typeof navigator.getGamepads !== 'function') {
      this.gamepad = null;
      return;
    }
    const pads = navigator.getGamepads();
    let pad: Gamepad | null = null;
    for (const candidate of pads) {
      if (candidate && candidate.connected) {
        pad = candidate;
        break;
      }
    }
    this.gamepad = pad;
    if (!pad) {
      for (const action of ['jump', 'dive', 'grab', 'emote'] as const) {
        this.padHeld[action] = false;
      }
      return;
    }

    const pressed = (index: number): boolean => (pad?.buttons[index]?.pressed ?? false);
    const map: ReadonlyArray<readonly [Action, number]> = [
      ['jump', 0],
      ['dive', 1],
      ['grab', 2],
      ['emote', 3],
    ];
    for (const [action, index] of map) {
      const down = pressed(index);
      this.padHeld[action] = down;
      if (down && !this.padPrevious[index]) this.padPressed[action] = true;
    }
    for (let i = 0; i < this.padPrevious.length; i += 1) {
      this.padPrevious[i] = pressed(i);
    }
    const startDown = pressed(9);
    if (startDown && !this.padStartHeld) this.padPausePressed = true;
    this.padStartHeld = startDown;

    const rightX = axisWithDeadzone(pad.axes[2] ?? 0, 0.22);
    const rightY = axisWithDeadzone(pad.axes[3] ?? 0, 0.22);
    if (rightX !== 0) this.orbitX += rightX * 420 * dt;
    if (rightY !== 0) this.orbitY += rightY * 300 * dt;
  }
}

function axisWithDeadzone(value: number, deadzone: number): number {
  if (Math.abs(value) <= deadzone) return 0;
  const sign = Math.sign(value);
  return sign * ((Math.abs(value) - deadzone) / (1 - deadzone));
}
