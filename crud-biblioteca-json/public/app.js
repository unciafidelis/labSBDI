// public/app.js

const $ = (sel) => document.querySelector(sel);

const state = {
  view: "libros",
  q: ""
};

// -----------------------------
// API helper
// -----------------------------
const api = {
  async get(path) {
    const res = await fetch(path);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.detail || json.message || `HTTP ${res.status}`);
    return json;
  },
  async send(path, method, body) {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {})
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.detail || json.message || `HTTP ${res.status}`);
    return json;
  }
};

// -----------------------------
// UI helpers
// -----------------------------
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = String(v);
    else if (k === "html") el.innerHTML = String(v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return el;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = String(msg);
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 1600);
}

function esc(v) {
  return v == null ? "" : String(v);
}

function badge(type, text) {
  return h("span", { class: `badge ${type}`, text });
}

function hr() {
  return h("hr", { style: "border:0;border-top:1px solid var(--border);margin:12px 0;" });
}

function setViewHeader(title, hint) {
  $("#viewTitle").textContent = title;
  $("#viewHint").textContent = hint;
}

function setActiveNav() {
  document.querySelectorAll(".chip[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.view);
  });
}

function openModal(title, subtitle, bodyNode, footerButtons = []) {
  $("#modalTitle").textContent = title;
  $("#modalSubtitle").textContent = subtitle || "—";

  const body = $("#modalBody");
  const foot = $("#modalFooter");
  body.innerHTML = "";
  foot.innerHTML = "";

  body.appendChild(bodyNode);
  for (const btn of footerButtons) foot.appendChild(btn);

  $("#modal").classList.add("show");
  $("#modal").setAttribute("aria-hidden", "false");
}

function closeModal() {
  $("#modal").classList.remove("show");
  $("#modal").setAttribute("aria-hidden", "true");
}

$("#modalClose").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (e) => {
  if (e.target && e.target.id === "modal") closeModal();
});

// -----------------------------
// Table builder (DOM safe)
// -----------------------------
function makeTable(columns, rows) {
  const thead = h("thead", {}, [
    h("tr", {}, columns.map((c) => h("th", { text: c.label })))
  ]);

  const tbody = h("tbody");
  for (const row of rows) {
    const tr = h("tr");
    for (const col of columns) {
      const td = h("td");
      const val = typeof col.render === "function" ? col.render(row) : row[col.key];
      td.appendChild(val instanceof Node ? val : document.createTextNode(esc(val)));
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  return h("table", { class: "table" }, [thead, tbody]);
}

// -----------------------------
// Form helpers
// -----------------------------
function fieldText({ label, name, value = "", full = false, placeholder = "" }) {
  const input = h("input", { class: "input", name, value: esc(value), placeholder: esc(placeholder) });
  return h("div", { class: `field ${full ? "full" : ""}` }, [
    h("div", { class: "label", text: label }),
    input
  ]);
}

function fieldNumber({ label, name, value = "", full = false, placeholder = "" }) {
  const input = h("input", { class: "input", name, value: esc(value), placeholder: esc(placeholder), type: "number" });
  return h("div", { class: `field ${full ? "full" : ""}` }, [
    h("div", { class: "label", text: label }),
    input
  ]);
}

function fieldSelect({ label, name, options = [], selected = null, full = false }) {
  const sel = h("select", { class: "input", name });
  for (const opt of options) {
    const o = h("option", { value: opt.value, text: opt.label });
    if (selected != null && String(opt.value) === String(selected)) o.selected = true;
    sel.appendChild(o);
  }
  return h("div", { class: `field ${full ? "full" : ""}` }, [
    h("div", { class: "label", text: label }),
    sel
  ]);
}

function readForm(root) {
  const out = {};
  root.querySelectorAll("[name]").forEach((el) => {
    if (el.tagName === "SELECT" || el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      out[el.name] = String(el.value ?? "").trim();
    }
  });
  return out;
}

function makeActionBar(actions = []) {
  return h("div", { class: "actions" }, actions);
}

function fbBtn(text, onClick, cls = "btn") {
  return h("button", { class: cls, type: "button", onClick }, [text]);
}

function isEmpty(s) {
  return !String(s || "").trim();
}

// -----------------------------
// Navigation + global actions
// -----------------------------
document.querySelectorAll(".chip[data-view]").forEach((b) => {
  b.addEventListener("click", () => {
    state.view = b.dataset.view;
    state.q = "";
    $("#search").value = "";
    setActiveNav();
    render();
  });
});

$("#search").addEventListener("input", (e) => {
  state.q = String(e.target.value || "").trim();
});

$("#refresh").addEventListener("click", () => render());
$("#newBtn").addEventListener("click", () => onNew());

// -----------------------------
// View map
// -----------------------------
const views = {
  libros: {
    title: "Libros",
    hint: "Catálogo general y disponibilidad.",
    render: renderLibros,
    onNew: newLibro
  },
  autores: {
    title: "Autores",
    hint: "Altas, edición y eliminación (si no está asignado a libros).",
    render: renderAutores,
    onNew: newAutor
  },
  editoriales: {
    title: "Editoriales",
    hint: "Gestión de editoriales (usadas por ediciones).",
    render: renderEditoriales,
    onNew: newEditorial
  },
  ediciones: {
    title: "Ediciones",
    hint: "Ediciones por libro/editorial.",
    render: renderEdiciones,
    onNew: newEdicion
  },
  ejemplares: {
    title: "Ejemplares",
    hint: "Copias físicas por edición (código de barras).",
    render: renderEjemplares,
    onNew: newEjemplar
  },
  usuarios: {
    title: "Usuarios",
    hint: "Lectores/personal (se desactiva en lugar de borrar).",
    render: renderUsuarios,
    onNew: newUsuario
  },
  prestamos: {
    title: "Préstamos",
    hint: "Alta de préstamos y devoluciones por ejemplar.",
    render: renderPrestamos,
    onNew: newPrestamo
  },
  reservas: {
    title: "Reservas",
    hint: "Reservas activas/canceladas/cumplidas.",
    render: renderReservas,
    onNew: newReserva
  }
};

async function render() {
  setActiveNav();
  const v = views[state.view];
  setViewHeader(v.title, v.hint);

  const content = $("#content");
  content.innerHTML = "";
  content.appendChild(h("div", { class: "muted", text: "Cargando..." }));

  try {
    await v.render();
  } catch (e) {
    content.innerHTML = "";
    content.appendChild(h("div", { text: `Error: ${e.message}` }));
  }
}

function onNew() {
  const v = views[state.view];
  v.onNew?.();
}

// -----------------------------
// LIBROS
// -----------------------------
async function renderLibros() {
  const q = encodeURIComponent(state.q || "");
  const r = await api.get(`/api/libros?q=${q}`);
  const data = r.data || [];

  const cols = [
    { key: "id", label: "ID" },
    { key: "titulo", label: "Título" },
    { key: "autores", label: "Autores" },
    { key: "isbn", label: "ISBN" },
    {
      key: "disp",
      label: "Disponibilidad",
      render: (x) => {
        const total = Number(x.total_ejemplares || 0);
        const disp = Number(x.disponibles || 0);
        if (total === 0) return badge("warn", "Sin ejemplares");
        if (disp > 0) return badge("ok", `${disp}/${total} disponibles`);
        return badge("bad", `0/${total} disponibles`);
      }
    },
    {
      key: "actions",
      label: "Acciones",
      render: (x) =>
        makeActionBar([
          fbBtn("Detalle", () => libroDetalle(x.id), "btn"),
          fbBtn("Eliminar", () => delLibro(x.id), "btn danger")
        ])
    }
  ];

  const t = makeTable(cols, data);
  $("#content").innerHTML = "";
  $("#content").appendChild(t);
}

async function libroDetalle(id) {
  const r = await api.get(`/api/libros/${id}/detail`);
  const { libro, autores, ediciones } = r.data;

  const body = h("div", {}, [
    h("div", { class: "muted", text: `Libro #${libro.id}` }),
    h("div", { style: "margin:8px 0 6px;font-weight:800;font-size:16px;" }, [esc(libro.titulo)]),
    h("div", { class: "muted" }, [
      `ISBN: ${libro.isbn || "—"} · Género: ${libro.genero || "—"} · Idioma: ${libro.idioma || "—"} · Páginas: ${libro.paginas ?? "—"}`
    ]),
    hr(),
    h("div", { style: "font-weight:800;margin-bottom:6px;" }, ["Autores asignados"]),
    h("div", { class: "muted", style: "margin-bottom:10px;" }, [
      autores?.length ? autores.map((a) => a.nombre).join(", ") : "—"
    ]),
    h("div", { style: "font-weight:800;margin:12px 0 6px;" }, ["Ediciones"]),
    ediciones?.length
      ? makeTable(
          [
            { key: "id", label: "ID" },
            { key: "editorial_nombre", label: "Editorial" },
            { key: "num_edicion", label: "Ed." },
            { key: "isbn_edicion", label: "ISBN edición" },
            {
              key: "ej",
              label: "Ejemplares",
              render: (e) => `${Number(e.disponibles || 0)}/${Number(e.total_ejemplares || 0)}`
            }
          ],
          ediciones
        )
      : h("div", { class: "muted", text: "—" })
  ]);

  openModal("Detalle de libro", "Catálogo", body, [
    fbBtn("Editar", () => openLibroEdit(libro), "btn"),
    fbBtn("Asignar autores", () => openAutoresAsignacion(libro.id), "btn primary")
  ]);
}

function openLibroEdit(libro) {
  const form = h("div", { class: "form" }, [
    fieldText({ label: "Título", name: "titulo", value: libro.titulo, full: true }),
    fieldText({ label: "ISBN", name: "isbn", value: libro.isbn || "" }),
    fieldText({ label: "Género", name: "genero", value: libro.genero || "" }),
    fieldText({ label: "Idioma", name: "idioma", value: libro.idioma || "" }),
    fieldNumber({ label: "Páginas", name: "paginas", value: libro.paginas ?? "" }),
    fieldText({ label: "Fecha publicación", name: "fecha_publicacion", value: libro.fecha_publicacion || "" }),
    fieldText({ label: "Descripción", name: "descripcion", value: libro.descripcion || "", full: true })
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.paginas = payload.paginas ? Number(payload.paginas) : null;
    if (isEmpty(payload.titulo)) return toast("Título requerido.");
    await api.send(`/api/libros/${libro.id}`, "PUT", payload);
    toast("Libro actualizado");
    closeModal();
    render();
  };

  openModal("Editar libro", `ID ${libro.id}`, form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Guardar", save, "btn primary")
  ]);
}

async function openAutoresAsignacion(libroId) {
  const [selAutores, detail] = await Promise.all([
    api.get("/api/select/autores"),
    api.get(`/api/libros/${libroId}/detail`)
  ]);

  const opciones = (selAutores.data || []).map((x) => ({ id: x.ID, nombre: x.NOMBRE }));
  const actuales = new Map((detail.data.autores || []).map((a) => [Number(a.id), a]));

  const wrap = h("div", {}, [
    h("div", { class: "muted", style: "margin-bottom:10px;" }, [
      "Selecciona autores. Al guardar, se reemplaza la lista completa."
    ])
  ]);

  const list = h("div", { style: "display:grid;gap:8px;" });
  for (const a of opciones) {
    const cur = actuales.get(Number(a.id));
    const chk = h("input", { type: "checkbox" });
    chk.checked = !!cur;

    const orden = h("input", {
      class: "input",
      style: "width:110px;",
      placeholder: "Orden",
      value: cur?.orden_autoria ?? ""
    });

    const rol = h("input", {
      class: "input",
      style: "width:180px;",
      placeholder: "Rol",
      value: cur?.rol ?? ""
    });

    const row = h(
      "div",
      {
        style:
          "display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:12px;padding:10px;"
      },
      [
        h("div", { style: "font-weight:700;" }, [a.nombre]),
        h("div", { style: "display:flex;gap:8px;align-items:center;" }, [
          chk,
          orden,
          rol
        ])
      ]
    );

    row._data = { autor_id: a.id, chk, orden, rol };
    list.appendChild(row);
  }

  wrap.appendChild(list);

  const save = async () => {
    const selected = [];
    list.querySelectorAll("div").forEach((row) => {
      if (!row._data) return;
      const { autor_id, chk, orden, rol } = row._data;
      if (!chk.checked) return;
      const o = orden.value.trim();
      selected.push({
        autor_id: Number(autor_id),
        orden_autoria: o ? Number(o) : null,
        rol: rol.value.trim() || null
      });
    });

    await api.send(`/api/libros/${libroId}/autores`, "PUT", { autores: selected });
    toast("Autores asignados");
    closeModal();
  };

  openModal("Asignar autores", `Libro ID ${libroId}`, wrap, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Guardar", save, "btn primary")
  ]);
}

async function newLibro() {
  const form = h("div", { class: "form" }, [
    fieldText({ label: "Título", name: "titulo", value: "", full: true }),
    fieldText({ label: "ISBN", name: "isbn", value: "" }),
    fieldText({ label: "Género", name: "genero", value: "" }),
    fieldText({ label: "Idioma", name: "idioma", value: "" }),
    fieldNumber({ label: "Páginas", name: "paginas", value: "" }),
    fieldText({ label: "Fecha publicación", name: "fecha_publicacion", value: "" }),
    fieldText({ label: "Descripción", name: "descripcion", value: "", full: true })
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.paginas = payload.paginas ? Number(payload.paginas) : null;
    if (isEmpty(payload.titulo)) return toast("Título requerido.");
    await api.send("/api/libros", "POST", payload);
    toast("Libro creado");
    closeModal();
    render();
  };

  openModal("Nuevo libro", "Catálogo", form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Crear", save, "btn primary")
  ]);
}

async function delLibro(id) {
  if (!confirm("¿Eliminar libro? Puede fallar si tiene relaciones (ediciones/reservas activas).")) return;
  await api.send(`/api/libros/${id}`, "DELETE");
  toast("Libro eliminado");
  render();
}

// -----------------------------
// AUTORES
// -----------------------------
async function renderAutores() {
  const q = encodeURIComponent(state.q || "");
  const r = await api.get(`/api/autores?q=${q}`);
  const data = r.data || [];

  const cols = [
    { key: "id", label: "ID" },
    { key: "nombre", label: "Nombre" },
    { key: "nacionalidad", label: "Nacionalidad" },
    {
      key: "actions",
      label: "Acciones",
      render: (x) =>
        makeActionBar([
          fbBtn("Editar", () => editAutor(x), "btn"),
          fbBtn("Eliminar", () => delAutor(x.id), "btn danger")
        ])
    }
  ];

  $("#content").innerHTML = "";
  $("#content").appendChild(makeTable(cols, data));
}

async function newAutor() {
  const form = h("div", { class: "form" }, [
    fieldText({ label: "Nombre", name: "nombre", value: "", full: true }),
    fieldText({ label: "Nacionalidad", name: "nacionalidad", value: "" }),
    fieldText({ label: "Bibliografía", name: "bibliografia", value: "", full: true })
  ]);

  const save = async () => {
    const payload = readForm(form);
    if (isEmpty(payload.nombre)) return toast("Nombre requerido.");
    await api.send("/api/autores", "POST", payload);
    toast("Autor creado");
    closeModal();
    render();
  };

  openModal("Nuevo autor", "Catálogo", form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Crear", save, "btn primary")
  ]);
}

function editAutor(a) {
  const form = h("div", { class: "form" }, [
    fieldText({ label: "Nombre", name: "nombre", value: a.nombre, full: true }),
    fieldText({ label: "Nacionalidad", name: "nacionalidad", value: a.nacionalidad || "" }),
    fieldText({ label: "Bibliografía", name: "bibliografia", value: a.bibliografia || "", full: true })
  ]);

  const save = async () => {
    const payload = readForm(form);
    if (isEmpty(payload.nombre)) return toast("Nombre requerido.");
    await api.send(`/api/autores/${a.id}`, "PUT", payload);
    toast("Autor actualizado");
    closeModal();
    render();
  };

  openModal("Editar autor", `ID ${a.id}`, form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Guardar", save, "btn primary")
  ]);
}

async function delAutor(id) {
  if (!confirm("¿Eliminar autor? (Fallará si está asignado a un libro)")) return;
  await api.send(`/api/autores/${id}`, "DELETE");
  toast("Autor eliminado");
  render();
}

// -----------------------------
// EDITORIALES
// -----------------------------
async function renderEditoriales() {
  const q = encodeURIComponent(state.q || "");
  const r = await api.get(`/api/editoriales?q=${q}`);
  const data = r.data || [];

  const cols = [
    { key: "id", label: "ID" },
    { key: "nombre", label: "Nombre" },
    { key: "email", label: "Email" },
    {
      key: "actions",
      label: "Acciones",
      render: (x) =>
        makeActionBar([
          fbBtn("Editar", () => editEditorial(x), "btn"),
          fbBtn("Eliminar", () => delEditorial(x.id), "btn danger")
        ])
    }
  ];

  $("#content").innerHTML = "";
  $("#content").appendChild(makeTable(cols, data));
}

async function newEditorial() {
  const form = h("div", { class: "form" }, [
    fieldText({ label: "Nombre", name: "nombre", value: "", full: true }),
    fieldText({ label: "Email", name: "email", value: "" }),
    fieldText({ label: "Teléfono", name: "telefono", value: "" }),
    fieldText({ label: "Dirección", name: "direccion", value: "", full: true })
  ]);

  const save = async () => {
    const payload = readForm(form);
    if (isEmpty(payload.nombre)) return toast("Nombre requerido.");
    await api.send("/api/editoriales", "POST", payload);
    toast("Editorial creada");
    closeModal();
    render();
  };

  openModal("Nueva editorial", "Catálogo", form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Crear", save, "btn primary")
  ]);
}

function editEditorial(e) {
  const form = h("div", { class: "form" }, [
    fieldText({ label: "Nombre", name: "nombre", value: e.nombre, full: true }),
    fieldText({ label: "Email", name: "email", value: e.email || "" }),
    fieldText({ label: "Teléfono", name: "telefono", value: e.telefono || "" }),
    fieldText({ label: "Dirección", name: "direccion", value: e.direccion || "", full: true })
  ]);

  const save = async () => {
    const payload = readForm(form);
    if (isEmpty(payload.nombre)) return toast("Nombre requerido.");
    await api.send(`/api/editoriales/${e.id}`, "PUT", payload);
    toast("Editorial actualizada");
    closeModal();
    render();
  };

  openModal("Editar editorial", `ID ${e.id}`, form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Guardar", save, "btn primary")
  ]);
}

async function delEditorial(id) {
  if (!confirm("¿Eliminar editorial? (Fallará si está usada en ediciones)")) return;
  await api.send(`/api/editoriales/${id}`, "DELETE");
  toast("Editorial eliminada");
  render();
}

// -----------------------------
// USUARIOS
// -----------------------------
async function renderUsuarios() {
  const q = encodeURIComponent(state.q || "");
  const r = await api.get(`/api/usuarios?q=${q}`);
  const data = r.data || [];

  const cols = [
    { key: "id", label: "ID" },
    { key: "nombre", label: "Nombre" },
    { key: "tipo", label: "Tipo" },
    { key: "email", label: "Email" },
    {
      key: "activo",
      label: "Estado",
      render: (u) => (Number(u.activo) === 1 ? badge("ok", "Activo") : badge("bad", "Inactivo"))
    },
    {
      key: "actions",
      label: "Acciones",
      render: (u) =>
        makeActionBar([
          fbBtn("Editar", () => editUsuario(u), "btn"),
          fbBtn("Desactivar", () => desactUsuario(u.id), "btn danger")
        ])
    }
  ];

  $("#content").innerHTML = "";
  $("#content").appendChild(makeTable(cols, data));
}

async function newUsuario() {
  const form = h("div", { class: "form" }, [
    fieldText({ label: "Nombre", name: "nombre", value: "", full: true }),
    fieldText({ label: "Email", name: "email", value: "" }),
    fieldText({ label: "Teléfono", name: "telefono", value: "" }),
    fieldText({ label: "Dirección", name: "direccion", value: "", full: true }),
    fieldText({ label: "Tipo (alumno/docente/externo/bibliotecario/admin)", name: "tipo", value: "alumno", full: true }),
    fieldNumber({ label: "Activo (1/0)", name: "activo", value: "1" })
  ]);

  const save = async () => {
    const payload = readForm(form);
    if (isEmpty(payload.nombre)) return toast("Nombre requerido.");
    payload.activo = payload.activo ? Number(payload.activo) : 1;
    await api.send("/api/usuarios", "POST", payload);
    toast("Usuario creado");
    closeModal();
    render();
  };

  openModal("Nuevo usuario", "Biblioteca", form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Crear", save, "btn primary")
  ]);
}

function editUsuario(u) {
  const form = h("div", { class: "form" }, [
    fieldText({ label: "Nombre", name: "nombre", value: u.nombre, full: true }),
    fieldText({ label: "Email", name: "email", value: u.email || "" }),
    fieldText({ label: "Teléfono", name: "telefono", value: u.telefono || "" }),
    fieldText({ label: "Dirección", name: "direccion", value: u.direccion || "", full: true }),
    fieldText({ label: "Tipo", name: "tipo", value: u.tipo || "alumno", full: true }),
    fieldNumber({ label: "Activo (1/0)", name: "activo", value: String(u.activo ?? 1) })
  ]);

  const save = async () => {
    const payload = readForm(form);
    if (isEmpty(payload.nombre)) return toast("Nombre requerido.");
    payload.activo = payload.activo ? Number(payload.activo) : 1;
    await api.send(`/api/usuarios/${u.id}`, "PUT", payload);
    toast("Usuario actualizado");
    closeModal();
    render();
  };

  openModal("Editar usuario", `ID ${u.id}`, form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Guardar", save, "btn primary")
  ]);
}

async function desactUsuario(id) {
  if (!confirm("¿Desactivar usuario?")) return;
  await api.send(`/api/usuarios/${id}`, "DELETE");
  toast("Usuario desactivado");
  render();
}

// -----------------------------
// EDICIONES
// -----------------------------
async function renderEdiciones() {
  const r = await api.get(`/api/ediciones?libro_id=0`);
  const data = r.data || [];

  const cols = [
    { key: "id", label: "ID" },
    { key: "libro_titulo", label: "Libro" },
    { key: "editorial_nombre", label: "Editorial" },
    { key: "num_edicion", label: "Ed." },
    { key: "isbn_edicion", label: "ISBN edición" },
    {
      key: "actions",
      label: "Acciones",
      render: (e) =>
        makeActionBar([
          fbBtn("Editar", () => editEdicion(e), "btn"),
          fbBtn("Eliminar", () => delEdicion(e.id), "btn danger")
        ])
    }
  ];

  $("#content").innerHTML = "";
  $("#content").appendChild(makeTable(cols, data));
}

async function newEdicion() {
  const [libros, editoriales] = await Promise.all([
    api.get("/api/select/libros"),
    api.get("/api/select/editoriales")
  ]);

  const libroOpts = (libros.data || []).map((x) => ({ value: x.ID, label: x.TITULO }));
  const editOpts = (editoriales.data || []).map((x) => ({ value: x.ID, label: x.NOMBRE }));

  if (!libroOpts.length) return toast("Crea al menos un libro primero.");
  if (!editOpts.length) return toast("Crea al menos una editorial primero.");

  const form = h("div", { class: "form" }, [
    fieldSelect({ label: "Libro", name: "libro_id", options: libroOpts, full: true }),
    fieldSelect({ label: "Editorial", name: "editorial_id", options: editOpts, full: true }),
    fieldNumber({ label: "Num edición", name: "num_edicion", value: "" }),
    fieldText({ label: "Fecha lanzamiento", name: "fecha_lanzamiento", value: "" }),
    fieldText({ label: "Lugar publicación", name: "lugar_publicacion", value: "" }),
    fieldText({ label: "ISBN edición", name: "isbn_edicion", value: "" })
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.libro_id = Number(payload.libro_id);
    payload.editorial_id = Number(payload.editorial_id);
    payload.num_edicion = payload.num_edicion ? Number(payload.num_edicion) : null;
    await api.send("/api/ediciones", "POST", payload);
    toast("Edición creada");
    closeModal();
    render();
  };

  openModal("Nueva edición", "Catálogo", form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Crear", save, "btn primary")
  ]);
}

async function editEdicion(e) {
  const [libros, editoriales] = await Promise.all([
    api.get("/api/select/libros"),
    api.get("/api/select/editoriales")
  ]);

  const libroOpts = (libros.data || []).map((x) => ({ value: x.ID, label: x.TITULO }));
  const editOpts = (editoriales.data || []).map((x) => ({ value: x.ID, label: x.NOMBRE }));

  const form = h("div", { class: "form" }, [
    fieldSelect({ label: "Libro", name: "libro_id", options: libroOpts, selected: e.libro_id, full: true }),
    fieldSelect({ label: "Editorial", name: "editorial_id", options: editOpts, selected: e.editorial_id, full: true }),
    fieldNumber({ label: "Num edición", name: "num_edicion", value: e.num_edicion ?? "" }),
    fieldText({ label: "Fecha lanzamiento", name: "fecha_lanzamiento", value: e.fecha_lanzamiento ?? "" }),
    fieldText({ label: "Lugar publicación", name: "lugar_publicacion", value: e.lugar_publicacion ?? "" }),
    fieldText({ label: "ISBN edición", name: "isbn_edicion", value: e.isbn_edicion ?? "" })
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.libro_id = Number(payload.libro_id);
    payload.editorial_id = Number(payload.editorial_id);
    payload.num_edicion = payload.num_edicion ? Number(payload.num_edicion) : null;
    await api.send(`/api/ediciones/${e.id}`, "PUT", payload);
    toast("Edición actualizada");
    closeModal();
    render();
  };

  openModal("Editar edición", `ID ${e.id}`, form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Guardar", save, "btn primary")
  ]);
}

async function delEdicion(id) {
  if (!confirm("¿Eliminar edición? (Fallará si tiene ejemplares)")) return;
  await api.send(`/api/ediciones/${id}`, "DELETE");
  toast("Edición eliminada");
  render();
}

// -----------------------------
// EJEMPLARES
// -----------------------------
async function renderEjemplares() {
  const q = encodeURIComponent(state.q || "");
  const r = await api.get(`/api/ejemplares?q=${q}&estado=`);
  const data = r.data || [];

  const cols = [
    { key: "id", label: "ID" },
    { key: "codigo_barras", label: "Código" },
    { key: "libro_titulo", label: "Libro" },
    { key: "estado", label: "Estado" },
    { key: "ubicacion", label: "Ubicación" },
    {
      key: "actions",
      label: "Acciones",
      render: (j) =>
        makeActionBar([
          fbBtn("Editar", () => editEjemplar(j), "btn"),
          fbBtn("Eliminar", () => delEjemplar(j.id), "btn danger")
        ])
    }
  ];

  $("#content").innerHTML = "";
  $("#content").appendChild(makeTable(cols, data));
}

async function newEjemplar() {
  const ed = await api.get("/api/select/ediciones?libro_id=0");
  const opts = (ed.data || []).map((x) => ({ value: x.ID, label: x.LABEL }));

  if (!opts.length) return toast("Crea una edición primero.");

  const form = h("div", { class: "form" }, [
    fieldSelect({ label: "Edición", name: "edicion_id", options: opts, full: true }),
    fieldText({ label: "Código de barras", name: "codigo_barras", value: "", full: true }),
    fieldText({ label: "Ubicación", name: "ubicacion", value: "" }),
    fieldText({ label: "Estado (disponible/prestado/mantenimiento/baja)", name: "estado", value: "disponible" })
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.edicion_id = Number(payload.edicion_id);
    if (isEmpty(payload.codigo_barras)) return toast("Código de barras requerido.");
    await api.send("/api/ejemplares", "POST", payload);
    toast("Ejemplar creado");
    closeModal();
    render();
  };

  openModal("Nuevo ejemplar", "Catálogo", form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Crear", save, "btn primary")
  ]);
}

function editEjemplar(j) {
  const form = h("div", { class: "form" }, [
    fieldText({ label: "Ubicación", name: "ubicacion", value: j.ubicacion || "", full: true }),
    fieldText({ label: "Estado", name: "estado", value: j.estado || "disponible", full: true })
  ]);

  const save = async () => {
    const payload = readForm(form);
    await api.send(`/api/ejemplares/${j.id}`, "PUT", payload);
    toast("Ejemplar actualizado");
    closeModal();
    render();
  };

  openModal("Editar ejemplar", `ID ${j.id} — ${j.codigo_barras}`, form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Guardar", save, "btn primary")
  ]);
}

async function delEjemplar(id) {
  if (!confirm("¿Eliminar ejemplar? (Fallará si está en préstamo activo)")) return;
  await api.send(`/api/ejemplares/${id}`, "DELETE");
  toast("Ejemplar eliminado");
  render();
}

// -----------------------------
// PRESTAMOS
// -----------------------------
async function renderPrestamos() {
  const r = await api.get(`/api/prestamos?estado=`);
  const data = r.data || [];

  const cols = [
    { key: "id", label: "ID" },
    { key: "usuario_nombre", label: "Usuario" },
    { key: "estado", label: "Estado" },
    { key: "items", label: "Items" },
    {
      key: "vencidos",
      label: "Vencidos",
      render: (p) => {
        const v = Number(p.vencidos || 0);
        return v > 0 ? badge("bad", `${v} vencido(s)`) : badge("ok", "OK");
      }
    },
    {
      key: "actions",
      label: "Acciones",
      render: (p) => makeActionBar([fbBtn("Detalle", () => detallePrestamo(p.id), "btn")])
    }
  ];

  $("#content").innerHTML = "";
  $("#content").appendChild(makeTable(cols, data));
}

async function detallePrestamo(id) {
  const r = await api.get(`/api/prestamos/${id}`);
  const { prestamo, items } = r.data;

  const body = h("div", {}, [
    h("div", { class: "muted", text: `Préstamo #${prestamo.id} — ${prestamo.usuario_nombre}` }),
    h("div", { style: "margin:8px 0 10px;font-weight:800;" }, [`Estado: ${prestamo.estado}`]),
    items?.length
      ? makeTable(
          [
            { key: "codigo_barras", label: "Código" },
            { key: "libro_titulo", label: "Libro" },
            { key: "fecha_vencimiento", label: "Vence" },
            { key: "estado", label: "Estado" },
            { key: "multa_mxn", label: "Multa" },
            {
              key: "act",
              label: "Acción",
              render: (it) => {
                if (it.estado !== "activo") return h("span", { class: "muted", text: "—" });
                return fbBtn("Devolver", () => devolverItem(prestamo.id, it.ejemplar_id), "btn primary");
              }
            }
          ],
          items
        )
      : h("div", { class: "muted", text: "Sin items." })
  ]);

  openModal("Detalle de préstamo", `ID ${prestamo.id}`, body, [fbBtn("Cerrar", closeModal, "btn")]);
}

async function devolverItem(prestamoId, ejemplarId) {
  const multa = prompt("Multa MXN (0 si no aplica):", "0");
  if (multa === null) return;
  const condicion = prompt("Condición devolución (opcional):", "");
  await api.send(`/api/prestamos/${prestamoId}/devolver`, "POST", {
    ejemplar_id: Number(ejemplarId),
    multa_mxn: Number(multa || 0),
    condicion_devolucion: (condicion || "").trim() || null
  });
  toast("Devuelto");
  closeModal();
  render();
}

async function newPrestamo() {
  const users = await api.get("/api/select/usuarios");
  const userOpts = (users.data || []).map((x) => ({ value: x.ID, label: x.NOMBRE }));
  if (!userOpts.length) return toast("Crea un usuario activo primero.");

  const items = [];

  const form = h("div", {}, []);
  const top = h("div", { class: "form" }, [
    fieldSelect({ label: "Usuario", name: "usuario_id", options: userOpts, full: true }),
    fieldText({ label: "Observaciones", name: "observaciones", value: "", full: true }),
    fieldText({
      label: "Fecha vencimiento (YYYY-MM-DD HH:MM:SS) (opcional)",
      name: "fecha_vencimiento",
      value: "",
      full: true
    }),
    fieldText({ label: "Código de barras (agregar)", name: "codigo", value: "", full: true })
  ]);

  const itemsBox = h("div", { style: "margin-top:12px;" }, [
    h("div", { style: "font-weight:800;margin-bottom:6px;" }, ["Items del préstamo"]),
    h("div", { class: "muted", style: "margin-bottom:8px;" }, [
      "Agrega ejemplares disponibles por código de barras."
    ])
  ]);

  const tableWrap = h("div");
  itemsBox.appendChild(tableWrap);

  function refreshItems() {
    tableWrap.innerHTML = "";
    if (!items.length) {
      tableWrap.appendChild(h("div", { class: "muted", text: "—" }));
      return;
    }
    tableWrap.appendChild(
      makeTable(
        [
          { key: "id", label: "Ejemplar ID" },
          { key: "codigo_barras", label: "Código" },
          { key: "libro_titulo", label: "Libro" },
          {
            key: "act",
            label: "Acción",
            render: (x) => fbBtn("Quitar", () => { removeItem(x.id); }, "btn danger")
          }
        ],
        items
      )
    );
  }

  function removeItem(id) {
    const idx = items.findIndex((x) => Number(x.id) === Number(id));
    if (idx >= 0) items.splice(idx, 1);
    refreshItems();
  }

  const addBtn = fbBtn("Agregar ejemplar", async () => {
    const codigo = top.querySelector("input[name='codigo']").value.trim();
    if (!codigo) return;

    const r = await api.get(`/api/ejemplares/lookup?codigo=${encodeURIComponent(codigo)}`);
    const ej = r.data;

    if (ej.estado !== "disponible") {
      alert("Ese ejemplar no está disponible.");
      return;
    }
    if (items.some((x) => Number(x.id) === Number(ej.id))) {
      alert("Ya está agregado.");
      return;
    }

    items.push({
      id: ej.id,
      codigo_barras: ej.codigo_barras,
      libro_titulo: ej.libro_titulo
    });

    top.querySelector("input[name='codigo']").value = "";
    refreshItems();
  }, "btn");

  top.appendChild(h("div", { class: "field full" }, [addBtn]));

  form.appendChild(top);
  form.appendChild(itemsBox);
  refreshItems();

  const save = async () => {
    const usuario_id = Number(top.querySelector("select[name='usuario_id']").value);
    const observaciones = top.querySelector("input[name='observaciones']").value.trim() || null;

    let fecha_vencimiento = top.querySelector("input[name='fecha_vencimiento']").value.trim();
    if (!fecha_vencimiento) {
      // default: +14 días
      const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const pad = (n) => String(n).padStart(2, "0");
      fecha_vencimiento = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    }

    if (!items.length) {
      alert("Agrega al menos un ejemplar.");
      return;
    }

    await api.send("/api/prestamos", "POST", {
      usuario_id,
      observaciones,
      items: items.map((x) => ({ ejemplar_id: x.id, fecha_vencimiento }))
    });

    toast("Préstamo creado");
    closeModal();
    render();
  };

  openModal("Nuevo préstamo", "Circulación", form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Crear", save, "btn primary")
  ]);
}

// -----------------------------
// RESERVAS
// -----------------------------
async function renderReservas() {
  const r = await api.get(`/api/reservas?estado=`);
  const data = r.data || [];

  const cols = [
    { key: "id", label: "ID" },
    { key: "usuario_nombre", label: "Usuario" },
    { key: "libro_titulo", label: "Libro" },
    { key: "estado", label: "Estado" },
    {
      key: "actions",
      label: "Acciones",
      render: (x) => {
        if (x.estado !== "activa") return h("span", { class: "muted", text: "—" });
        return makeActionBar([
          fbBtn("Cancelar", () => cancelarReserva(x.id), "btn"),
          fbBtn("Cumplir", () => cumplirReserva(x.id), "btn primary")
        ]);
      }
    }
  ];

  $("#content").innerHTML = "";
  $("#content").appendChild(makeTable(cols, data));
}

async function newReserva() {
  const [users, libros] = await Promise.all([api.get("/api/select/usuarios"), api.get("/api/select/libros")]);
  const userOpts = (users.data || []).map((x) => ({ value: x.ID, label: x.NOMBRE }));
  const libroOpts = (libros.data || []).map((x) => ({ value: x.ID, label: x.TITULO }));

  if (!userOpts.length) return toast("Crea un usuario activo primero.");
  if (!libroOpts.length) return toast("Crea un libro primero.");

  const form = h("div", { class: "form" }, [
    fieldSelect({ label: "Usuario", name: "usuario_id", options: userOpts, full: true }),
    fieldSelect({ label: "Libro", name: "libro_id", options: libroOpts, full: true }),
    fieldText({ label: "Expira en (opcional)", name: "expira_en", value: "", full: true })
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.usuario_id = Number(payload.usuario_id);
    payload.libro_id = Number(payload.libro_id);
    await api.send("/api/reservas", "POST", payload);
    toast("Reserva creada");
    closeModal();
    render();
  };

  openModal("Nueva reserva", "Reservas", form, [
    fbBtn("Cancelar", closeModal, "btn"),
    fbBtn("Crear", save, "btn primary")
  ]);
}

async function cancelarReserva(id) {
  await api.send(`/api/reservas/${id}/cancelar`, "PUT", {});
  toast("Reserva cancelada");
  render();
}

async function cumplirReserva(id) {
  await api.send(`/api/reservas/${id}/cumplir`, "PUT", {});
  toast("Reserva cumplida");
  render();
}

// -----------------------------
// Init
// -----------------------------
setActiveNav();
render();