/** Resuelve una ruta de `public/` respetando la base de despliegue (raíz del dominio o subcarpeta). */
export const asset = (path: string): string =>
  /^(https?:|data:|blob:)/.test(path) ? path : import.meta.env.BASE_URL + path.replace(/^\//, '');
