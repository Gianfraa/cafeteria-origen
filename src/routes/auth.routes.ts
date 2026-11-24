import express from 'express';
import rateLimit from 'express-rate-limit';
import * as usuarios from '../services/usuarios.service';
import {
  crearSesion,
  destruirSesion,
  limpiarCookieSesion,
  obtenerSesion,
} from '../middleware/sesion';

const router = express.Router();

const VENTANA_LOGIN_MS = 15 * 60 * 1000;

/**
 * Fuerza bruta: límite por IP + usuario (frena el ataque a una cuenta) y otro
 * más alto por IP (frena el recorrido de muchas cuentas). Sólo cuentan los
 * intentos fallidos: el login correcto no consume cupo.
 */
const limitadorPorCuenta = rateLimit({
  windowMs: VENTANA_LOGIN_MS,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.username ?? '').toLowerCase().slice(0, 64)}`,
  statusCode: 429,
  message: { error: 'Demasiados intentos. Probá de nuevo más tarde.' },
});

const limitadorPorIp = rateLimit({
  windowMs: VENTANA_LOGIN_MS,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: { error: 'Demasiados intentos. Probá de nuevo más tarde.' },
});

/** Inicio de sesión. */
router.post('/login', limitadorPorIp, limitadorPorCuenta, async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Falta usuario o contraseña.' });
    }

    const usuario = await usuarios.autenticar(username, password);

    if (!usuario) {
      // Mismo mensaje para usuario inexistente y contraseña mal: no revela qué cuentas existen.
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    crearSesion(req, res, {
      id: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      nombre: usuario.nombre,
    });

    res.json({
      mensaje: `¡Bienvenido, ${usuario.nombre}!`,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        rol: usuario.rol,
        nombre: usuario.nombre,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Cierre de sesión: se invalida en el servidor y después se borra la cookie. */
router.post('/logout', (req, res) => {
  destruirSesion(req);
  limpiarCookieSesion(res);
  res.json({ mensaje: 'Sesión cerrada.' });
});

/** Devuelve el usuario de la sesión actual. */
router.get('/yo', (req, res) => {
  const sesion = obtenerSesion(req);
  if (!sesion) {
    return res.status(401).json({ error: 'Necesitás iniciar sesión.' });
  }
  res.json({ usuario: sesion.usuario });
});

export default router;
