/** Resuelve una ruta de `public/` respetando la base de despliegue (raíz del dominio o subcarpeta). */
export const asset = (path: string): string =>
  /^(https?:|data:|blob:)/.test(path) ? path : import.meta.env.BASE_URL + path.replace(/^\//, '');

/** `srcset` con las versiones WebP de una imagen (`<base>-<ancho>.webp`). */
export const srcSetOf = (r: { base: string; widths: number[] }) => r.widths.map((w) => `${asset(`${r.base}-${w}.webp`)} ${w}w`).join(', ');
