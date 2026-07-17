// Redimensiona preservando la relación de aspecto (a diferencia de toSquareWebp,
// que recorta un cuadrado central) para que el lado mayor sea <= maxDimension, y
// codifica WebP con la calidad dada. Las portadas de ficha son verticales (2:3)
// y NO deben recortarse. Solo reduce (scale <= 1): nunca amplía un original
// pequeño.
export async function toContainedWebp(
  file: File,
  maxDimension: number,
  quality = 0.8
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      quality
    );
  });
}
