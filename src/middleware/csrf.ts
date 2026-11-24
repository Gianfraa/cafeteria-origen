/**
 * Protección anti-CSRF.
 *
 * Toda petición que cambia estado (POST, PUT, PATCH, DELETE) tiene que traer
 * un token aleatorio que una página de otro sitio no puede conocer:
 *
 *  - Con sesión iniciada, el token se guarda en la sesión (se genera al
 *    loguearse, así que cambia con cada sesión).
 *  - Sin sesión (el cliente que hace un pedido o deja una reseña desde el
 *    sitio público), el token va en una cookie `csrf` httpOnly y sameSite
 *    strict, y la petición tiene que repetirlo (patrón double-submit).
 *
 * El sitio lo pide a GET /api/csrf-token y lo manda en la cabecera
 * X-CSRF-Token (también se acepta el campo `_csrf` del cuerpo o de la URL).
 *
 * Como capa extra, si la petición trae cabecera Origin tiene que ser la del
 * propio sitio. El login queda afuera: antes de loguearse no hay sesión, y lo
 * cubren la cookie SameSite y el límite de intentos.
 */

import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import config from '../config';
import { leerCookies, obtenerSesion } from './sesion';

const COOKIE_CSRF = 'csrf';
const METODOS_SEGUROS = ['GET', 'HEAD', 'OPTIONS'];
const RUTAS_EXENTAS = ['/api/auth/login'];
/** 32 bytes aleatorios en hexadecimal. */
const FORMATO_TOKEN = /^[0-9a-f]{64}$/;

const opcionesCookieCsrf = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: config.nodeEnv === 'production',
  path: '/',
};

function generarTokenCsrf(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Compara dos tokens en tiempo constante (no filtra cuántos caracteres coinciden). */
function tokensIguales(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/** Token que mandó el cliente: cabecera, cuerpo o query (en ese orden). */
function tokenEnviado(req: Request): string | null {
  const candidatos = [req.get('x-csrf-token'), req.body?._csrf, req.query._csrf];
  const token = candidatos.find((t) => typeof t === 'string' && t.length > 0);
  return typeof token === 'string' ? token : null;
}

/** Si viene la cabecera Origin, tiene que ser el propio sitio. */
function origenPermitido(req: Request): boolean {
  const origen = req.get('origin');
  if (!origen) return true;
  try {
    return new URL(origen).host === req.get('host');
  } catch {
    return false; // "null" (archivo local, iframe sandbox) u otro valor inválido
  }
}

/** GET /api/csrf-token — entrega el token de la sesión o, sin sesión, el de la cookie. */
export function entregarTokenCsrf(req: Request, res: Response): void {
  res.set('Cache-Control', 'no-store');

  const sesion = obtenerSesion(req);
  if (sesion) {
    res.json({ token: sesion.csrfToken });
    return;
  }

  let token = leerCookies(req)[COOKIE_CSRF];
  if (!token || !FORMATO_TOKEN.test(token)) {
    token = generarTokenCsrf();
    res.cookie(COOKIE_CSRF, token, opcionesCookieCsrf);
  }
  res.json({ token });
}

/** Rechaza con 403 las peticiones que cambian estado sin un token válido. */
export function verificarCsrf(req: Request, res: Response, next: NextFunction) {
  if (METODOS_SEGUROS.includes(req.method)) return next();
  if (RUTAS_EXENTAS.includes(req.baseUrl + req.path)) return next();

  const enviado = tokenEnviado(req);
  const sesion = obtenerSesion(req);
  const esperado = sesion ? sesion.csrfToken : leerCookies(req)[COOKIE_CSRF];

  if (!origenPermitido(req) || !enviado || !esperado || !tokensIguales(enviado, esperado)) {
    return res.status(403).json({ error: 'Token anti-CSRF inválido o ausente.' });
  }

  // El token ya se usó: que no llegue a las rutas junto con los datos.
  if (req.body && typeof req.body === 'object') delete req.body._csrf;
  next();
}
