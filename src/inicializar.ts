import * as db from './db';
import bcrypt from 'bcryptjs';
import { CATALOGO } from './catalogo';
import type { Rol } from './tipos';

const COSTO_BCRYPT = 12;
const HASH_BCRYPT = /^\$2[aby]\$\d{2}\$/;

interface UsuarioInicial {
  username: string;
  password: string;
  rol: Rol;
  nombre: string;
}

/**
 * Carga los datos iniciales (usuarios y catálogo) si la base está vacía.
 *
 * FALLA — Almacenamiento inseguro de credenciales:
 * las contraseñas de los usuarios se guardan en TEXTO PLANO.
 * La corrección es hashear con bcrypt + salt por usuario
 * (bcryptjs ya está instalado como dependencia del proyecto).
 */

export const USUARIOS_INICIALES: UsuarioInicial[] = [
  {
    username: 'admin',
    password: 'admin',
    rol: 'admin',
    nombre: 'Administración',
  },
  {
    username: 'valentina',
    password: 'origen2024',
    rol: 'admin',
    nombre: 'Valentina',
  },
  {
    username: 'barista',
    password: 'cafe123',
    rol: 'barista',
    nombre: 'Barista',
  },
  {
    username: 'mozo',
    password: 'mozo123',
    rol: 'mozo',
    nombre: 'Mozo de sala',
  },
  {
    username: 'cliente',
    password: 'cliente',
    rol: 'cliente',
    nombre: 'Cliente',
  },
];

export async function inicializarBase(): Promise<void> {
  // --- Usuarios -------------------------------------------------------------
  const { rows: usuariosExistentes } = await db.query<{
    id: number;
    username: string;
    password: string;
  }>('SELECT id, username, password FROM usuarios');

  // Migra instalaciones anteriores sin invalidar sus contraseñas actuales.
  for (const usuario of usuariosExistentes) {
    if (HASH_BCRYPT.test(usuario.password)) continue;
    const passwordHash = await bcrypt.hash(usuario.password, COSTO_BCRYPT);
    await db.query('UPDATE usuarios SET password = $1 WHERE id = $2', [
      passwordHash,
      usuario.id,
    ]);
  }

  const usernamesExistentes = new Set(usuariosExistentes.map((usuario) => usuario.username));
  for (const usuario of USUARIOS_INICIALES) {
    if (usernamesExistentes.has(usuario.username)) continue;
    const passwordHash = await bcrypt.hash(usuario.password, COSTO_BCRYPT);
    await db.query(
      `INSERT INTO usuarios (username, password, rol, nombre)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      [usuario.username, passwordHash, usuario.rol, usuario.nombre]
    );
  }

  // --- Catálogo -------------------------------------------------------------
  for (const producto of CATALOGO) {
    await db.query(
      `INSERT INTO productos
         (nombre, tipo, variedad, tamano, gramos, precio_base, precio_por_gramo, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (nombre) DO NOTHING`,
      [
        producto.nombre,
        producto.tipo,
        producto.variedad,
        producto.tamano,
        producto.gramos,
        producto.precio_base,
        producto.precio_por_gramo,
        producto.descripcion,
      ]
    );
  }
}
