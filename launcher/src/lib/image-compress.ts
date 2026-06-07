import type { CustomArtworkKind } from "./custom-artwork";

const MAX_DIMENSIONS: Record<CustomArtworkKind, { width: number; height: number }> = {
  cover: { width: 1920, height: 1080 },
  icon: { width: 512, height: 512 },
  logo: { width: 1024, height: 512 },
};

const JPEG_QUALITY = 0.82;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isAllowedImageType(file: File): boolean {
  return ALLOWED_TYPES.has(file.type);
}

function fitDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (sourceWidth <= maxWidth && sourceHeight <= maxHeight) {
    return { width: sourceWidth, height: sourceHeight };
  }

  const ratio = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: Math.round(sourceWidth * ratio),
    height: Math.round(sourceHeight * ratio),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for compression."));
    img.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Image file could not be converted."));
    };
    reader.readAsDataURL(file);
  });
}

export async function compressAndReadImage(file: File, kind: CustomArtworkKind): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  const { width: maxW, height: maxH } = MAX_DIMENSIONS[kind];

  const img = await loadImage(dataUrl);
  const { width, height } = fitDimensions(img.width, img.height, maxW, maxH);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return dataUrl;
  }

  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
