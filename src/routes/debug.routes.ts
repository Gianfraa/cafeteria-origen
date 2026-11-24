import express from 'express';

import config from '../config';
import { requiereSesion, requiereRol } from '../middleware/auth';

const router = express.Router();

/**
 * Endpoint de diagnóstico.
 * Solo para administradores y sin secretos: no devuelve variables de entorno
 * ni credenciales de la base de datos.
 */
router.use(requiereSesion, requiereRol('admin'));

router.get('/', (req, res) => {
  res.json({
    mensaje: 'Diagnóstico del servidor',
    version: '1.0.0',
    entorno: config.nodeEnv,
    baseDeDatos: {
      host: config.db.host,
      puerto: config.db.port,
      nombre: config.db.database,
    },
    sistema: {
      node: process.version,
      plataforma: process.platform,
      memoria: process.memoryUsage(),
      uptime: process.uptime(),
    },
  });
});

export default router;