/** Compress an image file/blob to JPEG base64 for Notion upload. */

export type CompressedShot = {
  label: string;
  filename: string;
  content_type: "image/jpeg";
  data_base64: string;
};

export async function compressImageFile(
  file: File | Blob,
  label: string,
  opts?: { maxWidth?: number; quality?: number; filename?: string },
): Promise<CompressedShot> {
  const maxWidth = opts?.maxWidth ?? 1600;
  const quality = opts?.quality ?? 0.72;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))),
      "image/jpeg",
      quality,
    );
  });

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const data_base64 = btoa(binary);
  const rawName =
    opts?.filename ||
    (file instanceof File ? file.name : "") ||
    "paste";
  const base = rawName.replace(/\.[^.]+$/, "") || "shot";
  return {
    label,
    filename: `${base}.jpg`,
    content_type: "image/jpeg",
    data_base64,
  };
}

/** First image File/Blob from a paste or drop Clipboard/DataTransfer. */
export function imageFromDataTransfer(
  data: DataTransfer | null,
): File | Blob | null {
  if (!data) return null;
  for (const item of Array.from(data.items || [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  for (const file of Array.from(data.files || [])) {
    if (file.type.startsWith("image/")) return file;
  }
  return null;
}
