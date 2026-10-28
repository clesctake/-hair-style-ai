import type { Lab } from './journey.ts';
import type { SamplePoint, TargetControls } from './target-adjustment.ts';

// Numeric sRGB/D65 conversion. These are image pixel estimates, not calibrated hair measurements.
const clip = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const delta = 6 / 29;
const linear = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const f = (v: number) => v > delta ** 3 ? Math.cbrt(v) : v / (3 * delta ** 2) + 4 / 29;
const finv = (v: number) => v > delta ? v ** 3 : 3 * delta ** 2 * (v - 4 / 29);
export function srgbToLab(red: number, green: number, blue: number): Lab {
  const r = linear(red / 255), g = linear(green / 255), b = linear(blue / 255);
  const x = f((.4124564 * r + .3575761 * g + .1804375 * b) / .95047);
  const y = f(.2126729 * r + .7151522 * g + .0721750 * b);
  const z = f((.0193339 * r + .1191920 * g + .9503041 * b) / 1.08883);
  return { L: clip(116 * y - 16, 0, 100), a: 500 * (x - y), b: 200 * (y - z) };
}
const gamma = (v: number) => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;
const gammaLut = Uint8Array.from({ length: 8193 }, (_, i) => Math.round(gamma(i / 8192) * 255));
const channel = (v: number) => gammaLut[Math.round(clip(v, 0, 1) * 8192)];
export function labToSrgb(lab: Lab): { rgb: [number, number, number]; clipped: boolean } {
  const y = (lab.L + 16) / 116, X = .95047 * finv(y + lab.a / 500), Y = finv(y), Z = 1.08883 * finv(y - lab.b / 200);
  const r = 3.2404542 * X - 1.5371385 * Y - .4985314 * Z;
  const g = -.9692660 * X + 1.8760108 * Y + .0415560 * Z;
  const b = .0556434 * X - .2040259 * Y + 1.0572252 * Z;
  return { rgb: [channel(r), channel(g), channel(b)], clipped: r < 0 || r > 1 || g < 0 || g > 1 || b < 0 || b > 1 };
}

// Appearance controls are versioned design heuristics, never chemical/pigment concentrations.
export function adjustLab(lab: Lab, controls: TargetControls): Lab {
  const muted = controls.target_mutedness / 100, beige = controls.target_beige / 100 * .55, transparency = controls.target_transparency / 100;
  const chroma = (1 + controls.target_saturation / 100) * (1 - .6 * muted) * (1 - .2 * transparency);
  return {
    L: clip((lab.L + controls.target_lightness * .32 - 50) * (1 - .15 * transparency) + 50 + 10 * transparency, 0, 100),
    a: (lab.a * chroma + controls.target_redness * .35) * (1 - beige) + 4 * beige,
    b: (lab.b * chroma + controls.target_yellowness * .35) * (1 - beige) + 20 * beige,
  };
}
export type ToneBuffer = { width: number; height: number; original: Uint8ClampedArray; lab: Float32Array };
export function createToneBuffer(pixels: Uint8ClampedArray, width: number, height: number): ToneBuffer {
  if (pixels.length !== width * height * 4 || width <= 0 || height <= 0) throw new Error('画像の画素サイズを確認してください。');
  const lab = new Float32Array(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    const value = srgbToLab(pixels[p * 4], pixels[p * 4 + 1], pixels[p * 4 + 2]);
    lab[p * 3] = value.L; lab[p * 3 + 1] = value.a; lab[p * 3 + 2] = value.b;
  }
  return { width, height, original: new Uint8ClampedArray(pixels), lab };
}
export function renderTone(buffer: ToneBuffer, controls: TargetControls, hairMask?: Uint8Array): { pixels: Uint8ClampedArray; clippedPixelFraction: number } {
  if (hairMask && hairMask.length !== buffer.width * buffer.height) throw new Error('髪の選択範囲と画像サイズが一致しません。');
  if (Object.values(controls).every(v => v === 0)) return { pixels: new Uint8ClampedArray(buffer.original), clippedPixelFraction: 0 };
  const pixels = new Uint8ClampedArray(buffer.original);
  const muted = controls.target_mutedness / 100, beige = controls.target_beige / 100 * .55, transparency = controls.target_transparency / 100;
  const chroma = (1 + controls.target_saturation / 100) * (1 - .6 * muted) * (1 - .2 * transparency);
  const light = controls.target_lightness * .32, red = controls.target_redness * .35, yellow = controls.target_yellowness * .35;
  let clippedPixels = 0, selectedPixels = 0;
  for (let p = 0; p < buffer.width * buffer.height; p++) {
    const amount = hairMask ? hairMask[p] / 255 : 1;
    if (!amount || !buffer.original[p * 4 + 3]) continue;
    selectedPixels++;
    const L = clip((buffer.lab[p * 3] + light - 50) * (1 - .15 * transparency) + 50 + 10 * transparency, 0, 100);
    const a = (buffer.lab[p * 3 + 1] * chroma + red) * (1 - beige) + 4 * beige;
    const b = (buffer.lab[p * 3 + 2] * chroma + yellow) * (1 - beige) + 20 * beige;
    const y = (L + 16) / 116, X = .95047 * finv(y + a / 500), Y = finv(y), Z = 1.08883 * finv(y - b / 200);
    const r = 3.2404542 * X - 1.5371385 * Y - .4985314 * Z, g = -.969266 * X + 1.8760108 * Y + .041556 * Z, bl = .0556434 * X - .2040259 * Y + 1.0572252 * Z;
    if (r < 0 || r > 1 || g < 0 || g > 1 || bl < 0 || bl > 1) clippedPixels++;
    pixels[p * 4] = buffer.original[p * 4] + amount * (channel(r) - buffer.original[p * 4]);
    pixels[p * 4 + 1] = buffer.original[p * 4 + 1] + amount * (channel(g) - buffer.original[p * 4 + 1]);
    pixels[p * 4 + 2] = buffer.original[p * 4 + 2] + amount * (channel(bl) - buffer.original[p * 4 + 2]);
  }
  return { pixels, clippedPixelFraction: selectedPixels ? clippedPixels / selectedPixels : 0 };
}
export function sampleImageLab(pixels: Uint8ClampedArray, width: number, height: number, point: SamplePoint, hairMask?: Uint8Array): Lab {
  if (hairMask && hairMask.length !== width * height) throw new Error('髪の選択範囲と採色画像が一致しません。');
  const radius = Math.max(1, point.radius * Math.min(width, height)), cx = point.x * (width - 1), cy = point.y * (height - 1);
  const minX = Math.max(0, Math.floor(cx - radius)), maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius)), maxY = Math.min(height - 1, Math.ceil(cy + radius));
  const values: Lab[] = [];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
    const p = (y * width + x) * 4;
    if (pixels[p + 3] > 127 && (!hairMask || hairMask[p / 4] >= 128)) values.push(srgbToLab(pixels[p], pixels[p + 1], pixels[p + 2]));
  }
  if (!values.length) throw new Error('採色できる場所を、選択した髪の中で選んでください。');
  // Trim luminance tails within the selected patch to reduce highlights and deepest shadows.
  values.sort((a, b) => a.L - b.L);
  const trim = values.length >= 10 ? Math.floor(values.length * .1) : 0;
  const used = values.slice(trim, values.length - trim);
  return used.reduce((out, value) => ({ L: out.L + value.L / used.length, a: out.a + value.a / used.length, b: out.b + value.b / used.length }), { L: 0, a: 0, b: 0 });
}
