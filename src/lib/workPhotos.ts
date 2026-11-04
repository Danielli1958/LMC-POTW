import { supabase } from "@/integrations/supabase/client";

export const WORK_PHOTO_BUCKET = "lmc-work-photos";

/** Every photo is compressed to this size or smaller before upload. */
export const TARGET_WORK_PHOTO_BYTES = 300 * 1024;

/**
 * Hard cap, also enforced by the bucket's file_size_limit. Only matters for
 * images the browser can't re-encode (e.g. HEIC in desktop Chrome).
 */
export const MAX_WORK_PHOTO_BYTES = 1024 * 1024;

/**
 * Compression steps, tried in order until the photo fits the target.
 * Quality drops first (cheap on legibility), then resolution.
 */
const MAX_DIMENSIONS = [1600, 1400, 1200, 1000, 800];
const QUALITIES = [0.85, 0.75, 0.65, 0.55];
const LAST_RESORT_QUALITY = 0.4;

const encodeJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

const drawScaled = (bitmap: ImageBitmap, maxDimension: number) => {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // White background so transparent PNGs don't turn black as JPEGs.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
};

/**
 * Compresses a photo to a JPEG of at most TARGET_WORK_PHOTO_BYTES.
 * Returns null if the browser can't decode the image.
 */
async function compressToTarget(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  try {
    let smallest: Blob | null = null;
    for (const maxDimension of MAX_DIMENSIONS) {
      const canvas = drawScaled(bitmap, maxDimension);
      if (!canvas) return null;
      const isLastStep = maxDimension === MAX_DIMENSIONS[MAX_DIMENSIONS.length - 1];
      const qualities = isLastStep ? [...QUALITIES, LAST_RESORT_QUALITY] : QUALITIES;
      for (const quality of qualities) {
        const blob = await encodeJpeg(canvas, quality);
        if (!blob) continue;
        if (blob.size <= TARGET_WORK_PHOTO_BYTES) return blob;
        if (!smallest || blob.size < smallest.size) smallest = blob;
      }
    }
    // Extremely detailed images may still be slightly over; use the smallest attempt.
    return smallest;
  } finally {
    bitmap.close();
  }
}

/** Uploads a work photo and returns its storage path (<user id>/<problem id>/<file>). */
export async function uploadWorkPhoto(userId: string, problemId: string, file: File): Promise<string> {
  const compressed = await compressToTarget(file);
  // If the browser couldn't re-encode it, the original is used only if it's already small.
  const image: Blob = compressed ?? file;

  if (image.size > MAX_WORK_PHOTO_BYTES) {
    throw new Error(
      compressed
        ? "That photo couldn't be made small enough. Please try a different photo."
        : "This photo format isn't supported. Please upload a JPG or PNG photo."
    );
  }

  const ext = image.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "img").toLowerCase();
  const path = `${userId}/${problemId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(WORK_PHOTO_BUCKET)
    .upload(path, image, { contentType: image.type || file.type, upsert: false });
  if (error) throw error;

  return path;
}

/** Returns temporary viewing URLs (valid for 1 hour), keyed by storage path. */
export async function getWorkPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(WORK_PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  return Object.fromEntries(
    (data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl])
  );
}
