import express from 'express';
import * as pedidos from '../services/pedidos.service';
import { validarEnteroEnRango, validarId, validarTexto } from '../validacion';

const router = express.Router();
const MAX_ITEMS = 20;
const MAX_CANTIDAD = 50;
const ESTADOS_PERMITIDOS = ['abierto', 'preparando', 'listo', 'entregado'];

/**
 * POST /api/pedidos
 * Crea un pedido y devuelve su total calculado.
 * Mesa, cliente, items y cantidades se validan en el servidor (tipo, rango y longitud).
 *
 * FALLAS pendientes:
 *  - CSRF: no hay token anti-CSRF ni verificación de Origin/Referer.
 *  - No requiere autenticación ni rol.
 */
router.post('/', async (req, res, next) => {
  try {
    const { mesa, cliente, items } = req.body || {};

    const mesaValida = validarTexto(mesa, 1, 10);
    const clienteValido = validarTexto(cliente, 2, 40);
    if (!mesaValida || !clienteValido) {
      return res.status(400).json({ error: 'La mesa o el nombre del cliente no son válidos.' });
    }

    if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS) {
      return res.status(400).json({ error: `El pedido debe tener entre 1 y ${MAX_ITEMS} productos.` });
    }

    const itemsValidos: pedidos.ItemPedido[] = [];
    for (const item of items) {
      const productoId = validarId(item?.productoId);
      const cantidad = validarEnteroEnRango(item?.cantidad, 1, MAX_CANTIDAD);
      if (!productoId || !cantidad) {
        return res.status(400).json({
          error: `Cada producto necesita un id válido y una cantidad entera entre 1 y ${MAX_CANTIDAD}.`,
        });
      }
      itemsValidos.push({ productoId, cantidad });
    }

    const pedido = await pedidos.crear({ mesa: mesaValida, cliente: clienteValido, items: itemsValidos });
    res.status(201).json(pedido);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pedidos?mesa=
 * Lista los pedidos de todas las mesas.
 *
 * FALLA — Inyección SQL en el filtro de mesa.
 * FALLA — Autorización: cualquier visitante puede ver los pedidos de TODAS
 * las mesas (los datos de los clientes de los demás).
 */
router.get('/', async (req, res, next) => {
  try {
    res.json({ pedidos: await pedidos.listar(req.query.mesa as string | undefined) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pedidos/:id
 * FALLA — IDOR: no se verifica que el pedido pertenezca al usuario que pregunta.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = validarId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Id de pedido inválido.' });
    }
    const pedido = await pedidos.obtenerConItems(id);
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/pedidos/:id/estado
 * El id se valida como entero y el estado contra una lista blanca.
 * FALLA pendiente: no se comprueba el rol del que modifica el pedido.
 */
router.patch('/:id/estado', async (req, res, next) => {
  try {
    const id = validarId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Id de pedido inválido.' });
    }
    const { estado } = req.body || {};
    if (!ESTADOS_PERMITIDOS.includes(estado)) {
      return res.status(400).json({ error: 'Estado de pedido inválido.' });
    }
    const pedido = await pedidos.cambiarEstado(id, estado);
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

export default router;
