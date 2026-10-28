/**
 * Headless canvas shim for level-construction tests.
 *
 * Levels generate their textures with the 2D canvas API, but Vitest runs in
 * Node. This stub records nothing; it only has to satisfy the calls made by
 * `canvasTexture`, signs, belt, checker and arrow generation. No pixels are
 * asserted here — rendering is covered by Playwright.
 */
class FakeGradient {
  addColorStop(): void {
    // no-op
  }
}

class FakeContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  font = '';
  textAlign = 'start';
  textBaseline = 'alphabetic';

  fillRect(): void {}
  strokeRect(): void {}
  clearRect(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  scale(): void {}
  rotate(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  arc(): void {}
  arcTo(): void {}
  fill(): void {}
  stroke(): void {}
  fillText(): void {}
  strokeText(): void {}
  drawImage(): void {}
  measureText(text: string): { width: number } {
    // Rough monospace fallback for the headless canvas shim: enough to prove
    // the auto-fit loop terminates and never indexes a missing glyph box.
    return { width: String(text).length * 30 };
  }

  createLinearGradient(): FakeGradient {
    return new FakeGradient();
  }

  createRadialGradient(): FakeGradient {
    return new FakeGradient();
  }

  getImageData(): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(4) };
  }

  putImageData(): void {}
}

class FakeCanvas {
  width = 300;
  height = 150;
  private readonly context = new FakeContext();

  getContext(): FakeContext {
    return this.context;
  }

  toDataURL(): string {
    return 'data:image/png;base64,';
  }
}

const fakeDocument = {
  createElement(tag: string): unknown {
    if (tag === 'canvas') return new FakeCanvas();
    return {};
  },
  createElementNS(): unknown {
    return new FakeCanvas();
  },
};

if (typeof globalThis.document === 'undefined') {
  Object.defineProperty(globalThis, 'document', {
    value: fakeDocument,
    configurable: true,
    writable: true,
  });
}
