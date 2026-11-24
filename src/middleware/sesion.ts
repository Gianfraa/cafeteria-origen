/**
 * Gestión de sesiones.
 *
 * - El id es aleatorio (crypto.randomBytes) y no se puede adivinar.
 * - Cada sesión vence por inactividad y por tiempo absoluto.
 * - La cookie es httpOnly, sameSite y secure en producción.
 * - Al iniciar sesión se descarta la sesión anterior (evita la fijación).
 * - El logout borra la sesión del servidor (ver destruirSesion).
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';

import config from '../config';
import type { Sesion, UsuarioSesion } from '../tipos';

/** Vida máxima de una sesión, aunque el usuario siga activo. */
const TTL_ABSOLUTO_MS = 8 * 60 * 60 * 1000;
/** Tiempo sin actividad tras el cual la sesión vence. */
const TTL_INACTIVIDAD_MS = 30 * 60 * 1000;

export const sesiones = new Map<string, Sesion>();

/** Opciones de la cookie; clearCookie debe usar las mismas para que el navegador la borre. */
const opcionesCookie = {
  httpOnly: true, // JavaScript no puede leerla (mitiga el robo por XSS)
  sameSite: 'lax' as const, // no se envía en POST desde otros sitios (mitiga CSRF)
  secure: config.nodeEnv === 'production', // sólo por HTTPS en producción
  path: '/',
};

/** Lee las cookies de la petición (parser mínimo, sin dependencias). */
export function leerCookies(req: Request): Record<string, string> {
  const cookies: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return cookies;
  for (const parte of header.split(';')) {
    const separador = parte.indexOf('=');
    if (separador < 0) continue;
    const nombre = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();
    if (nombre) cookies[nombre] = decodeURIComponent(valor);
  }
  return cookies;
}

/** Crea una sesión nueva para el usuario y setea la cookie. */
export function crearSesion(req: Request, res: Response, usuario: UsuarioSesion): string {
  // Si el cliente ya traía un sid, se descarta: el id siempre se regenera al loguearse.
  destruirSesion(req);

  const id = crypto.randomBytes(32).toString('hex');
  const ahora = Date.now();

  sesiones.set(id, {
    usuario,
    creadaEn: ahora,
    expiraEn: ahora + TTL_INACTIVIDAD_MS,
  });

  res.cookie('sid', id, { ...opcionesCookie, maxAge: TTL_ABSOLUTO_MS });

  return id;
}

/** Devuelve la sesión de la petición si existe y no venció; renueva la inactividad. */
export function obtenerSesion(req: Request): Sesion | null {
  const cookies = leerCookies(req);
  const id = cookies.sid;
  if (!id) return null;

  const sesion = sesiones.get(id);
  if (!sesion) return null;

  const ahora = Date.now();
  const vencidaPorTiempo = ahora >= sesion.creadaEn + TTL_ABSOLUTO_MS;
  const vencidaPorInactividad = sesion.expiraEn === null || ahora >= sesion.expiraEn;
  if (vencidaPorTiempo || vencidaPorInactividad) {
    sesiones.delete(id);
    return null;
  }

  // Renueva la ventana de inactividad, sin pasar nunca del límite absoluto.
  sesion.expiraEn = Math.min(ahora + TTL_INACTIVIDAD_MS, sesion.creadaEn + TTL_ABSOLUTO_MS);
  return sesion;
}

/** Cierra la sesión en el servidor (se llama en el logout y al volver a loguearse). */
export function destruirSesion(req: Request): void {
  const cookies = leerCookies(req);
  const id = cookies.sid;
  if (id) sesiones.delete(id);
}

/** Borra la cookie del navegador con las mismas opciones con que se creó. */
export function limpiarCookieSesion(res: Response): void {
  res.clearCookie('sid', opcionesCookie);
}
