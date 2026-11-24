import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

import config from '../config';
import * as catalogo from '../services/catalogo.service';
import * as usuarios from '../services/usuarios.service';
import { requiereSesion, requiereRol } from '../middleware/auth';
import { validarId } from '../validacion';
import type { Rol, Usuario } from '../tipos';

const router = express.Router();
const ROLES_VALIDOS: Rol[] = ['admin', 'barista', 'mozo', 'cliente'];
// Lista blanca de servidores que se pueden probar desde el panel.
const HOSTS_PERMITIDOS = ['proveedor.origen.com', 'localhost', '127.0.0.1'];
// Subida de archivos: solo imágenes, con tope de tamaño.
const TAMANO_MAX = 2 * 1024 * 1024; // 2 MB
const EXTENSIONES_PERMITIDAS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

/** Detecta el tipo real de la imagen por sus primeros bytes (firma), no por el nombre. */
function detectarTipoImagen(buffer: Buffer): string | null {
  const firmaPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(firmaPng)) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 6 && buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'gif';
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'webp';
  return null;
}

/**
 * Rutas del panel de administración.
 * Todas exigen sesión iniciada y rol "admin": un usuario con otro rol recibe 403.
 */
router.use(requiereSesion);
router.use(requiereRol('admin'));

/** GET /api/admin/usuarios */
router.get('/usuarios', async (req, res, next) => {
  try {
    res.json({ usuarios: await usuarios.listar() });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/usuarios/:id
 * Solo un admin llega a esta ruta, y el rol se valida contra la lista de roles permitidos.
 */
router.put('/usuarios/:id', async (req, res, next) => {
  try {
    const id = validarId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Id inválido.' });
    }
    const { username, nombre, rol, password } = req.body || {};
    const cambios: Partial<Usuario> = {};
    if (username !== undefined) cambios.username = username;
    if (nombre !== undefined) cambios.nombre = nombre;
    if (rol !== undefined) {
      // Defensa extra: solo un admin puede cambiar roles, aunque se quite el middleware.
      if (!req.usuario || req.usuario.rol !== 'admin') {
        return res.status(403).json({ error: 'No tenés permisos para cambiar roles.' });
      }
      if (!ROLES_VALIDOS.includes(rol)) {
        return res.status(400).json({ error: 'Rol inválido.' });
      }
      cambios.rol = rol;
    }
    if (password !== undefined) cambios.password = password;

    const usuario = await usuarios.actualizar(id, cambios);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/productos — alta de producto. */
router.post('/productos', async (req, res, next) => {
  try {
    const producto = await catalogo.crear(req.body || {});
    res.status(201).json(producto);
  } catch (err) {
    // El nombre del producto es único en la base.
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese nombre.' });
    }
    next(err);
  }
});

/** PUT /api/admin/productos/:id */
router.put('/productos/:id', async (req, res, next) => {
  try {
    const id = validarId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Id inválido.' });
    }
    const producto = await catalogo.actualizar(id, req.body || {});
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/productos/:id
 *
 * FALLA — CSRF: la petición que borra un producto no lleva ningún token y se
 * acepta con un simple GET/POST desde cualquier origen.
 */
router.delete('/productos/:id', async (req, res, next) => {
  try {
    const id = validarId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Id inválido.' });
    }
    const producto = await catalogo.eliminar(id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/cambiar-contrasena
 *
 * FALLAS: sin token anti-CSRF, sin límite de intentos, y la contraseña nueva
 * se guarda en texto plano.
 */
router.post('/cambiar-contrasena', async (req, res, next) => {
  try {
    const { nueva } = req.body || {};
    if (!nueva) {
      return res.status(400).json({ error: 'Falta la contraseña nueva.' });
    }
    // FALLA: no se valida la longitud ni la complejidad de la contraseña.
    // (`req.usuario!`: requiereSesion ya garantizó que hay un usuario.)
    const usuario = await usuarios.cambiarPassword(req.usuario!.id, nueva);
    res.json({ mensaje: 'Contraseña actualizada.', usuario });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/probar-conexion
 *
 * Hace ping a un servidor del proveedor. El host se valida contra una lista
 * blanca y ping se ejecuta con spawn, sin shell y con argumentos separados:
 * operadores como ; | && no se interpretan.
 */
router.post('/probar-conexion', (req, res) => {
  const { host } = req.body || {};

  if (typeof host !== 'string' || !HOSTS_PERMITIDOS.includes(host)) {
    return res.status(400).json({ error: 'Servidor no permitido.' });
  }

  // Sin shell: el host viaja como argumento separado y no se interpreta.
  const args = ['-c', '3', host];
  const proceso = spawn('ping', args, { shell: false });

  let salida = '';
  let errores = '';
  proceso.stdout.on('data', (dato) => { salida += dato.toString(); });
  proceso.stderr.on('data', (dato) => { errores += dato.toString(); });

  proceso.on('error', () => {
    if (res.headersSent) return;
    res.status(500).json({ error: 'No se pudo ejecutar la prueba de conexión.' });
  });

  proceso.on('close', () => {
    if (res.headersSent) return;
    res.json({
      comando: `ping ${args.join(' ')}`,
      salida,
      error: errores || null,
    });
  });
});

/**
 * POST /api/admin/subir-archivo
 *
 * Subida de imágenes del panel. Antes de guardar se valida:
 *   1. la extensión, contra una lista blanca (PNG, JPG, GIF, WEBP);
 *   2. el tamaño, con un máximo de 2 MB;
 *   3. el tipo real del archivo, por su firma (primeros bytes), para que no
 *      alcance con renombrar un .html a .png;
 *   4. el nombre: lo genera el servidor (UUID), así el nombre del cliente
 *      nunca llega al disco y no se puede escribir fuera de uploads con "../".
 *
 * SVG queda afuera a propósito: puede contener scripts.
 */
router.post('/subir-archivo', express.json({ limit: '3mb' }), (req, res, next) => {
  try {
    const { nombre, contenidoBase64 } = req.body || {};

    if (typeof nombre !== 'string' || typeof contenidoBase64 !== 'string' || !nombre || !contenidoBase64) {
      return res.status(400).json({ error: 'Falta el archivo.' });
    }

    // 1. Extensión contra lista blanca.
    const extension = path.extname(nombre).toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.includes(extension)) {
      return res.status(400).json({ error: 'Tipo de archivo no permitido. Solo imágenes PNG, JPG, GIF o WEBP.' });
    }

    // 2. Tamaño.
    const buffer = Buffer.from(contenidoBase64, 'base64');
    if (buffer.length === 0) {
      return res.status(400).json({ error: 'El archivo está vacío.' });
    }
    if (buffer.length > TAMANO_MAX) {
      return res.status(413).json({ error: 'El archivo supera los 2 MB.' });
    }

    // 3. Tipo real según el contenido, no según el nombre.
    const tipoReal = detectarTipoImagen(buffer);
    const tipoEsperado = extension === '.jpeg' ? 'jpg' : extension.slice(1);
    if (tipoReal !== tipoEsperado) {
      return res.status(400).json({ error: 'El contenido del archivo no es una imagen válida.' });
    }

    // 4. Nombre aleatorio del servidor: el nombre del cliente nunca llega al disco.
    const nombreFinal = `${crypto.randomUUID()}${extension}`;
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(config.uploadsDir, nombreFinal), buffer);

    res.json({
      mensaje: 'Archivo subido.',
      url: `/uploads/${nombreFinal}`,
      bytes: buffer.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
