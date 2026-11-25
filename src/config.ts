import path from 'path';

/**
 * Configuración de la aplicación.
 *
 * Se lee de variables de entorno (ver .env.example). No hay secretos en el
 * código: se sacó el sessionSecret fijo, que no se usaba.
 */
export default {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'origen',
    // La aplicación usa una cuenta propia con permisos mínimos. La contraseña
    // debe llegar por el entorno (docker-compose.yml la define para la demo).
    user: process.env.DB_USER || 'origen_app',
    password: process.env.DB_PASSWORD,
  },

  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'),
};
