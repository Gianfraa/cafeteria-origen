/* =============================================================================
   Cafetería Origen — lógica del sitio público
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var CARRITO_KEY = 'origen.carrito';

  var estado = {
    tipo: '',
    variedad: '',
    q: '',
    carrito: cargarCarrito(),
  };

  /* ---------------------------------------------------------------- utils */
  function $(sel) { return document.querySelector(sel); }

  function money(valor) {
    var n = Number(valor || 0);
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

  /**
   * Crea un elemento del DOM. Todo el texto entra con textContent y los
   * atributos con setAttribute: lo que venga del servidor o del usuario se
   * muestra siempre como texto, nunca se interpreta como HTML (evita el XSS).
   *
   *   crear('span', { className: 'tag', text: p.tipo })
   *   crear('div', { attrs: { 'data-id': 3 } }, [hijo1, 'texto', hijo2])
   */
  function crear(tag, opciones, hijos) {
    var nodo = document.createElement(tag);
    var op = opciones || {};
    if (op.className) nodo.className = op.className;
    if (op.text != null) nodo.textContent = String(op.text);
    if (op.attrs) {
      Object.keys(op.attrs).forEach(function (nombre) {
        nodo.setAttribute(nombre, String(op.attrs[nombre]));
      });
    }
    (hijos || []).forEach(function (hijo) {
      if (hijo == null) return;
      nodo.appendChild(typeof hijo === 'string' ? document.createTextNode(hijo) : hijo);
    });
    return nodo;
  }

  /** Párrafo de "lista vacía" que se usa en varias secciones. */
  function vacio(texto) {
    return crear('p', { className: 'empty', text: texto });
  }

  function api(url, opciones) {
    return fetch(API + url, opciones).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function postJSON(url, cuerpo) {
    return api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function guardarCarrito() {
    try {
      localStorage.setItem(CARRITO_KEY, JSON.stringify(estado.carrito));
    } catch (e) { /* almacenamiento no disponible */ }
  }

  function cargarCarrito() {
    try {
      return JSON.parse(localStorage.getItem(CARRITO_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  /* ------------------------------------------------------------- catálogo */
  function urlCatalogo() {
    var params = new URLSearchParams();
    if (estado.tipo) params.set('tipo', estado.tipo);
    if (estado.variedad) params.set('variedad', estado.variedad);
    if (estado.q) params.set('q', estado.q);
    var s = params.toString();
    return '/productos' + (s ? '?' + s : '');
  }

  function cargarProductos() {
    return api(urlCatalogo()).then(function (resp) {
      if (!resp.ok) {
        renderErrorProductos(resp.data && resp.data.error);
        return;
      }
      renderProductos(resp.data.productos);
      renderResultado(resp.data.filtros, resp.data.total);
    });
  }

  function renderProductos(productos) {
    var grid = $('#productos-grid');

    if (!productos || productos.length === 0) {
      grid.replaceChildren(vacio('No encontramos productos con esos filtros.'));
      return;
    }

    // Nombres y descripciones vienen de la base (el admin los puede cargar):
    // se insertan como texto, nunca como HTML.
    grid.replaceChildren.apply(grid, productos.map(function (p) {
      window.__productos[p.id] = p;
      var tags = [crear('span', { className: 'tag', text: p.tipo })];
      if (p.variedad) tags.push(crear('span', { className: 'tag tag-origen', text: p.variedad }));
      if (p.tamano) tags.push(crear('span', { className: 'tag', text: p.tamano }));

      return crear('article', { className: 'product-card' }, [
        crear('div', { className: 'product-top' }, [
          crear('h3', { className: 'product-name', text: p.nombre }),
          crear('span', { className: 'product-price', text: money(p.precio) }),
        ]),
        crear('div', { className: 'product-tags' }, tags),
        crear('p', { className: 'product-desc', text: p.descripcion }),
        crear('button', {
          className: 'btn btn-ghost btn-agregar',
          text: 'Agregar',
          attrs: { 'data-id': p.id },
        }),
      ]);
    }));
  }

  function renderResultado(filtros, total) {
    var el = $('#resultado-busqueda');

    // El texto buscado vuelve del servidor: se muestra como texto (XSS reflejado).
    if (filtros && filtros.q) {
      el.replaceChildren(
        'Resultados para ',
        crear('strong', { text: filtros.q }),
        ' — ' + total + ' producto(s)'
      );
    } else {
      el.textContent = total + ' producto(s) en el menú';
    }
  }

  function renderErrorProductos(mensaje) {
    $('#productos-grid').replaceChildren(
      vacio('No se pudo cargar el menú: ' + (mensaje || 'error desconocido'))
    );
  }

  /* --------------------------------------------------------------- carrito */
  function agregarAlCarrito(productoId) {
    var existente = null;
    for (var i = 0; i < estado.carrito.length; i++) {
      if (String(estado.carrito[i].id) === String(productoId)) existente = estado.carrito[i];
    }
    if (existente) {
      existente.cantidad += 1;
    } else {
      estado.carrito.push({
        id: productoId,
        nombre: window.__productos[productoId] ? window.__productos[productoId].nombre : 'Producto',
        precio: window.__productos[productoId] ? window.__productos[productoId].precio : 0,
        cantidad: 1,
      });
    }
    guardarCarrito();
    renderCarrito();
  }

  function cambiarCantidad(indice, delta) {
    var item = estado.carrito[indice];
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function quitarDelCarrito(indice) {
    estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function renderCarrito() {
    var cont = $('#carrito');
    var lista = $('#resumen-carrito');
    var total = 0;

    if (estado.carrito.length === 0) {
      cont.replaceChildren(vacio('El carrito está vacío.'));
      lista.replaceChildren();
      $('#resumen-total').textContent = money(0);
      return;
    }

    // El carrito sale de localStorage (lo puede editar cualquiera): todo como texto.
    cont.replaceChildren.apply(cont, estado.carrito.map(function (item, i) {
      var subtotal = item.precio * item.cantidad;
      total += subtotal;
      return crear('div', { className: 'cart-item' }, [
        crear('div', null, [
          crear('div', { className: 'cart-item-name', text: item.nombre }),
          crear('div', { className: 'cart-item-meta', text: money(item.precio) + ' c/u' }),
        ]),
        crear('div', { className: 'qty-control' }, [
          crear('button', { text: '−', attrs: { type: 'button', 'data-acc': 'menos', 'data-i': i } }),
          crear('span', { text: item.cantidad }),
          crear('button', { text: '+', attrs: { type: 'button', 'data-acc': 'mas', 'data-i': i } }),
        ]),
        crear('div', null, [
          crear('div', { className: 'cart-item-price', text: money(subtotal) }),
          crear('button', {
            className: 'link-danger',
            text: 'Quitar',
            attrs: { type: 'button', 'data-acc': 'quitar', 'data-i': i },
          }),
        ]),
      ]);
    }));

    lista.replaceChildren.apply(lista, estado.carrito.map(function (item) {
      return crear('li', null, [
        crear('span', { text: item.nombre + ' × ' + item.cantidad }),
        crear('span', { text: money(item.precio * item.cantidad) }),
      ]);
    }));

    $('#resumen-total').textContent = money(total);
  }

  /* ---------------------------------------------------------------- pedidos */
  function enviarPedido(evento) {
    evento.preventDefault();
    var feedback = $('#pedido-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Enviando…';

    postJSON('/pedidos', {
      mesa: $('#pedido-mesa').value,
      cliente: $('#pedido-cliente').value,
      items: estado.carrito.map(function (item) {
        return { productoId: item.id, cantidad: item.cantidad };
      }),
    }).then(function (resp) {
      if (!resp.ok) {
        feedback.className = 'form-feedback is-error';
        feedback.textContent = 'No pudimos enviar el pedido: ' + (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-ok';
      feedback.textContent = '¡Pedido #' + resp.data.id + ' recibido! Total ' + money(resp.data.total) +
        '. Te atendemos en la mesa ' + resp.data.mesa + '.';
      estado.carrito = [];
      guardarCarrito();
      renderCarrito();
      $('#form-pedido').reset();
    }).catch(function () {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = 'Error de conexión con el servidor.';
    });
  }

  /* --------------------------------------------------------------- reseñas */
  function cargarReseñas() {
    return api('/comentarios').then(function (resp) {
      var cont = $('#lista-resenas');
      if (!resp.ok || !resp.data.comentarios || resp.data.comentarios.length === 0) {
        cont.replaceChildren(vacio('Todavía no hay reseñas. ¡Sé el primero!'));
        return;
      }
      // Autor y texto vienen de la base y los escribió cualquier visitante:
      // se insertan como texto para que no se ejecuten (XSS almacenado).
      cont.replaceChildren.apply(cont, resp.data.comentarios.map(function (c) {
        var estrellas = '';
        var i;
        for (i = 0; i < Number(c.calificacion || 0); i++) estrellas += '★';
        return crear('article', { className: 'review' }, [
          crear('div', { className: 'review-head' }, [
            crear('span', { className: 'review-author', text: c.autor }),
            crear('span', { className: 'review-stars', text: estrellas }),
          ]),
          crear('p', { className: 'review-text', text: c.texto }),
        ]);
      }));
    });
  }

  function enviarReseña(evento) {
    evento.preventDefault();
    var feedback = $('#resena-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Publicando…';

    postJSON('/comentarios', {
      autor: $('#resena-autor').value,
      texto: $('#resena-texto').value,
      calificacion: Number($('#resena-calificacion').value),
    }).then(function (resp) {
      if (!resp.ok) {
        feedback.className = 'form-feedback is-error';
        feedback.textContent = 'No se pudo publicar: ' + (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-ok';
      feedback.textContent = '¡Gracias por tu reseña!';
      $('#form-resena').reset();
      cargarReseñas();
    });
  }

  /* ------------------------------------------------------------- listeners */
  function init() {
    window.__productos = {};

    // Filtros
    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        estado.tipo = chip.getAttribute('data-tipo');
        cargarProductos();
      });
    });

    $('#filtro-variedad').addEventListener('change', function (e) {
      estado.variedad = e.target.value;
      cargarProductos();
    });

    var temporizador = null;
    $('#filtro-busqueda').addEventListener('input', function (e) {
      estado.q = e.target.value;
      clearTimeout(temporizador);
      temporizador = setTimeout(cargarProductos, 250);
    });

    // Carrito (delegación de eventos)
    $('#productos-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-agregar');
      if (!btn) return;
      agregarAlCarrito(btn.getAttribute('data-id'));
    });

    $('#carrito').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var i = Number(btn.getAttribute('data-i'));
      var accion = btn.getAttribute('data-acc');
      if (accion === 'mas') cambiarCantidad(i, 1);
      else if (accion === 'menos') cambiarCantidad(i, -1);
      else if (accion === 'quitar') quitarDelCarrito(i);
    });

    $('#form-pedido').addEventListener('submit', enviarPedido);
    $('#form-resena').addEventListener('submit', enviarReseña);

    // Carga inicial
    api(urlCatalogo()).then(function (resp) {
      if (resp.ok) {
        (resp.data.productos || []).forEach(function (p) { window.__productos[p.id] = p; });
        renderProductos(resp.data.productos);
        renderResultado(resp.data.filtros, resp.data.total);
      } else {
        renderErrorProductos(resp.data.error);
      }
    });
    cargarReseñas();
    renderCarrito();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
