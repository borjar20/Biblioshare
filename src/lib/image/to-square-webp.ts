// Redimensiona y recorta (cuadrado central) a maxDimension y devuelve un Blob
// webp — extraído de avatar-upload.tsx para reutilizar en club-cover-upload.tsx
// sin duplicar la lógica de canvas.
export async function toSquareWebp(file: File, maxDimension: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = maxDimension;
  canvas.height = maxDimension;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, maxDimension, maxDimension);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      0.85
    );
  });
}
