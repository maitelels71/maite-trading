/** Compress an image file to JPEG base64 for Notion upload. */

export type CompressedShot = {
  label: string;
  filename: string;
  content_type: "image/jpeg";
  data_base64: string;
};

export async function compressImageFile(
  file: File,
  label: string,
  opts?: { maxWidth?: number; quality?: number },
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
  const base = file.name.replace(/\.[^.]+$/, "") || "shot";
  return {
    label,
    filename: `${base}.jpg`,
    content_type: "image/jpeg",
    data_base64,
  };
}
