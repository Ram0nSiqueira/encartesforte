/** Lê uma imagem enviada, reduz para no máximo `max` px e devolve data URL (webp, mantendo transparência). */
export async function fileToDataUrl(file: File, max = 800): Promise<string> {
  const bmp = await createImageBitmap(file);
  const ratio = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * ratio));
  const h = Math.max(1, Math.round(bmp.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const webp = canvas.toDataURL('image/webp', 0.88);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
