// src/store.js
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  ensureDir();
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    writeJson(file, fallback);
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(full, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir();
  const full = path.join(DATA_DIR, file);
  const tmp = full + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, full);
}

function nowIso() {
  return new Date().toISOString();
}

function nextId(list) {
  const max = list.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0);
  return max + 1;
}

function err(status, message, detail = null) {
  const e = new Error(message);
  e.status = status;
  e.detail = detail;
  return e;
}

function createStore() {
  const files = {
    autores: "autores.json",
    editoriales: "editoriales.json",
    libros: "libros.json",
    libros_autores: "libros_autores.json",
    ediciones: "ediciones.json",
    ejemplares: "ejemplares.json",
    usuarios: "usuarios.json",
    prestamos: "prestamos.json",
    prestamos_items: "prestamos_items.json",
    reservas: "reservas.json"
  };

  const s = {
    autores: readJson(files.autores, []),
    editoriales: readJson(files.editoriales, []),
    libros: readJson(files.libros, []),
    libros_autores: readJson(files.libros_autores, []), // { libro_id, autor_id, orden_autoria, rol }
    ediciones: readJson(files.ediciones, []), // { id, libro_id, editorial_id, ... }
    ejemplares: readJson(files.ejemplares, []), // { id, edicion_id, codigo_barras, ubicacion, estado, fecha_alta }
    usuarios: readJson(files.usuarios, []), // { id, nombre, tipo, activo, ... }
    prestamos: readJson(files.prestamos, []), // { id, usuario_id, fecha_prestamo, estado, observaciones }
    prestamos_items: readJson(files.prestamos_items, []), // { prestamo_id, ejemplar_id, fecha_vencimiento, estado, ... }
    reservas: readJson(files.reservas, []) // { id, usuario_id, libro_id, fecha_reserva, expira_en, estado }
  };

  // Lock para escrituras (evita corrupción si llegan varias requests al mismo tiempo)
  let lock = Promise.resolve();
  function withWriteLock(fn) {
    lock = lock.then(fn, fn);
    return lock;
  }

  function persist(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) {
      if (!files[k]) continue;
      writeJson(files[k], s[k]);
    }
  }

  // -----------------------------
  // Lookups / helpers
  // -----------------------------
  const findById = (arr, id) => arr.find((x) => Number(x.id) === Number(id));
  const existsById = (arr, id) => !!findById(arr, id);

  function normalizeQ(q) {
    return String(q || "").trim().toLowerCase();
  }

  function isActiveUser(user) {
    return user && Number(user.activo) === 1;
  }

  // -----------------------------
  // AUTORES
  // -----------------------------
  function listAutores(q = "") {
    const sQ = normalizeQ(q);
    return s.autores
      .filter((a) => {
        if (!sQ) return true;
        return (
          String(a.nombre || "").toLowerCase().includes(sQ) ||
          String(a.nacionalidad || "").toLowerCase().includes(sQ)
        );
      })
      .slice()
      .sort((a, b) => b.id - a.id);
  }

  function createAutor(payload) {
    const nombre = String(payload.nombre || "").trim();
    if (nombre.length < 2) throw err(400, "Nombre de autor requerido.");

    const a = {
      id: nextId(s.autores),
      nombre,
      nacionalidad: payload.nacionalidad ?? null,
      bibliografia: payload.bibliografia ?? null,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    s.autores.push(a);
    persist("autores");
    return a;
  }

  function updateAutor(id, payload) {
    const a = findById(s.autores, id);
    if (!a) throw err(404, "Autor no encontrado.");

    const nombre = String(payload.nombre || "").trim();
    if (nombre.length < 2) throw err(400, "Nombre requerido.");

    a.nombre = nombre;
    a.nacionalidad = payload.nacionalidad ?? null;
    a.bibliografia = payload.bibliografia ?? null;
    a.updated_at = nowIso();

    persist("autores");
    return a;
  }

  function deleteAutor(id) {
    const used = s.libros_autores.some((x) => Number(x.autor_id) === Number(id));
    if (used) throw err(409, "No se puede eliminar: autor asignado a libro(s).");

    const before = s.autores.length;
    s.autores = s.autores.filter((x) => Number(x.id) !== Number(id));
    persist("autores");
    return before !== s.autores.length;
  }

  // -----------------------------
  // EDITORIALES
  // -----------------------------
  function listEditoriales(q = "") {
    const sQ = normalizeQ(q);
    return s.editoriales
      .filter((e) => {
        if (!sQ) return true;
        return (
          String(e.nombre || "").toLowerCase().includes(sQ) ||
          String(e.email || "").toLowerCase().includes(sQ)
        );
      })
      .slice()
      .sort((a, b) => b.id - a.id);
  }

  function createEditorial(payload) {
    const nombre = String(payload.nombre || "").trim();
    if (nombre.length < 2) throw err(400, "Nombre de editorial requerido.");

    const e = {
      id: nextId(s.editoriales),
      nombre,
      direccion: payload.direccion ?? null,
      telefono: payload.telefono ?? null,
      email: payload.email ?? null,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    s.editoriales.push(e);
    persist("editoriales");
    return e;
  }

  function updateEditorial(id, payload) {
    const e = findById(s.editoriales, id);
    if (!e) throw err(404, "Editorial no encontrada.");

    const nombre = String(payload.nombre || "").trim();
    if (nombre.length < 2) throw err(400, "Nombre requerido.");

    e.nombre = nombre;
    e.direccion = payload.direccion ?? null;
    e.telefono = payload.telefono ?? null;
    e.email = payload.email ?? null;
    e.updated_at = nowIso();

    persist("editoriales");
    return e;
  }

  function deleteEditorial(id) {
    const used = s.ediciones.some((x) => Number(x.editorial_id) === Number(id));
    if (used) throw err(409, "No se puede eliminar: editorial usada en edición(es).");

    const before = s.editoriales.length;
    s.editoriales = s.editoriales.filter((x) => Number(x.id) !== Number(id));
    persist("editoriales");
    return before !== s.editoriales.length;
  }

  // -----------------------------
  // USUARIOS
  // -----------------------------
  function listUsuarios(q = "") {
    const sQ = normalizeQ(q);
    return s.usuarios
      .filter((u) => {
        if (!sQ) return true;
        return (
          String(u.nombre || "").toLowerCase().includes(sQ) ||
          String(u.email || "").toLowerCase().includes(sQ)
        );
      })
      .slice()
      .sort((a, b) => b.id - a.id);
  }

  function createUsuario(payload) {
    const nombre = String(payload.nombre || "").trim();
    if (nombre.length < 2) throw err(400, "Nombre requerido.");

    const u = {
      id: nextId(s.usuarios),
      nombre,
      email: payload.email ?? null,
      telefono: payload.telefono ?? null,
      direccion: payload.direccion ?? null,
      tipo: payload.tipo ?? "alumno",
      activo: typeof payload.activo === "number" ? payload.activo : 1,
      fecha_registro: nowIso(),
      updated_at: nowIso()
    };
    s.usuarios.push(u);
    persist("usuarios");
    return u;
  }

  function updateUsuario(id, payload) {
    const u = findById(s.usuarios, id);
    if (!u) throw err(404, "Usuario no encontrado.");

    const nombre = String(payload.nombre || "").trim();
    if (nombre.length < 2) throw err(400, "Nombre requerido.");

    u.nombre = nombre;
    u.email = payload.email ?? null;
    u.telefono = payload.telefono ?? null;
    u.direccion = payload.direccion ?? null;
    u.tipo = payload.tipo ?? "alumno";
    u.activo = typeof payload.activo === "number" ? payload.activo : 1;
    u.updated_at = nowIso();

    persist("usuarios");
    return u;
  }

  function deactivateUsuario(id) {
    const u = findById(s.usuarios, id);
    if (!u) throw err(404, "Usuario no encontrado.");

    u.activo = 0;
    u.updated_at = nowIso();

    persist("usuarios");
    return u;
  }

  // -----------------------------
  // LIBROS + RELACIÓN LIBRO_AUTOR
  // -----------------------------
  function listLibros(q = "") {
    const sQ = normalizeQ(q);

    const autoresById = new Map(s.autores.map((a) => [a.id, a]));
    const relByLibro = new Map();
    for (const la of s.libros_autores) {
      const arr = relByLibro.get(la.libro_id) || [];
      arr.push(la);
      relByLibro.set(la.libro_id, arr);
    }

    const edicionesByLibro = new Map();
    for (const ed of s.ediciones) {
      const arr = edicionesByLibro.get(ed.libro_id) || [];
      arr.push(ed);
      edicionesByLibro.set(ed.libro_id, arr);
    }

    const ejemplaresByEdicion = new Map();
    for (const ej of s.ejemplares) {
      const arr = ejemplaresByEdicion.get(ej.edicion_id) || [];
      arr.push(ej);
      ejemplaresByEdicion.set(ej.edicion_id, arr);
    }

    function autoresLabel(libroId) {
      const rel = (relByLibro.get(libroId) || [])
        .slice()
        .sort((a, b) => (a.orden_autoria ?? 9999) - (b.orden_autoria ?? 9999));
      const names = rel
        .map((r) => autoresById.get(r.autor_id)?.nombre)
        .filter(Boolean);
      return names.length ? names.join(", ") : "—";
    }

    function ejemplaresStats(libroId) {
      const eds = edicionesByLibro.get(libroId) || [];
      let total = 0;
      let disponibles = 0;
      for (const ed of eds) {
        const ex = ejemplaresByEdicion.get(ed.id) || [];
        total += ex.length;
        disponibles += ex.filter((x) => x.estado === "disponible").length;
      }
      return { total, disponibles };
    }

    return s.libros
      .filter((l) => {
        if (!sQ) return true;
        return (
          String(l.titulo || "").toLowerCase().includes(sQ) ||
          String(l.isbn || "").toLowerCase().includes(sQ) ||
          String(l.genero || "").toLowerCase().includes(sQ)
        );
      })
      .slice()
      .sort((a, b) => b.id - a.id)
      .map((l) => {
        const st = ejemplaresStats(l.id);
        return {
          ...l,
          autores: autoresLabel(l.id),
          total_ejemplares: st.total,
          disponibles: st.disponibles
        };
      });
  }

  function getLibroDetail(id) {
    const libro = findById(s.libros, id);
    if (!libro) throw err(404, "Libro no encontrado.");

    const autoresById = new Map(s.autores.map((a) => [a.id, a]));
    const editorialById = new Map(s.editoriales.map((e) => [e.id, e]));

    const autores = s.libros_autores
      .filter((x) => Number(x.libro_id) === Number(id))
      .map((x) => {
        const a = autoresById.get(x.autor_id);
        if (!a) return null;
        return {
          id: a.id,
          nombre: a.nombre,
          orden_autoria: x.orden_autoria ?? null,
          rol: x.rol ?? null
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.orden_autoria ?? 9999) - (b.orden_autoria ?? 9999));

    const ediciones = s.ediciones
      .filter((e) => Number(e.libro_id) === Number(id))
      .slice()
      .sort((a, b) => b.id - a.id)
      .map((e) => {
        const pub = editorialById.get(e.editorial_id);
        const ex = s.ejemplares.filter((j) => Number(j.edicion_id) === Number(e.id));
        const total = ex.length;
        const disponibles = ex.filter((j) => j.estado === "disponible").length;

        return {
          ...e,
          editorial_nombre: pub?.nombre || "—",
          total_ejemplares: total,
          disponibles
        };
      });

    return { libro, autores, ediciones };
  }

  function createLibro(payload) {
    const titulo = String(payload.titulo || "").trim();
    if (titulo.length < 2) throw err(400, "Título requerido.");

    const l = {
      id: nextId(s.libros),
      titulo,
      isbn: payload.isbn ?? null,
      genero: payload.genero ?? null,
      idioma: payload.idioma ?? null,
      paginas: payload.paginas ?? null,
      fecha_publicacion: payload.fecha_publicacion ?? null,
      descripcion: payload.descripcion ?? null,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    s.libros.push(l);
    persist("libros");
    return l;
  }

  function updateLibro(id, payload) {
    const l = findById(s.libros, id);
    if (!l) throw err(404, "Libro no encontrado.");

    const titulo = String(payload.titulo || "").trim();
    if (titulo.length < 2) throw err(400, "Título requerido.");

    l.titulo = titulo;
    l.isbn = payload.isbn ?? null;
    l.genero = payload.genero ?? null;
    l.idioma = payload.idioma ?? null;
    l.paginas = payload.paginas ?? null;
    l.fecha_publicacion = payload.fecha_publicacion ?? null;
    l.descripcion = payload.descripcion ?? null;
    l.updated_at = nowIso();

    persist("libros");
    return l;
  }

  function deleteLibro(id) {
    const hasEd = s.ediciones.some((e) => Number(e.libro_id) === Number(id));
    if (hasEd) throw err(409, "No se puede eliminar: tiene ediciones/ejemplares.");

    const activeRes = s.reservas.some(
      (r) => Number(r.libro_id) === Number(id) && r.estado === "activa"
    );
    if (activeRes) throw err(409, "No se puede eliminar: tiene reservas activas.");

    s.libros_autores = s.libros_autores.filter((x) => Number(x.libro_id) !== Number(id));
    const before = s.libros.length;
    s.libros = s.libros.filter((x) => Number(x.id) !== Number(id));

    persist(["libros", "libros_autores"]);
    return before !== s.libros.length;
  }

  function replaceLibroAutores(libroId, autores) {
    if (!existsById(s.libros, libroId)) throw err(404, "Libro no encontrado.");

    const list = Array.isArray(autores) ? autores : [];
    for (const a of list) {
      const autorId = Number(a.autor_id);
      if (!autorId || !existsById(s.autores, autorId)) throw err(400, "Autor inválido.");
    }

    s.libros_autores = s.libros_autores.filter((x) => Number(x.libro_id) !== Number(libroId));
    for (const a of list) {
      s.libros_autores.push({
        libro_id: Number(libroId),
        autor_id: Number(a.autor_id),
        orden_autoria: a.orden_autoria ?? null,
        rol: a.rol ?? null
      });
    }

    persist("libros_autores");
    return true;
  }

  // -----------------------------
  // EDICIONES
  // -----------------------------
  function listEdiciones(libroId = 0) {
    const id = Number(libroId || 0);

    const libroById = new Map(s.libros.map((l) => [l.id, l]));
    const editorialById = new Map(s.editoriales.map((e) => [e.id, e]));

    return s.ediciones
      .filter((e) => !id || Number(e.libro_id) === id)
      .slice()
      .sort((a, b) => b.id - a.id)
      .map((e) => {
        const libro = libroById.get(e.libro_id);
        const pub = editorialById.get(e.editorial_id);
        return {
          ...e,
          libro_titulo: libro?.titulo || "—",
          editorial_nombre: pub?.nombre || "—"
        };
      });
  }

  function createEdicion(payload) {
    const libro_id = Number(payload.libro_id);
    const editorial_id = Number(payload.editorial_id);
    if (!existsById(s.libros, libro_id)) throw err(400, "libro_id inválido.");
    if (!existsById(s.editoriales, editorial_id)) throw err(400, "editorial_id inválido.");

    const e = {
      id: nextId(s.ediciones),
      libro_id,
      editorial_id,
      num_edicion: payload.num_edicion ?? null,
      fecha_lanzamiento: payload.fecha_lanzamiento ?? null,
      lugar_publicacion: payload.lugar_publicacion ?? null,
      isbn_edicion: payload.isbn_edicion ?? null,
      created_at: nowIso(),
      updated_at: nowIso()
    };

    s.ediciones.push(e);
    persist("ediciones");
    return e;
  }

  function updateEdicion(id, payload) {
    const e = findById(s.ediciones, id);
    if (!e) throw err(404, "Edición no encontrada.");

    const libro_id = Number(payload.libro_id);
    const editorial_id = Number(payload.editorial_id);
    if (!existsById(s.libros, libro_id)) throw err(400, "libro_id inválido.");
    if (!existsById(s.editoriales, editorial_id)) throw err(400, "editorial_id inválido.");

    e.libro_id = libro_id;
    e.editorial_id = editorial_id;
    e.num_edicion = payload.num_edicion ?? null;
    e.fecha_lanzamiento = payload.fecha_lanzamiento ?? null;
    e.lugar_publicacion = payload.lugar_publicacion ?? null;
    e.isbn_edicion = payload.isbn_edicion ?? null;
    e.updated_at = nowIso();

    persist("ediciones");
    return e;
  }

  function deleteEdicion(id) {
    const used = s.ejemplares.some((j) => Number(j.edicion_id) === Number(id));
    if (used) throw err(409, "No se puede eliminar: edición tiene ejemplares.");

    const before = s.ediciones.length;
    s.ediciones = s.ediciones.filter((x) => Number(x.id) !== Number(id));
    persist("ediciones");
    return before !== s.ediciones.length;
  }

  // -----------------------------
  // EJEMPLARES
  // -----------------------------
  function listEjemplares(q = "", estado = "") {
    const sQ = normalizeQ(q);
    const est = String(estado || "").trim();

    const edById = new Map(s.ediciones.map((e) => [e.id, e]));
    const libroById = new Map(s.libros.map((l) => [l.id, l]));
    const editorialById = new Map(s.editoriales.map((e) => [e.id, e]));

    return s.ejemplares
      .filter((j) => {
        if (est && String(j.estado) !== est) return false;
        if (!sQ) return true;

        const hitBarcode = String(j.codigo_barras || "").toLowerCase().includes(sQ);
        if (hitBarcode) return true;

        const ed = edById.get(j.edicion_id);
        const libro = ed ? libroById.get(ed.libro_id) : null;
        return String(libro?.titulo || "").toLowerCase().includes(sQ);
      })
      .slice()
      .sort((a, b) => b.id - a.id)
      .map((j) => {
        const ed = edById.get(j.edicion_id);
        const libro = ed ? libroById.get(ed.libro_id) : null;
        const pub = ed ? editorialById.get(ed.editorial_id) : null;

        return {
          ...j,
          libro_titulo: libro?.titulo || "—",
          editorial_nombre: pub?.nombre || "—",
          isbn_edicion: ed?.isbn_edicion || null
        };
      });
  }

  function lookupEjemplar(codigo) {
    const c = String(codigo || "").trim();
    if (!c) throw err(400, "codigo requerido");

    const j = s.ejemplares.find((x) => String(x.codigo_barras) === c);
    if (!j) throw err(404, "No encontrado.");

    const ed = findById(s.ediciones, j.edicion_id);
    const libro = ed ? findById(s.libros, ed.libro_id) : null;

    return {
      id: j.id,
      codigo_barras: j.codigo_barras,
      estado: j.estado,
      libro_titulo: libro?.titulo || "—"
    };
  }

  function createEjemplar(payload) {
    const edicion_id = Number(payload.edicion_id);
    const codigo_barras = String(payload.codigo_barras || "").trim();
    if (!existsById(s.ediciones, edicion_id)) throw err(400, "edicion_id inválido.");
    if (!codigo_barras) throw err(400, "codigo_barras requerido.");
    if (s.ejemplares.some((x) => String(x.codigo_barras) === codigo_barras)) {
      throw err(409, "codigo_barras ya existe.");
    }

    const j = {
      id: nextId(s.ejemplares),
      edicion_id,
      codigo_barras,
      ubicacion: payload.ubicacion ?? null,
      estado: payload.estado ?? "disponible",
      fecha_alta: nowIso()
    };

    s.ejemplares.push(j);
    persist("ejemplares");
    return j;
  }

  function updateEjemplar(id, payload) {
    const j = findById(s.ejemplares, id);
    if (!j) throw err(404, "Ejemplar no encontrado.");

    j.ubicacion = payload.ubicacion ?? null;
    j.estado = payload.estado ?? j.estado;

    persist("ejemplares");
    return j;
  }

  function deleteEjemplar(id) {
    const inActiveLoan = s.prestamos_items.some(
      (it) => Number(it.ejemplar_id) === Number(id) && it.estado === "activo"
    );
    if (inActiveLoan) throw err(409, "No se puede eliminar: ejemplar en préstamo activo.");

    const before = s.ejemplares.length;
    s.ejemplares = s.ejemplares.filter((x) => Number(x.id) !== Number(id));
    persist("ejemplares");
    return before !== s.ejemplares.length;
  }

  // -----------------------------
  // PRESTAMOS
  // -----------------------------
  function listPrestamos(estado = "") {
    const st = String(estado || "").trim();

    const userById = new Map(s.usuarios.map((u) => [u.id, u]));
    const itemsByPrestamo = new Map();
    for (const it of s.prestamos_items) {
      const arr = itemsByPrestamo.get(it.prestamo_id) || [];
      arr.push(it);
      itemsByPrestamo.set(it.prestamo_id, arr);
    }

    return s.prestamos
      .filter((p) => !st || String(p.estado) === st)
      .slice()
      .sort((a, b) => b.id - a.id)
      .map((p) => {
        const u = userById.get(p.usuario_id);
        const items = itemsByPrestamo.get(p.id) || [];
        const vencidos = items.filter((it) => {
          if (it.estado !== "activo") return false;
          const t = new Date(it.fecha_vencimiento).getTime();
          return Number.isFinite(t) && t < Date.now();
        }).length;

        return {
          ...p,
          usuario_nombre: u?.nombre || "—",
          items: items.length,
          vencidos
        };
      });
  }

  function getPrestamoDetail(id) {
    const p = findById(s.prestamos, id);
    if (!p) throw err(404, "Préstamo no encontrado.");

    const u = findById(s.usuarios, p.usuario_id);

    const edById = new Map(s.ediciones.map((e) => [e.id, e]));
    const libroById = new Map(s.libros.map((l) => [l.id, l]));
    const ejById = new Map(s.ejemplares.map((j) => [j.id, j]));

    const items = s.prestamos_items
      .filter((it) => Number(it.prestamo_id) === Number(id))
      .slice()
      .sort((a, b) => b.ejemplar_id - a.ejemplar_id)
      .map((it) => {
        const ej = ejById.get(it.ejemplar_id);
        const ed = ej ? edById.get(ej.edicion_id) : null;
        const libro = ed ? libroById.get(ed.libro_id) : null;

        return {
          ...it,
          codigo_barras: ej?.codigo_barras || "—",
          libro_titulo: libro?.titulo || "—"
        };
      });

    return {
      prestamo: {
        ...p,
        usuario_nombre: u?.nombre || "—"
      },
      items
    };
  }

  function createPrestamo(payload) {
    const usuario_id = Number(payload.usuario_id);
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!existsById(s.usuarios, usuario_id)) throw err(400, "Usuario no existe.");

    const u = findById(s.usuarios, usuario_id);
    if (!isActiveUser(u)) throw err(400, "Usuario inactivo.");
    if (!items.length) throw err(400, "items[] requerido.");

    const p = {
      id: nextId(s.prestamos),
      usuario_id,
      fecha_prestamo: nowIso(),
      estado: "abierto",
      observaciones: payload.observaciones ?? null
    };
    s.prestamos.push(p);

    // Validar y reservar ejemplares
    for (const it of items) {
      const ejemplar_id = Number(it.ejemplar_id);
      const fecha_vencimiento = String(it.fecha_vencimiento || "").trim();
      if (!ejemplar_id || !fecha_vencimiento) throw err(400, "Item inválido.");

      const ej = findById(s.ejemplares, ejemplar_id);
      if (!ej) throw err(400, "Ejemplar no existe.");
      if (String(ej.estado) !== "disponible") throw err(409, "Ejemplar no disponible.");

      ej.estado = "prestado";

      s.prestamos_items.push({
        prestamo_id: p.id,
        ejemplar_id,
        fecha_vencimiento,
        fecha_devolucion: null,
        estado: "activo",
        condicion_devolucion: null,
        multa_mxn: 0
      });
    }

    persist(["prestamos", "prestamos_items", "ejemplares"]);
    return p;
  }

  function devolverItem(prestamoId, ejemplarId, payload) {
    const it = s.prestamos_items.find(
      (x) => Number(x.prestamo_id) === Number(prestamoId) && Number(x.ejemplar_id) === Number(ejemplarId)
    );
    if (!it) throw err(404, "Item no existe.");
    if (it.estado !== "activo") throw err(409, "Item no activo.");

    it.estado = "devuelto";
    it.fecha_devolucion = nowIso();
    it.condicion_devolucion = payload.condicion_devolucion ?? null;
    it.multa_mxn = Number(payload.multa_mxn || 0);

    const ej = findById(s.ejemplares, ejemplarId);
    if (ej) ej.estado = "disponible";

    const hasActive = s.prestamos_items.some(
      (x) => Number(x.prestamo_id) === Number(prestamoId) && x.estado === "activo"
    );
    if (!hasActive) {
      const p = findById(s.prestamos, prestamoId);
      if (p) p.estado = "cerrado";
    }

    persist(["prestamos", "prestamos_items", "ejemplares"]);
    return true;
  }

  // -----------------------------
  // RESERVAS
  // -----------------------------
  function listReservas(estado = "") {
    const st = String(estado || "").trim();
    const userById = new Map(s.usuarios.map((u) => [u.id, u]));
    const libroById = new Map(s.libros.map((l) => [l.id, l]));

    return s.reservas
      .filter((r) => !st || String(r.estado) === st)
      .slice()
      .sort((a, b) => b.id - a.id)
      .map((r) => {
        const u = userById.get(r.usuario_id);
        const l = libroById.get(r.libro_id);
        return {
          ...r,
          usuario_nombre: u?.nombre || "—",
          libro_titulo: l?.titulo || "—"
        };
      });
  }

  function createReserva(payload) {
    const usuario_id = Number(payload.usuario_id);
    const libro_id = Number(payload.libro_id);
    if (!existsById(s.usuarios, usuario_id)) throw err(400, "Usuario inválido.");
    if (!existsById(s.libros, libro_id)) throw err(400, "Libro inválido.");

    const dup = s.reservas.some(
      (r) => Number(r.usuario_id) === usuario_id && Number(r.libro_id) === libro_id && r.estado === "activa"
    );
    if (dup) throw err(409, "Ya existe una reserva activa para ese usuario/libro.");

    const r = {
      id: nextId(s.reservas),
      usuario_id,
      libro_id,
      fecha_reserva: nowIso(),
      expira_en: payload.expira_en ?? null,
      estado: "activa"
    };

    s.reservas.push(r);
    persist("reservas");
    return r;
  }

  function cancelarReserva(id) {
    const r = findById(s.reservas, id);
    if (!r) throw err(404, "Reserva no encontrada.");
    r.estado = "cancelada";
    persist("reservas");
    return r;
  }

  function cumplirReserva(id) {
    const r = findById(s.reservas, id);
    if (!r) throw err(404, "Reserva no encontrada.");
    r.estado = "cumplida";
    persist("reservas");
    return r;
  }

  // -----------------------------
  // SELECTS para UI
  // -----------------------------
  function selectAutores() {
    return s.autores.slice().sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")));
  }
  function selectEditoriales() {
    return s.editoriales.slice().sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")));
  }
  function selectLibros() {
    return s.libros.slice().sort((a, b) => String(a.titulo || "").localeCompare(String(b.titulo || "")));
  }
  function selectUsuariosActivos() {
    return s.usuarios
      .filter((u) => Number(u.activo) === 1)
      .slice()
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")));
  }
  function selectEdiciones(libroId = 0) {
    const list = listEdiciones(libroId);
    return list.map((e) => ({
      id: e.id,
      label: `${e.libro_titulo} — ${e.editorial_nombre}${e.num_edicion ? ` — Ed.${e.num_edicion}` : ""}`
    }));
  }

  return {
    withWriteLock,

    // Autores
    listAutores, createAutor, updateAutor, deleteAutor,

    // Editoriales
    listEditoriales, createEditorial, updateEditorial, deleteEditorial,

    // Usuarios
    listUsuarios, createUsuario, updateUsuario, deactivateUsuario,

    // Libros
    listLibros, getLibroDetail, createLibro, updateLibro, deleteLibro, replaceLibroAutores,

    // Ediciones
    listEdiciones, createEdicion, updateEdicion, deleteEdicion,

    // Ejemplares
    listEjemplares, lookupEjemplar, createEjemplar, updateEjemplar, deleteEjemplar,

    // Préstamos
    listPrestamos, getPrestamoDetail, createPrestamo, devolverItem,

    // Reservas
    listReservas, createReserva, cancelarReserva, cumplirReserva,

    // Selects
    selectAutores, selectEditoriales, selectLibros, selectUsuariosActivos, selectEdiciones
  };
}

module.exports = { createStore };