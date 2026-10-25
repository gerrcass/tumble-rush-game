import '@fontsource-variable/fredoka';
import './style.css';
import { App } from './app/App';
import { dailySeed, resolveSeed } from './game/Rng';

const root = document.getElementById('app');

function randomSeed(): number {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const value = new Uint32Array(1);
    cryptoApi.getRandomValues(value);
    return (value[0] ?? Date.now()) >>> 0;
  }
  return (Date.now() ^ 0x5eed1234) >>> 0;
}

function showBootError(title: string, message: string): void {
  if (!root) return;
  root.innerHTML = `
    <div class="boot-error">
      <div class="boot-error__card" role="alert">
        <span class="sticker sticker--coral">SUNRISE CARNIVAL</span>
        <h1>${title}</h1>
        <p>${message}</p>
        <p class="boot-error__hint">Try a current version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
      </div>
    </div>
  `;
}

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

if (!root) {
  throw new Error('Tumble Rush could not find #app');
} else if (!supportsWebGL2()) {
  showBootError(
    'WEBGL2 NEEDED',
    'Tumble Rush needs WebGL2 to build its candy canyon. This browser cannot start the show.',
  );
} else {
  const { seed: daySeed } = dailySeed();
  const seed = resolveSeed(window.location.search, randomSeed() || daySeed);
  let app: App | null = null;
  try {
    app = new App(root, seed);
  } catch (error) {
    showBootError(
      'THE SHOW DID NOT START',
      'Something went wrong while building the Training Deck. Reload to try again.',
    );
    if (import.meta.env.DEV) console.error(error);
  }

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      app?.dispose();
      app = null;
    });
  }
}
