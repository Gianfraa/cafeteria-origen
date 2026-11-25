import express from 'express';
import * as comentarios from '../services/comentarios.service';
import { validarEnteroEnRango, validarId, validarTexto } from '../validacion';

const router = express.Router();
// Límites de las reseñas (los mismos que el formulario del sitio).
const LONGITUD_AUTOR = { min: 2, max: 40 };
const LONGITUD_TEXTO = { min: 3, max: 280 };

/**
 * GET /api/comentarios — reseñas públicas de la cafetería.
 * El sitio las pinta como texto (textContent), así que no ejecutan HTML.
 */
router.get('/', async (req, res, next) => {
  try {
    res.json({ comentarios: await comentarios.listar() });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/comentarios
 *
 * Se validan longitud y rango en el servidor; el token anti-CSRF lo verifica
 * middleware/csrf.ts y el sitio pinta las reseñas como texto (sin XSS).
 */
router.post('/', async (req, res, next) => {
  try {
    const { autor, texto, calificacion } = req.body || {};

    // Longitud y rango validados en el servidor (mismos límites que el formulario).
    const autorValido = validarTexto(autor, LONGITUD_AUTOR.min, LONGITUD_AUTOR.max);
    const textoValido = validarTexto(texto, LONGITUD_TEXTO.min, LONGITUD_TEXTO.max);
    const calificacionValida = validarEnteroEnRango(calificacion, 1, 5);
    if (!autorValido || !textoValido || !calificacionValida) {
      return res.status(400).json({
        error: 'Reseña inválida: nombre de 2 a 40 caracteres, texto de 3 a 280 y calificación de 1 a 5.',
      });
    }

    const comentario = await comentarios.crear({
      autor: autorValido,
      texto: textoValido,
      calificacion: calificacionValida,
    });
    res.status(201).json(comentario);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/comentarios/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = validarId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Id de comentario inválido.' });
    }
    // FALLA pendiente: sin verificación de rol, cualquiera puede borrar reseñas.
    const comentario = await comentarios.eliminar(id);
    if (!comentario) {
      return res.status(404).json({ error: 'Comentario no encontrado.' });
    }
    res.json(comentario);
  } catch (err) {
    next(err);
  }
});

export default router;
