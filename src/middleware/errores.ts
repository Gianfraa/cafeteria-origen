/**
 * Manejo de errores.
 *
 * Al cliente sólo le llega un status y un mensaje fijo: nunca el mensaje
 * original del error ni el stack trace (revelarían rutas internas, nombres de
 * tablas, fragmentos de SQL o la propia entrada del usuario). El detalle real
 * queda en el log del servidor.
 */

import type { NextFunction, Request, Response } from 'express';

import type { ErrorHttp } from '../tipos';

export function rutaNoEncontrada(req: Request, res: Response): void {
  // No se refleja la URL pedida: sería un vector de XSS reflejado.
  res.status(404).json({ error: 'Ruta no encontrada.' });
}

// Express reconoce al manejador de errores por sus CUATRO parámetros: `next`
// tiene que estar aunque no se use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function manejadorErrores(err: ErrorHttp, req: Request, res: Response, next: NextFunction): void {
  // El detalle completo (mensaje + stack) sólo va al log del servidor.
  console.error('[error]', req.method, req.originalUrl, err);

  // Errores del cliente (JSON mal formado, cuerpo demasiado grande...): se
  // conserva el status 4xx, pero con un mensaje genérico.
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500;
  const mensaje = status < 500 ? 'Solicitud inválida.' : 'Error interno del servidor.';

  res.status(status).json({ error: mensaje });
}
