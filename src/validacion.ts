/**
 * Validación de entrada en el servidor.
 *
 * Todo lo que llega del cliente (cuerpo y parámetros de la URL) se valida acá
 * por tipo, rango y longitud antes de usarlo. Las restricciones del HTML
 * (required, maxlength, type="number") se saltean con el devtools: no alcanzan.
 */

/** Id de la URL o del cuerpo: entero positivo. Devuelve null si no es válido. */
export function validarId(valor: unknown): number | null {
  if (typeof valor === 'string' && !/^\d+$/.test(valor)) return null;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/** Texto obligatorio, sin espacios en los bordes, con longitud entre min y max. */
export function validarTexto(valor: unknown, min: number, max: number): string | null {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  return texto.length >= min && texto.length <= max ? texto : null;
}

/** Número entero dentro del rango [min, max]. */
export function validarEnteroEnRango(valor: unknown, min: number, max: number): number | null {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) return null;
  return valor >= min && valor <= max ? valor : null;
}
