/* =============================================================================
   Cafetería Origen — lógica del panel de administración
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var usuario = null;
  var productosCache = {};

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function money(valor) {
    return Number(valor || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

  /** Pestañas válidas del panel (lista blanca para el parámetro ?vista=). */
  var VISTAS = ['resumen', 'pedidos', 'productos', 'reportes', 'usuarios', 'herramientas'];

  /**
   * Crea un elemento del DOM. El texto entra con textContent y los atributos
   * con setAttribute: lo que venga del servidor o de la URL se muestra siempre
   * como texto, nunca se interpreta como HTML (evita el XSS).
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

  /** Párrafo de "lista vacía". */
  function vacio(texto) {
    return crear('p', { className: 'empty', text: texto });
  }

  /** Reemplaza el contenido de un contenedor por una lista de nodos. */
  function pintar(contenedor, nodos) {
    contenedor.replaceChildren.apply(contenedor, nodos);
  }

  /** Arma un <thead> con una fila de encabezados. Cada columna: 'Texto' o ['Texto', 'clase']. */
  function encabezado(columnas) {
    return crear('thead', null, [
      crear('tr', null, columnas.map(function (c) {
        return Array.isArray(c) ? crear('th', { className: c[1], text: c[0] }) : crear('th', { text: c });
      })),
    ]);
  }

  /** Arma un <select> con las opciones dadas y marca la actual. */
  function selector(clase, atributos, opciones, actual) {
    return crear('select', { className: clase, attrs: atributos }, opciones.map(function (valor) {
      var opcion = crear('option', { text: valor, attrs: { value: valor } });
      if (valor === actual) opcion.selected = true;
      return opcion;
    }));
  }

  /** Pinta una grilla de KPIs ({ label, value }) como texto. */
  function pintarKpis(contenedor, kpis) {
    pintar(contenedor, kpis.map(function (k) {
      return crear('div', { className: 'kpi' }, [
        crear('div', { className: 'kpi-label', text: k.label }),
        crear('div', { className: 'kpi-value', text: k.value }),
      ]);
    }));
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

  function putJSON(url, cuerpo) {
    return api(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function patchJSON(url, cuerpo) {
    return api(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function feedback(el, mensaje, ok) {
    el.className = 'form-feedback ' + (ok ? 'is-ok' : 'is-error');
    el.textContent = mensaje;
  }

  /* ------------------------------------------------------------------ login */
  function iniciarSesion(evento) {
    evento.preventDefault();
    var caja = $('#login-feedback');
    caja.className = 'form-feedback';

    postJSON('/auth/login', {
      username: $('#login-usuario').value,
      password: $('#login-password').value,
    }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No pudimos iniciar sesión: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      usuario = resp.data.usuario;
      mostrarPanel();
    });
  }

  function cerrarSesion() {
    postJSON('/auth/logout', {}).then(function () {
      usuario = null;
      $('#vista-login').hidden = false;
      $('#vista-panel').hidden = true;
      $('#admin-user').replaceChildren();
    });
  }

  function mostrarPanel() {
    $('#vista-login').hidden = true;
    $('#vista-panel').hidden = false;
    $('#admin-user').replaceChildren(
      'Sesión de ',
      crear('strong', { text: usuario.nombre }),
      ' · rol: ',
      crear('strong', { text: usuario.rol })
    );
    $('#panel-bienvenida').textContent = 'Hola, ' + usuario.nombre;
    cargarTodo();
  }

  function cargarTodo() {
    cargarResumen();
    cargarPedidos();
    cargarProductos();
    cargarReportes();
    cargarUsuarios();
  }

  /* ---------------------------------------------------------------- resumen */
  function cargarResumen() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/mas-vendido').then(function (m) {
        api('/reportes/cantidad-vendida').then(function (c) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación total', value: money(f.data.facturado) },
            { label: 'Pedidos registrados', value: f.data.pedidos },
            {
              label: 'Producto más vendido',
              value: mas ? mas.nombre : '—',
            },
            {
              label: 'Unidades por tipo',
              value: Object.keys(c.data.cantidadVendida || {})
                .map(function (k) { return k + ': ' + c.data.cantidadVendida[k]; })
                .join(' · ') || '—',
            },
          ];

          pintarKpis($('#kpis'), kpis);
        });
      });
    });
  }

  /* --------------------------------------------------------------- pedidos */
  /** Devuelve los nodos de la tabla de pedidos ([thead, tbody]) o un aviso de vacío. */
  function tablaPedidos(filas, conAcciones) {
    if (!filas || filas.length === 0) return [vacio('No hay pedidos.')];

    var columnas = ['#', 'Mesa', 'Cliente', 'Estado', ['Total', 'num'], 'Fecha'];
    if (conAcciones) columnas.push('Acciones');

    var cuerpo = crear('tbody', null, filas.map(function (p) {
      return crear('tr', null, [
        crear('td', { text: p.id }),
        crear('td', { text: p.mesa }),
        crear('td', { text: p.cliente }),
        crear('td', null, [crear('span', { className: 'badge badge-' + p.estado, text: p.estado })]),
        crear('td', { className: 'num', text: money(p.total) }),
        crear('td', { text: new Date(p.creado_en).toLocaleString('es-AR') }),
        conAcciones
          ? crear('td', null, [
            selector('sel-estado', { 'data-pedido': p.id }, ['abierto', 'preparando', 'listo', 'entregado'], p.estado),
          ])
          : null,
      ]);
    }));

    return [encabezado(columnas), cuerpo];
  }

  function cargarPedidos() {
    api('/pedidos').then(function (resp) {
      var pedidos = resp.data.pedidos || [];
      pintar($('#tabla-pedidos'), tablaPedidos(pedidos, true));
      pintar($('#tabla-ultimos'), tablaPedidos(pedidos.slice(0, 5), false));
    });
  }

  function cambiarEstado(evento) {
    var select = evento.target.closest('.sel-estado');
    if (!select) return;
    var id = select.getAttribute('data-pedido');
    patchJSON('/pedidos/' + id + '/estado', { estado: select.value }).then(function (resp) {
      if (!resp.ok) {
        alert('No se pudo cambiar el estado: ' + (resp.data.error || 'error'));
      }
      cargarPedidos();
    });
  }

  /* ------------------------------------------------------------- productos */
  function cargarProductos() {
    api('/productos').then(function (resp) {
      var productos = resp.data.productos || [];
      productosCache = {};

      var cuerpo = crear('tbody', null, productos.map(function (p) {
        productosCache[p.id] = p;
        return crear('tr', null, [
          crear('td', { text: p.id }),
          crear('td', { text: p.nombre }),
          crear('td', { text: p.tipo }),
          crear('td', { text: p.variedad || '—' }),
          crear('td', { className: 'num', text: money(p.precio) }),
          crear('td', null, [
            crear('button', { className: 'link-danger', text: 'Borrar', attrs: { 'data-borrar': p.id } }),
          ]),
        ]);
      }));

      pintar($('#tabla-productos'), [
        encabezado(['#', 'Nombre', 'Tipo', 'Origen', ['Precio', 'num'], 'Acciones']),
        cuerpo,
      ]);
    });
  }

  function guardarProducto(evento) {
    evento.preventDefault();
    var caja = $('#producto-feedback');
    var id = $('#producto-id').value;

    var cuerpo = {
      nombre: $('#p-nombre').value,
      tipo: $('#p-tipo').value,
      variedad: $('#p-variedad').value || null,
      tamano: $('#p-tamano').value || null,
      gramos: $('#p-gramos').value ? Number($('#p-gramos').value) : null,
      precio_base: Number($('#p-precio-base').value || 0),
      precio_por_gramo: Number($('#p-precio-gramo').value || 0),
      descripcion: $('#p-descripcion').value,
    };

    var peticion = id ? putJSON('/admin/productos/' + id, cuerpo) : postJSON('/admin/productos', cuerpo);

    peticion.then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo guardar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Producto guardado correctamente.', true);
      $('#form-producto').reset();
      $('#producto-id').value = '';
      cargarProductos();
    });
  }

  function borrarProducto(evento) {
    var btn = evento.target.closest('[data-borrar]');
    if (!btn) return;
    var id = btn.getAttribute('data-borrar');
    if (!confirm('¿Borrar el producto #' + id + '?')) return;

    api('/admin/productos/' + id, { method: 'DELETE' }).then(function (resp) {
      if (!resp.ok) alert('No se pudo borrar: ' + (resp.data.error || 'error'));
      cargarProductos();
    });
  }

  function limpiarFormularioProducto() {
    $('#form-producto').reset();
    $('#producto-id').value = '';
  }

  /* ---------------------------------------------------------------- upload */
  function subirArchivo(evento) {
    evento.preventDefault();
    var caja = $('#upload-feedback');
    var input = $('#archivo-subida');
    if (!input.files || !input.files[0]) {
      feedback(caja, 'Elegí un archivo primero.', false);
      return;
    }

    var archivo = input.files[0];
    var lector = new FileReader();

    lector.onload = function () {
      var base64 = String(lector.result).split(',')[1] || '';
      postJSON('/admin/subir-archivo', {
        nombre: archivo.name,
        contenidoBase64: base64,
      }).then(function (resp) {
        if (!resp.ok) {
          feedback(caja, 'No se pudo subir: ' + (resp.data.error || 'error desconocido'), false);
          return;
        }
        feedback(caja, 'Archivo subido a ' + resp.data.url, true);
      });
    };

    lector.readAsDataURL(archivo);
  }

  /* -------------------------------------------------------------- reportes */
  function cargarReportes() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/ticket-promedio').then(function (t) {
        api('/reportes/mas-vendido').then(function (m) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación', value: money(f.data.facturado) },
            { label: 'Pedidos', value: f.data.pedidos },
            { label: 'Ticket promedio', value: money(t.data.promedio) },
            { label: 'Más vendido', value: mas ? mas.nombre + ' (' + mas.unidades + ')' : '—' },
          ];
          pintarKpis($('#kpis-reportes'), kpis);
        });
      });
    });
  }

  function consultarVentas() {
    var caja = $('#reporte-feedback');
    var variedad = $('#reporte-variedad').value;

    api('/reportes/ventas-por-variedad?variedad=' + encodeURIComponent(variedad)).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'Error: ' + (resp.data.error || 'desconocido'), false);
        $('#tabla-ventas').replaceChildren();
        return;
      }
      var ventas = resp.data.ventas || [];
      var cuerpo = crear('tbody', null, ventas.map(function (v) {
        return crear('tr', null, [
          crear('td', { text: v.variedad }),
          crear('td', { text: v.nombre }),
          crear('td', { className: 'num', text: v.unidades }),
          crear('td', { className: 'num', text: money(v.total) }),
        ]);
      }));
      pintar($('#tabla-ventas'), [
        encabezado(['Origen', 'Producto', ['Unidades', 'num'], ['Total', 'num']]),
        cuerpo,
      ]);
      feedback(caja, 'Consulta realizada.', true);
    });
  }

  /* -------------------------------------------------------------- usuarios */
  function cargarUsuarios() {
    api('/admin/usuarios').then(function (resp) {
      var usuarios = resp.data.usuarios || [];
      var cuerpo = crear('tbody', null, usuarios.map(function (u) {
        return crear('tr', null, [
          crear('td', { text: u.id }),
          crear('td', { text: u.username }),
          crear('td', { text: u.nombre }),
          crear('td', null, [
            crear('span', { className: 'badge' + (u.rol === 'admin' ? ' badge-admin' : ''), text: u.rol }),
          ]),
          crear('td', null, [
            selector('sel-rol', { 'data-usuario': u.id }, ['cliente', 'mozo', 'barista', 'admin'], u.rol),
          ]),
        ]);
      }));
      pintar($('#tabla-usuarios'), [
        encabezado(['#', 'Usuario', 'Nombre', 'Rol', 'Acciones']),
        cuerpo,
      ]);
    });
  }

  function cambiarRol(evento) {
    var select = evento.target.closest('.sel-rol');
    if (!select) return;
    var id = select.getAttribute('data-usuario');

    putJSON('/admin/usuarios/' + id, { rol: select.value }).then(function (resp) {
      if (!resp.ok) alert('No se pudo actualizar: ' + (resp.data.error || 'error'));
      cargarUsuarios();
    });
  }

  function cambiarPassword(evento) {
    evento.preventDefault();
    var caja = $('#password-feedback');
    postJSON('/admin/cambiar-contrasena', { nueva: $('#nueva-password').value }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo cambiar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Contraseña actualizada.', true);
      $('#nueva-password').value = '';
    });
  }

  /* ----------------------------------------------------------- herramientas */
  function probarConexion(evento) {
    evento.preventDefault();
    var salida = $('#salida-conexion');
    salida.textContent = 'Probando…';

    postJSON('/admin/probar-conexion', { host: $('#conexion-host').value }).then(function (resp) {
      if (!resp.ok) {
        salida.textContent = 'Error: ' + (resp.data.error || 'desconocido');
        return;
      }
      salida.textContent =
        '$ ' + resp.data.comando + '\n\n' +
        (resp.data.salida || '') +
        (resp.data.error ? '\n[stderr]\n' + resp.data.error : '');
    });
  }

  function verDiagnostico() {
    var salida = $('#salida-diagnostico');
    salida.textContent = 'Cargando…';
    api('/_diagnostico').then(function (resp) {
      salida.textContent = JSON.stringify(resp.data, null, 2);
    });
  }

  /* ------------------------------------------------------------------ tabs */
  /** Activa la pestaña y el panel de la vista indicada. */
  function mostrarVista(vista) {
    $$('.tab').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-vista') === vista);
    });
    $$('.tab-panel').forEach(function (p) {
      p.classList.toggle('is-active', p.getAttribute('data-panel') === vista);
    });
  }

  function activarTab(evento) {
    var tab = evento.target.closest('.tab');
    if (!tab) return;
    mostrarVista(tab.getAttribute('data-vista'));
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    // ?vista= viene de la URL (la controla quien arma el link): sólo se usa si
    // está en la lista blanca de pestañas, y nunca se inserta en la página.
    var params = new URLSearchParams(window.location.search);
    var objetivo = params.get('vista');
    if (objetivo && VISTAS.indexOf(objetivo) !== -1) {
      mostrarVista(objetivo);
    }

    $('#form-login').addEventListener('submit', iniciarSesion);
    $('#btn-logout').addEventListener('click', cerrarSesion);
    $('#btn-refrescar').addEventListener('click', cargarTodo);
    $('#tabs').addEventListener('click', activarTab);
    $('#tabla-pedidos').addEventListener('change', cambiarEstado);
    $('#tabla-productos').addEventListener('click', borrarProducto);
    $('#form-producto').addEventListener('submit', guardarProducto);
    $('#btn-limpiar-producto').addEventListener('click', limpiarFormularioProducto);
    $('#form-upload').addEventListener('submit', subirArchivo);
    $('#form-password').addEventListener('submit', cambiarPassword);
    $('#btn-reporte-variedad').addEventListener('click', consultarVentas);
    $('#tabla-usuarios').addEventListener('change', cambiarRol);
    $('#form-conexion').addEventListener('submit', probarConexion);
    $('#btn-diagnostico').addEventListener('click', verDiagnostico);

    // ¿Ya hay sesión?
    api('/auth/yo').then(function (resp) {
      if (resp.ok) {
        usuario = resp.data.usuario;
        mostrarPanel();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
