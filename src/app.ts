import path from 'path';
import express from 'express';
import helmet from 'helmet';

import config from './config';
import { rutaNoEncontrada, manejadorErrores } from './middleware/errores';
import { entregarTokenCsrf, verificarCsrf } from './middleware/csrf';
import authRoutes from './routes/auth.routes';
import productosRoutes from './routes/productos.routes';
import pedidosRoutes from './routes/pedidos.routes';
import reportesRoutes from './routes/reportes.routes';
import comentariosRoutes from './routes/comentarios.routes';
import adminRoutes from './routes/admin.routes';
import debugRoutes from './routes/debug.routes';

const app = express();

/**
 * Cabeceras de seguridad (helmet). Va primero para cubrir también los
 * archivos estáticos y los de /uploads.
 *
 * La Content Security Policy es una capa extra frente al XSS: el navegador
 * sólo ejecuta scripts y estilos servidos por el propio sitio (nada inline,
 * nada de otros dominios), y nadie puede meter la página en un iframe.
 * helmet agrega además X-Content-Type-Options: nosniff, X-Frame-Options,
 * Referrer-Policy y Strict-Transport-Security, entre otras.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'], // el favicon de los HTML es un data: URI
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        // En local se sirve por HTTP: forzar HTTPS sólo en producción.
        upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null,
      },
    },
  })
);

/**
 * Pendiente (fuera de este bloque): límite de tamaño del cuerpo por ruta,
 * rate limiting global y política de CORS restringida al propio origen.
 */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Archivos subidos por el panel de administración.
app.use('/uploads', express.static(config.uploadsDir));

// Sitio web estático
app.use(express.static(path.join(__dirname, 'public')));

// --- API --------------------------------------------------------------------
app.get('/api/salud', (req, res) => {
  res.json({ ok: true, servicio: 'cafeteria-origen', hora: new Date().toISOString() });
});

// Anti-CSRF: el sitio pide el token acá y toda petición que cambia estado
// tiene que traerlo (va antes de las rutas para cubrirlas a todas).
app.get('/api/csrf-token', entregarTokenCsrf);
app.use('/api', verificarCsrf);

app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/comentarios', comentariosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/_diagnostico', debugRoutes);

app.use('/api', rutaNoEncontrada);

app.use(manejadorErrores);

export default app;
