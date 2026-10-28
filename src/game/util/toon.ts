import {
  CanvasTexture,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
} from 'three';

let gradientMap: DataTexture | null = null;

/** Shared 3-band toon ramp. Created once and never disposed per bean. */
export function getToonGradient(): DataTexture {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([
    88, 88, 96, 255,
    158, 158, 164, 255,
    255, 255, 255, 255,
  ]);
  const texture = new DataTexture(data, 3, 1, RGBAFormat);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  gradientMap = texture;
  return texture;
}

export interface ToonMaterialOptions {
  color: number | string;
  map?: Texture | null;
  transparent?: boolean;
  opacity?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

export function makeToonMaterial(options: ToonMaterialOptions): MeshToonMaterial {
  return new MeshToonMaterial({
    color: options.color,
    map: options.map ?? null,
    gradientMap: getToonGradient(),
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
  });
}

export function canvasTexture(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable in this browser');
  draw(context, width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

let shadowTexture: CanvasTexture | null = null;

/** Soft round contact shadow used by beans and props. Shared, never disposed. */
export function getShadowTexture(): CanvasTexture {
  if (shadowTexture) return shadowTexture;
  shadowTexture = canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(36,50,74,0.55)');
    gradient.addColorStop(0.55, 'rgba(36,50,74,0.24)');
    gradient.addColorStop(1, 'rgba(36,50,74,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
  return shadowTexture;
}

let sunTexture: CanvasTexture | null = null;

export function getSunTexture(): CanvasTexture {
  if (sunTexture) return sunTexture;
  sunTexture = canvasTexture(256, 256, (ctx, w, h) => {
    const glow = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    glow.addColorStop(0, 'rgba(255,250,225,1)');
    glow.addColorStop(0.16, 'rgba(255,235,170,0.95)');
    glow.addColorStop(0.42, 'rgba(255,193,69,0.34)');
    glow.addColorStop(1, 'rgba(255,193,69,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  });
  return sunTexture;
}

export function makeRadialSpriteTexture(): CanvasTexture {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Text plaque texture for physical signs (procedural, no image assets). */
export function makeSignTexture(title: string, subtitle: string): CanvasTexture {
  const texture = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);

    ctx.fillStyle = '#24324a';
    roundRect(ctx, -w / 2 + 10, -h / 2 + 14, w - 20, h - 20, 34);
    ctx.fill();

    const gradient = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    gradient.addColorStop(0, '#fff6e5');
    gradient.addColorStop(1, '#ffe6b0');
    ctx.fillStyle = gradient;
    roundRect(ctx, -w / 2 + 16, -h / 2 + 8, w - 44, h - 36, 28);
    ctx.fill();

    ctx.fillStyle = '#ff6b6b';
    const titleSize = fitFontSize(
      ctx,
      title,
      '700',
      66,
      34,
      w - 96,
    );
    ctx.font = `700 ${titleSize}px "Fredoka Variable", Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, -4, -24);
    ctx.fillStyle = '#24324a';
    const subtitleSize = fitFontSize(
      ctx,
      subtitle,
      '600',
      30,
      15,
      w - 96,
    );
    ctx.font = `600 ${subtitleSize}px "Fredoka Variable", Fredoka, sans-serif`;
    ctx.fillText(subtitle, -4, 44);
    ctx.restore();

    // Small candy dots on the corners.
    ctx.fillStyle = '#ffc145';
    for (const [x, y] of [
      [44, 40],
      [w - 54, 40],
      [44, h - 42],
      [w - 54, h - 42],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  return texture;
}

/**
 * Shrink a sign label until it fits the authored texture. Long twist names
 * (MOON GRAVITY, RUSH HOUR) and the existing arena titles must not clip at the
 * canvas edge; the text stays the full label, only the type size moves.
 */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: string,
  start: number,
  min: number,
  maxWidth: number,
): number {
  let size = start;
  ctx.font = `${weight} ${size}px "Fredoka Variable", Fredoka, sans-serif`;
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px "Fredoka Variable", Fredoka, sans-serif`;
  }
  return size;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export { roundRect };
