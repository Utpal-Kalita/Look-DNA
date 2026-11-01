import type { Undertone } from "@/lib/types";

interface LabColor {
  l: number;
  a: number;
  b: number;
}

export function deriveUndertone(hex: string): Undertone {
  const { a, b } = hexToLab(hex);
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

  if (hue >= 50 && hue <= 90) {
    return "warm";
  }

  if (hue <= 42 || hue > 330) {
    return "cool";
  }

  return "neutral";
}

export function normalizeHex(hex: string): string {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid color value: ${hex}`);
  }

  return `#${normalized.toUpperCase()}`;
}

function hexToLab(hex: string): LabColor {
  const normalized = normalizeHex(hex).slice(1);
  const [r, g, b] = [0, 2, 4].map((offset) =>
    srgbToLinear(Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255),
  );

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / 1;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const fx = labPivot(x);
  const fy = labPivot(y);
  const fz = labPivot(z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function labPivot(value: number): number {
  const threshold = 216 / 24389;
  return value > threshold
    ? Math.cbrt(value)
    : (24389 / 27 / 116) * value + 16 / 116;
}
