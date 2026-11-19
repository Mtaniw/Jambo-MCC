export interface ExtractedColors {
  primary: string;
  palette: string[];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h, s, l };
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/**
 * Samples an image on an offscreen canvas and returns the strongest product accent color
 * plus a short deduplicated palette of top colors found in the image.
 */
export function extractColorsFromImage(imageSrc: string): Promise<ExtractedColors | null> {
  return new Promise((resolve) => {
    if (!imageSrc) {
      resolve(null);
      return;
    }

    const img = new Image();
    if (!imageSrc.startsWith('data:') && !imageSrc.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        interface Bucket {
          rSum: number;
          gSum: number;
          bSum: number;
          count: number;
          score: number;
        }

        const buckets = new Map<string, Bucket>();
        const fallbackBuckets = new Map<string, Bucket>();

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 140) continue;

          const { s, l } = rgbToHsl(r, g, b);

          // Quantize into 24-step buckets so similar shades group cleanly
          const rq = Math.floor(r / 24);
          const gq = Math.floor(g / 24);
          const bq = Math.floor(b / 24);
          const key = `${rq}-${gq}-${bq}`;

          // Always record fallback bucket in case image is mostly neutral
          const fb = fallbackBuckets.get(key) || { rSum: 0, gSum: 0, bSum: 0, count: 0, score: 0 };
          fb.rSum += r;
          fb.gSum += g;
          fb.bSum += b;
          fb.count += 1;
          fb.score += 1 + s;
          fallbackBuckets.set(key, fb);

          // Skip pure white studio walls, near-black shadows, and washed-out neutrals for accent picking
          if (l > 0.9 || l < 0.1 || s < 0.14) continue;

          // Center pixels slightly favored over outer studio backdrop
          const pxIdx = i / 4;
          const x = pxIdx % size;
          const y = Math.floor(pxIdx / size);
          const distFromCenter = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
          const centerWeight = distFromCenter < 0.7 ? 1.45 : 1.0;

          // Prefer vivid, mid-luminance colors ideal for product badges/accents
          const midLumBonus = 1 - Math.abs(l - 0.48);
          const pixelScore = (1 + s * 3.0) * (0.7 + midLumBonus) * centerWeight;

          const existing = buckets.get(key) || { rSum: 0, gSum: 0, bSum: 0, count: 0, score: 0 };
          existing.rSum += r;
          existing.gSum += g;
          existing.bSum += b;
          existing.count += 1;
          existing.score += pixelScore;
          buckets.set(key, existing);
        }

        const sourceMap = buckets.size > 0 ? buckets : fallbackBuckets;
        if (sourceMap.size === 0) {
          resolve(null);
          return;
        }

        const candidates = Array.from(sourceMap.values())
          .map((bucket) => ({
            r: bucket.rSum / bucket.count,
            g: bucket.gSum / bucket.count,
            b: bucket.bSum / bucket.count,
            score: bucket.score,
          }))
          .sort((a, b) => b.score - a.score);

        // Deduplicate close colors for a clean 4-swatch palette
        const paletteRgb: { r: number; g: number; b: number }[] = [];
        for (const c of candidates) {
          if (paletteRgb.every((picked) => colorDistance(picked, c) > 48)) {
            paletteRgb.push(c);
            if (paletteRgb.length >= 4) break;
          }
        }

        const palette = paletteRgb.map((c) => rgbToHex(c.r, c.g, c.b));
        if (palette.length === 0) {
          resolve(null);
          return;
        }

        resolve({
          primary: palette[0],
          palette,
        });
      } catch {
        // Cross-origin tainted canvas or canvas unsupported
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageSrc;
  });
}
