import { normalizeHex } from "@/lib/undertone";

export interface Lab {
  l: number;
  a: number;
  b: number;
}

export interface Lch {
  l: number;
  c: number;
  /** Degrees, 0..360. */
  h: number;
}

const WHITE = { x: 0.95047, y: 1, z: 1.08883 };

export function hexToLab(hex: string): Lab {
  const value = normalizeHex(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map((offset) =>
    toLinear(Number.parseInt(value.slice(offset, offset + 2), 16) / 255),
  );

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / WHITE.x;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / WHITE.y;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / WHITE.z;
  const [fx, fy, fz] = [x, y, z].map(pivot);

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToHex({ l, a, b }: Lab): string {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const [x, y, z] = [fx, fy, fz].map(unpivot);
  const X = x * WHITE.x;
  const Y = y * WHITE.y;
  const Z = z * WHITE.z;

  const rgb = [
    X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314,
    X * -0.969266 + Y * 1.8760108 + Z * 0.041556,
    X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252,
  ].map((channel) => Math.round(clamp(fromLinear(channel), 0, 1) * 255));

  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function labToLch({ l, a, b }: Lab): Lch {
  return {
    l,
    c: Math.hypot(a, b),
    h: (((Math.atan2(b, a) * 180) / Math.PI) % 360 + 360) % 360,
  };
}

export function lchToLab({ l, c, h }: Lch): Lab {
  const radians = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(radians), b: c * Math.sin(radians) };
}

/** CIE76 colour difference. ~2 is barely visible, 50+ is a different colour. */
export function deltaE(first: string, second: string): number {
  const a = hexToLab(first);
  const b = hexToLab(second);
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

/** Signed shortest angular distance from `from` to `to`, in degrees. */
export function hueDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function pivot(value: number): number {
  const epsilon = 216 / 24389;
  return value > epsilon ? Math.cbrt(value) : (24389 / 27 / 116) * value + 16 / 116;
}

function unpivot(value: number): number {
  const cubed = value ** 3;
  return cubed > 216 / 24389 ? cubed : (value - 16 / 116) / (24389 / 27 / 116);
}
