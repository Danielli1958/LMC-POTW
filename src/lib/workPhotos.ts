import { supabase } from "@/integrations/supabase/client";

export const WORK_PHOTO_BUCKET = "lmc-work-photos";
export const MAX_WORK_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_DIMENSION = 1600;

/**
 * Phone photos are often 3-10 MB. Shrink to at most 1600px on the long edge as a
 * JPEG, which keeps handwriting readable. If the browser can't decode the image
 * (e.g. HEIC in Chrome), the original file is uploaded instead.
 */
async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Uploads a work photo and returns its storage path (<user id>/<problem id>/<file>). */
export async function uploadWorkPhoto(userId: string, problemId: string, file: File): Promise<string> {
  const image = await shrinkImage(file);
  if (image.size > MAX_WORK_PHOTO_BYTES) {
    throw new Error("That photo is too large. Please use a photo under 10 MB.");
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
