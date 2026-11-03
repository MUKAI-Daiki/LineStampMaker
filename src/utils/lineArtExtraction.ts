export interface CropRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ToneSettings {
  contrast: number;
  brightness: number;
}

const WORK_MAX_SIZE = 1024;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = src;
  });
}

/** 切り抜き＋縮小した作業用キャンバス（背景は白） */
export function cropToCanvas(img: HTMLImageElement, crop: CropRect | null, maxSize = WORK_MAX_SIZE): HTMLCanvasElement {
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (crop) {
    const cw = Math.round(Math.abs(crop.x2 - crop.x1) * img.naturalWidth);
    const ch = Math.round(Math.abs(crop.y2 - crop.y1) * img.naturalHeight);
    if (cw > 10 && ch > 10) {
      sx = Math.round(Math.min(crop.x1, crop.x2) * img.naturalWidth);
      sy = Math.round(Math.min(crop.y1, crop.y2) * img.naturalHeight);
      sw = cw;
      sh = ch;
    }
  }
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toneLuminance(src: CanvasImageSource, w: number, h: number, tone: ToneSettings): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.filter = `contrast(${tone.contrast}%) brightness(${tone.brightness}%)`;
  ctx.drawImage(src, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return lum;
}

function grayToDataUrl(gray: Uint8ClampedArray, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const out = ctx.createImageData(w, h);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    out.data[i] = out.data[i + 1] = out.data[i + 2] = gray[p];
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Drops isolated dark specks (paper grain, sensor noise) that have almost no dark neighbours. */
function removeSpeckles(gray: Uint8ClampedArray, w: number, h: number) {
  const dark = new Uint8Array(gray.length);
  for (let p = 0; p < gray.length; p++) dark[p] = gray[p] < 160 ? 1 : 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (!dark[p]) continue;
      const n = dark[p - w - 1] + dark[p - w] + dark[p - w + 1] + dark[p - 1] + dark[p + 1] + dark[p + w - 1] + dark[p + w] + dark[p + w + 1];
      if (n <= 1) gray[p] = 255;
    }
  }
}

/**
 * 端末内での線画抽出。周囲の明るさとの差で線を拾う（適応的しきい値）ため、
 * 写真の明暗ムラや紙の影に強い。sensitivity: 0〜100（大きいほど薄い線も拾う）
 */
export function extractLineArtLocal(src: HTMLCanvasElement, tone: ToneSettings, sensitivity: number): string {
  const w = src.width;
  const h = src.height;
  const lum = toneLuminance(src, w, h, tone);

  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += lum[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + rowSum;
    }
  }

  const r = Math.max(6, Math.round(Math.min(w, h) / 30));
  const offset = 4 + (100 - sensitivity) * 0.4;
  const gray = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = lum[y * w + x];
      const diff = mean - offset - v;
      gray[y * w + x] = v > 235 || diff <= 0 ? 255 : Math.max(0, 255 - diff * 10);
    }
  }
  removeSpeckles(gray, w, h);
  return grayToDataUrl(gray, w, h);
}

/** AIが出力した線画を、明度・コントラスト調整後に白黒へ整える */
export function cleanLineArt(img: HTMLImageElement, tone: ToneSettings): string {
  const scale = Math.min(1, WORK_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const lum = toneLuminance(img, w, h, tone);
  const gray = new Uint8ClampedArray(w * h);
  for (let p = 0; p < lum.length; p++) {
    const v = lum[p];
    gray[p] = v >= 200 ? 255 : Math.max(0, Math.round(((v - 80) / 120) * 255));
  }
  removeSpeckles(gray, w, h);
  return grayToDataUrl(gray, w, h);
}

export const AI_LINE_ART_PROMPT = `Extract clean line art from this image.
Output ONLY solid black outlines (#000000) on a pure white (#FFFFFF) background.
Trace the main contours and the important inner details of the drawing or character (face, hair, clothing folds, accessories).
Remove all colors, shading, hatching for shadows, paper texture, photo lighting, wrinkles of the paper, and background objects.
Keep the exact composition, proportions, pose and framing of the original — do not add, redraw, restyle or complete anything.
Clean, continuous lines with consistent weight. No grayscale fills, no text, no border.`;
