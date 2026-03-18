const $ = (s) => document.querySelector(s);

const state = {
  view: "libros",
  q: ""
};

const api = {
  async get(path) {
    const r = await fetch(path);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.detail || "Error");
    return j;
  },
  async send(path, method, body) {
    const options = {
      method,
      headers: { "Content-Type": "application/json" }
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const r = await fetch(path, options);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.detail || "Error");
    return j;
  }
};

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1600);
}

function setActiveNav() {
  document.querySelectorAll(".chip").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.view);
  });
}

function openModal(title, subtitle, bodyEl, footerEls = []) {
  $("#modalTitle").textContent = title || "";
  $("#modalSubtitle").textContent = subtitle || "";

  const body = $("#modalBody");
  const foot = $("#modalFooter");

  body.innerHTML = "";
  foot.innerHTML = "";

  if (bodyEl) body.appendChild(bodyEl);
  footerEls.forEach((el) => foot.appendChild(el));

  $("#modal").classList.add("show");
}

function closeModal() {
  $("#modal").classList.remove("show");
}

$("#modalClose")?.addEventListener("click", closeModal);
$("#modal")?.addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});

document.querySelectorAll(".chip").forEach((b) => {
  b.addEventListener("click", () => {
    state.view = b.dataset.view;
    $("#search").value = "";
    state.q = "";
    setActiveNav();
    render();
  });
});

$("#search")?.addEventListener("input", (e) => {
  state.q = e.target.value.trim();
});

$("#search")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") render();
});

$("#refresh")?.addEventListener("click", () => render());
$("#newBtn")?.addEventListener("click", () => onNew());

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") {
      el.className = v;
      return;
    }

    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
      return;
    }

    if (["value", "checked", "selected", "disabled", "name", "type", "placeholder", "id", "rows"].includes(k)) {
      el[k] = v;
      return;
    }

    if (typeof v === "boolean") {
      if (v) el.setAttribute(k, "");
      return;
    }

    el.setAttribute(k, v);
  });

  children.forEach((c) => {
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });

  return el;
}

function table(headers, rows) {
  const thead = h("thead", {}, [
    h("tr", {}, headers.map((x) => h("th", {}, [x])))
  ]);

  const tbody = h(
    "tbody",
    {},
    rows.map((r) =>
      h(
        "tr",
        {},
        r.map((c) => h("td", {}, [typeof c === "string" || typeof c === "number" ? String(c) : c]))
      )
    )
  );

  return h("table", { class: "table" }, [thead, tbody]);
}

function field(label, name, value = "", full = false, type = "text", placeholder = "") {
  const input = h("input", { class: "input", name, type, placeholder, value: String(value ?? "") });
  return h("div", { class: `field ${full ? "full" : ""}` }, [
    h("div", { class: "label" }, [label]),
    input
  ]);
}

function textareaField(label, name, value = "", full = true, rows = 4) {
  const ta = h("textarea", { class: "input", name, rows });
  ta.value = String(value ?? "");
  return h("div", { class: `field ${full ? "full" : ""}` }, [
    h("div", { class: "label" }, [label]),
    ta
  ]);
}

function selectField(label, name, options = [], selected = null, full = false) {
  const sel = h("select", { class: "input", name }, []);
  (options || []).forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.ID ?? o.value;
    opt.textContent = o.LABEL || o.NOMBRE || o.TITULO || o.label || `#${o.ID ?? o.value}`;
    if (selected !== null && Number(selected) === Number(opt.value)) opt.selected = true;
    sel.appendChild(opt);
  });

  return h("div", { class: `field ${full ? "full" : ""}` }, [
    h("div", { class: "label" }, [label]),
    sel
  ]);
}

function selectStaticField(label, name, options = [], selected = null, full = false) {
  const sel = h("select", { class: "input", name }, []);
  options.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    if (String(selected) === String(o.value)) opt.selected = true;
    sel.appendChild(opt);
  });

  return h("div", { class: `field ${full ? "full" : ""}` }, [
    h("div", { class: "label" }, [label]),
    sel
  ]);
}

function readForm(root) {
  const obj = {};
  root.querySelectorAll("[name]").forEach((el) => {
    if (el.type === "checkbox") {
      obj[el.name] = el.checked;
      return;
    }
    obj[el.name] = typeof el.value === "string" ? el.value.trim() : el.value;
  });
  return obj;
}

function badgeEstado(text, kind = "ok") {
  return h("span", { class: `badge ${kind}` }, [text]);
}

// =========================
// RENDER
// =========================
async function render() {
  setActiveNav();

  const titleMap = {
    libros: ["Libros", "Catálogo general"],
    autores: ["Autores", "Gestión de autores"],
    editoriales: ["Editoriales", "Gestión de editoriales"],
    ediciones: ["Ediciones", "Ediciones por libro/editorial"],
    ejemplares: ["Ejemplares", "Copias físicas"],
    usuarios: ["Usuarios", "Lectores y personal"],
    prestamos: ["Préstamos", "Alta y devolución"],
    reservas: ["Reservas", "Reservar un libro"]
  };

  $("#viewTitle").textContent = titleMap[state.view]?.[0] || "Biblioteca";
  $("#viewHint").textContent = titleMap[state.view]?.[1] || "";

  const content = $("#content");
  content.innerHTML = "Cargando...";

  try {
    if (state.view === "libros") return await renderLibros();
    if (state.view === "autores") return await renderAutores();
    if (state.view === "editoriales") return await renderEditoriales();
    if (state.view === "usuarios") return await renderUsuarios();
    if (state.view === "ediciones") return await renderEdiciones();
    if (state.view === "ejemplares") return await renderEjemplares();
    if (state.view === "prestamos") return await renderPrestamos();
    if (state.view === "reservas") return await renderReservas();
  } catch (e) {
    content.innerHTML = "";
    content.appendChild(h("div", {}, [`Error: ${e.message}`]));
  }
}

// =========================
// LIBROS
// =========================
async function renderLibros() {
  const { data } = await api.get(`/api/libros?q=${encodeURIComponent(state.q)}`);
  const rows = data.map((x) => {
    const disp = Number(x.DISPONIBLES || 0);
    const tot = Number(x.TOTAL_EJEMPLARES || 0);

    const badge =
      tot === 0
        ? badgeEstado("Sin ejemplares", "warn")
        : disp > 0
          ? badgeEstado(`${disp}/${tot} disponibles`, "ok")
          : badgeEstado(`0/${tot} disponibles`, "bad");

    const btns = h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => libroDetalle(x.ID) }, ["Detalle"]),
      h("button", { class: "btn danger", onClick: () => delLibro(x.ID) }, ["Eliminar"])
    ]);

    return [
      x.ID,
      x.TITULO || "",
      x.AUTORES || "—",
      x.ISBN || "—",
      badge,
      btns
    ];
  });

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID", "Título", "Autores", "ISBN", "Disponibilidad", "Acciones"], rows));
}

async function libroDetalle(id) {
  const r = await api.get(`/api/libros/${id}/detail`);
  const { libro, autores, ediciones } = r.data;

  const body = h("div", {}, [
    h("div", { class: "muted" }, [`Libro #${libro.ID}`]),
    h("div", { style: "margin:10px 0;font-weight:800;" }, [libro.TITULO]),
    h("div", { class: "muted" }, [
      `ISBN: ${libro.ISBN || "—"} · Género: ${libro.GENERO || "—"} · Idioma: ${libro.IDIOMA || "—"}`
    ]),
    h("div", { class: "muted", style: "margin-top:6px;" }, [
      `Páginas: ${libro.PAGINAS ?? "—"} · Fecha publicación: ${libro.FECHA_PUBLICACION || "—"}`
    ]),
    h("hr", { style: "border:0;border-top:1px solid var(--border);margin:12px 0;" }),
    h("div", { style: "font-weight:800;margin-bottom:6px;" }, ["Autores asignados"]),
    h("div", { class: "muted", style: "margin-bottom:12px;" }, [
      autores.length ? autores.map((a) => a.NOMBRE).join(", ") : "—"
    ]),
    h("div", { style: "font-weight:800;margin-bottom:6px;" }, ["Descripción"]),
    h("div", { class: "muted", style: "margin-bottom:12px;white-space:pre-wrap;" }, [libro.DESCRIPCION || "—"]),
    h("div", { style: "font-weight:800;margin:12px 0 6px;" }, ["Ediciones"]),
    ediciones.length
      ? table(
          ["ID", "Editorial", "Ed.", "ISBN edición", "Ejemplares"],
          ediciones.map((e) => [
            e.ID,
            e.EDITORIAL_NOMBRE || "—",
            e.NUM_EDICION ?? "—",
            e.ISBN_EDICION ?? "—",
            `${e.DISPONIBLES}/${e.TOTAL_EJEMPLARES}`
          ])
        )
      : h("div", { class: "muted" }, ["—"])
  ]);

  openModal("Detalle de libro", "Catálogo", body, [
    h("button", { class: "btn", onClick: () => openLibroEdit(libro) }, ["Editar"]),
    h("button", { class: "btn primary", onClick: () => openAutoresAsignacion(libro.ID) }, ["Asignar autores"])
  ]);
}

async function openLibroEdit(libro) {
  const form = h("div", { class: "form" }, [
    field("Título", "titulo", libro.TITULO),
    field("ISBN", "isbn", libro.ISBN || ""),
    field("Género", "genero", libro.GENERO || ""),
    field("Idioma", "idioma", libro.IDIOMA || ""),
    field("Páginas", "paginas", libro.PAGINAS ?? "", false, "number"),
    field("Fecha publicación", "fecha_publicacion", libro.FECHA_PUBLICACION || ""),
    textareaField("Descripción", "descripcion", libro.DESCRIPCION || "")
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.paginas = payload.paginas ? Number(payload.paginas) : null;
    await api.send(`/api/libros/${libro.ID}`, "PUT", payload);
    toast("Libro actualizado");
    closeModal();
    render();
  };

  openModal("Editar libro", `ID ${libro.ID}`, form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Guardar"])
  ]);
}

async function openAutoresAsignacion(libroId) {
  const [opts, detail] = await Promise.all([
    api.get("/api/select/autores"),
    api.get(`/api/libros/${libroId}/detail`)
  ]);

  const autores = opts.data || [];
  const actuales = detail.data?.autores || [];
  const actualesMap = new Map(actuales.map((a) => [Number(a.ID), a]));

  const wrap = h("div", {}, [
    h("div", { class: "muted", style: "margin-bottom:8px;" }, [
      "Selecciona autores para este libro. La asignación reemplaza la lista completa."
    ])
  ]);

  const list = h(
    "div",
    { style: "display:grid;gap:8px;" },
    autores.map((a) => {
      const actual = actualesMap.get(Number(a.ID));

      return h("div", {
        style: "display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:12px;padding:10px;"
      }, [
        h("div", {}, [a.NOMBRE]),
        h("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" }, [
          h("input", {
            type: "checkbox",
            checked: !!actual,
            "data-autor": a.ID
          }),
          h("input", {
            class: "input",
            style: "width:110px;",
            placeholder: "Orden",
            value: actual?.ORDEN_AUTORIA ?? "",
            "data-orden": a.ID
          }),
          h("input", {
            class: "input",
            style: "width:160px;",
            placeholder: "Rol",
            value: actual?.ROL ?? "",
            "data-rol": a.ID
          })
        ])
      ]);
    })
  );

  wrap.appendChild(list);

  const save = async () => {
    const selected = [];

    list.querySelectorAll("input[type='checkbox']").forEach((chk) => {
      if (!chk.checked) return;

      const autorId = Number(chk.getAttribute("data-autor"));
      const orden = list.querySelector(`input[data-orden='${autorId}']`)?.value?.trim() || "";
      const rol = list.querySelector(`input[data-rol='${autorId}']`)?.value?.trim() || "";

      selected.push({
        autor_id: autorId,
        orden_autoria: orden ? Number(orden) : null,
        rol: rol || null
      });
    });

    await api.send(`/api/libros/${libroId}/autores`, "PUT", { autores: selected });
    toast("Autores asignados");
    closeModal();
    render();
  };

  openModal("Asignar autores", `Libro ID ${libroId}`, wrap, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Guardar"])
  ]);
}

async function newLibro() {
  const form = h("div", { class: "form" }, [
    field("Título", "titulo", ""),
    field("ISBN", "isbn", ""),
    field("Género", "genero", ""),
    field("Idioma", "idioma", ""),
    field("Páginas", "paginas", "", false, "number"),
    field("Fecha publicación", "fecha_publicacion", ""),
    textareaField("Descripción", "descripcion", "")
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.paginas = payload.paginas ? Number(payload.paginas) : null;
    await api.send("/api/libros", "POST", payload);
    toast("Libro creado");
    closeModal();
    render();
  };

  openModal("Nuevo libro", "Catálogo", form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Crear"])
  ]);
}

async function delLibro(id) {
  if (!confirm("¿Eliminar libro?")) return;
  await api.send(`/api/libros/${id}`, "DELETE");
  toast("Libro eliminado");
  render();
}

// =========================
// AUTORES
// =========================
async function renderAutores() {
  const { data } = await api.get(`/api/autores?q=${encodeURIComponent(state.q)}`);
  const rows = data.map((x) => [
    x.ID,
    x.NOMBRE || "",
    x.NACIONALIDAD || "—",
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => editAutor(x) }, ["Editar"]),
      h("button", { class: "btn danger", onClick: () => delAutor(x.ID) }, ["Eliminar"])
    ])
  ]);

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID", "Nombre", "Nacionalidad", "Acciones"], rows));
}

async function newAutor() {
  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", ""),
    field("Nacionalidad", "nacionalidad", ""),
    textareaField("Bibliografía", "bibliografia", "")
  ]);

  const save = async () => {
    const payload = readForm(form);
    await api.send("/api/autores", "POST", payload);
    toast("Autor creado");
    closeModal();
    render();
  };

  openModal("Nuevo autor", "Catálogo", form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Crear"])
  ]);
}

async function editAutor(x) {
  const detail = await api.get(`/api/autores/${x.ID}`);
  const autor = detail.data;

  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", autor.NOMBRE),
    field("Nacionalidad", "nacionalidad", autor.NACIONALIDAD || ""),
    textareaField("Bibliografía", "bibliografia", autor.BIBLIOGRAFIA || "")
  ]);

  const save = async () => {
    const payload = readForm(form);
    await api.send(`/api/autores/${autor.ID}`, "PUT", payload);
    toast("Autor actualizado");
    closeModal();
    render();
  };

  openModal("Editar autor", `ID ${autor.ID}`, form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Guardar"])
  ]);
}

async function delAutor(id) {
  if (!confirm("¿Eliminar autor?")) return;
  await api.send(`/api/autores/${id}`, "DELETE");
  toast("Autor eliminado");
  render();
}

// =========================
// EDITORIALES
// =========================
async function renderEditoriales() {
  const { data } = await api.get(`/api/editoriales?q=${encodeURIComponent(state.q)}`);
  const rows = data.map((x) => [
    x.ID,
    x.NOMBRE || "",
    x.EMAIL || "—",
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => editEditorial(x) }, ["Editar"]),
      h("button", { class: "btn danger", onClick: () => delEditorial(x.ID) }, ["Eliminar"])
    ])
  ]);

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID", "Nombre", "Email", "Acciones"], rows));
}

async function newEditorial() {
  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", ""),
    field("Email", "email", ""),
    field("Teléfono", "telefono", ""),
    textareaField("Dirección", "direccion", "")
  ]);

  const save = async () => {
    const payload = readForm(form);
    await api.send("/api/editoriales", "POST", payload);
    toast("Editorial creada");
    closeModal();
    render();
  };

  openModal("Nueva editorial", "Catálogo", form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Crear"])
  ]);
}

async function editEditorial(x) {
  const detail = await api.get(`/api/editoriales/${x.ID}`);
  const editorial = detail.data;

  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", editorial.NOMBRE),
    field("Email", "email", editorial.EMAIL || ""),
    field("Teléfono", "telefono", editorial.TELEFONO || ""),
    textareaField("Dirección", "direccion", editorial.DIRECCION || "")
  ]);

  const save = async () => {
    const payload = readForm(form);
    await api.send(`/api/editoriales/${editorial.ID}`, "PUT", payload);
    toast("Editorial actualizada");
    closeModal();
    render();
  };

  openModal("Editar editorial", `ID ${editorial.ID}`, form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Guardar"])
  ]);
}

async function delEditorial(id) {
  if (!confirm("¿Eliminar editorial?")) return;
  await api.send(`/api/editoriales/${id}`, "DELETE");
  toast("Editorial eliminada");
  render();
}

// =========================
// USUARIOS
// =========================
async function renderUsuarios() {
  const { data } = await api.get(`/api/usuarios?q=${encodeURIComponent(state.q)}`);
  const rows = data.map((x) => [
    x.ID,
    x.NOMBRE || "",
    x.TIPO || "",
    x.EMAIL || "—",
    x.ACTIVO === 1 ? badgeEstado("Activo", "ok") : badgeEstado("Inactivo", "bad"),
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => editUsuario(x) }, ["Editar"]),
      x.ACTIVO === 1
        ? h("button", { class: "btn danger", onClick: () => desactUsuario(x.ID) }, ["Desactivar"])
        : h("button", { class: "btn", onClick: () => reactUsuario(x.ID) }, ["Reactivar"])
    ])
  ]);

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID", "Nombre", "Tipo", "Email", "Estado", "Acciones"], rows));
}

async function newUsuario() {
  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", ""),
    field("Email", "email", ""),
    field("Teléfono", "telefono", ""),
    textareaField("Dirección", "direccion", ""),
    selectStaticField("Tipo", "tipo", [
      { value: "alumno", label: "alumno" },
      { value: "docente", label: "docente" },
      { value: "externo", label: "externo" },
      { value: "bibliotecario", label: "bibliotecario" },
      { value: "admin", label: "admin" }
    ], "alumno"),
    selectStaticField("Activo", "activo", [
      { value: "1", label: "Sí" },
      { value: "0", label: "No" }
    ], "1")
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.activo = Number(payload.activo);
    await api.send("/api/usuarios", "POST", payload);
    toast("Usuario creado");
    closeModal();
    render();
  };

  openModal("Nuevo usuario", "Biblioteca", form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Crear"])
  ]);
}

async function editUsuario(x) {
  const detail = await api.get(`/api/usuarios/${x.ID}`);
  const user = detail.data;

  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", user.NOMBRE),
    field("Email", "email", user.EMAIL || ""),
    field("Teléfono", "telefono", user.TELEFONO || ""),
    textareaField("Dirección", "direccion", user.DIRECCION || ""),
    selectStaticField("Tipo", "tipo", [
      { value: "alumno", label: "alumno" },
      { value: "docente", label: "docente" },
      { value: "externo", label: "externo" },
      { value: "bibliotecario", label: "bibliotecario" },
      { value: "admin", label: "admin" }
    ], user.TIPO),
    selectStaticField("Activo", "activo", [
      { value: "1", label: "Sí" },
      { value: "0", label: "No" }
    ], String(user.ACTIVO))
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.activo = Number(payload.activo);
    await api.send(`/api/usuarios/${user.ID}`, "PUT", payload);
    toast("Usuario actualizado");
    closeModal();
    render();
  };

  openModal("Editar usuario", `ID ${user.ID}`, form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Guardar"])
  ]);
}

async function desactUsuario(id) {
  if (!confirm("¿Desactivar usuario?")) return;
  await api.send(`/api/usuarios/${id}`, "DELETE");
  toast("Usuario desactivado");
  render();
}

async function reactUsuario(id) {
  await api.send(`/api/usuarios/${id}/reactivar`, "PUT", {});
  toast("Usuario reactivado");
  render();
}

// =========================
// EDICIONES
// =========================
async function renderEdiciones() {
  const { data } = await api.get(`/api/ediciones?libro_id=0`);
  const rows = data.map((x) => [
    x.ID,
    x.LIBRO_TITULO || "—",
    x.EDITORIAL_NOMBRE || "—",
    x.NUM_EDICION ?? "—",
    x.ISBN_EDICION ?? "—",
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => editEdicion(x) }, ["Editar"]),
      h("button", { class: "btn danger", onClick: () => delEdicion(x.ID) }, ["Eliminar"])
    ])
  ]);

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID", "Libro", "Editorial", "Ed.", "ISBN edición", "Acciones"], rows));
}

async function newEdicion() {
  const [libros, editoriales] = await Promise.all([
    api.get("/api/select/libros"),
    api.get("/api/select/editoriales")
  ]);

  const form = h("div", { class: "form" }, [
    selectField("Libro", "libro_id", libros.data),
    selectField("Editorial", "editorial_id", editoriales.data),
    field("Num. edición", "num_edicion", "", false, "number"),
    field("Fecha lanzamiento", "fecha_lanzamiento", ""),
    field("Lugar publicación", "lugar_publicacion", ""),
    field("ISBN edición", "isbn_edicion", "")
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
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Crear"])
  ]);
}

async function editEdicion(x) {
  const detail = await api.get(`/api/ediciones/${x.ID}`);
  const edicion = detail.data;

  const [libros, editoriales] = await Promise.all([
    api.get("/api/select/libros"),
    api.get("/api/select/editoriales")
  ]);

  const form = h("div", { class: "form" }, [
    selectField("Libro", "libro_id", libros.data, edicion.LIBRO_ID),
    selectField("Editorial", "editorial_id", editoriales.data, edicion.EDITORIAL_ID),
    field("Num. edición", "num_edicion", edicion.NUM_EDICION ?? "", false, "number"),
    field("Fecha lanzamiento", "fecha_lanzamiento", edicion.FECHA_LANZAMIENTO || ""),
    field("Lugar publicación", "lugar_publicacion", edicion.LUGAR_PUBLICACION || ""),
    field("ISBN edición", "isbn_edicion", edicion.ISBN_EDICION || "")
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.libro_id = Number(payload.libro_id);
    payload.editorial_id = Number(payload.editorial_id);
    payload.num_edicion = payload.num_edicion ? Number(payload.num_edicion) : null;
    await api.send(`/api/ediciones/${edicion.ID}`, "PUT", payload);
    toast("Edición actualizada");
    closeModal();
    render();
  };

  openModal("Editar edición", `ID ${edicion.ID}`, form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Guardar"])
  ]);
}

async function delEdicion(id) {
  if (!confirm("¿Eliminar edición?")) return;
  await api.send(`/api/ediciones/${id}`, "DELETE");
  toast("Edición eliminada");
  render();
}

// =========================
// EJEMPLARES
// =========================
async function renderEjemplares() {
  const { data } = await api.get(`/api/ejemplares?q=${encodeURIComponent(state.q)}&estado=`);
  const rows = data.map((x) => [
    x.ID,
    x.CODIGO_BARRAS || "",
    x.LIBRO_TITULO || "",
    x.ESTADO || "",
    x.UBICACION || "—",
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => editEjemplar(x) }, ["Editar"]),
      h("button", { class: "btn danger", onClick: () => delEjemplar(x.ID) }, ["Eliminar"])
    ])
  ]);

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID", "Código", "Libro", "Estado", "Ubicación", "Acciones"], rows));
}

async function newEjemplar() {
  const ed = await api.get("/api/select/ediciones?libro_id=0");

  const form = h("div", { class: "form" }, [
    selectField("Edición", "edicion_id", ed.data),
    field("Código de barras", "codigo_barras", ""),
    field("Ubicación", "ubicacion", ""),
    selectStaticField("Estado", "estado", [
      { value: "disponible", label: "disponible" },
      { value: "prestado", label: "prestado" },
      { value: "reservado", label: "reservado" },
      { value: "mantenimiento", label: "mantenimiento" },
      { value: "baja", label: "baja" }
    ], "disponible")
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.edicion_id = Number(payload.edicion_id);
    await api.send("/api/ejemplares", "POST", payload);
    toast("Ejemplar creado");
    closeModal();
    render();
  };

  openModal("Nuevo ejemplar", "Catálogo", form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Crear"])
  ]);
}

async function editEjemplar(x) {
  const detail = await api.get(`/api/ejemplares/${x.ID}`);
  const ej = detail.data;

  const ed = await api.get("/api/select/ediciones?libro_id=0");

  const form = h("div", { class: "form" }, [
    selectField("Edición", "edicion_id", ed.data, ej.EDICION_ID),
    field("Código de barras", "codigo_barras", ej.CODIGO_BARRAS || ""),
    field("Ubicación", "ubicacion", ej.UBICACION || ""),
    selectStaticField("Estado", "estado", [
      { value: "disponible", label: "disponible" },
      { value: "prestado", label: "prestado" },
      { value: "reservado", label: "reservado" },
      { value: "mantenimiento", label: "mantenimiento" },
      { value: "baja", label: "baja" }
    ], ej.ESTADO || "disponible")
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.edicion_id = Number(payload.edicion_id);
    await api.send(`/api/ejemplares/${ej.ID}`, "PUT", payload);
    toast("Ejemplar actualizado");
    closeModal();
    render();
  };

  openModal("Editar ejemplar", `ID ${ej.ID} — ${ej.CODIGO_BARRAS}`, form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Guardar"])
  ]);
}

async function delEjemplar(id) {
  if (!confirm("¿Eliminar ejemplar?")) return;
  await api.send(`/api/ejemplares/${id}`, "DELETE");
  toast("Ejemplar eliminado");
  render();
}

// =========================
// PRESTAMOS
// =========================
async function renderPrestamos() {
  const { data } = await api.get(`/api/prestamos?estado=`);
  const rows = data.map((p) => [
    p.ID,
    p.USUARIO_NOMBRE || "—",
    p.ESTADO || "—",
    p.ITEMS || 0,
    Number(p.VENCIDOS || 0) > 0
      ? badgeEstado(`${p.VENCIDOS} vencido(s)`, "bad")
      : badgeEstado("OK", "ok"),
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => detallePrestamo(p.ID) }, ["Detalle"])
    ])
  ]);

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID", "Usuario", "Estado", "Items", "Vencimientos", "Acciones"], rows));
}

async function detallePrestamo(id) {
  const r = await api.get(`/api/prestamos/${id}`);
  const { prestamo, items } = r.data;

  const body = h("div", {}, [
    h("div", { class: "muted" }, [`Préstamo #${prestamo.ID} — ${prestamo.USUARIO_NOMBRE}`]),
    h("div", { style: "margin:10px 0;font-weight:800;" }, [`Estado: ${prestamo.ESTADO}`]),
    items.length
      ? table(
          ["Ejemplar", "Libro", "Vence", "Estado", "Multa", "Acción"],
          items.map((it) => {
            const canReturn = it.ESTADO === "activo";
            const btn = canReturn
              ? h("button", { class: "btn primary", onClick: () => devolverItem(prestamo.ID, it.EJEMPLAR_ID) }, ["Devolver"])
              : h("span", { class: "muted" }, ["—"]);

            return [
              it.CODIGO_BARRAS,
              it.LIBRO_TITULO,
              it.FECHA_VENCIMIENTO,
              it.ESTADO,
              String(it.MULTA_MXN || 0),
              btn
            ];
          })
        )
      : h("div", { class: "muted" }, ["Sin items."])
  ]);

  openModal("Detalle de préstamo", `ID ${prestamo.ID}`, body, [
    h("button", { class: "btn", onClick: closeModal }, ["Cerrar"])
  ]);
}

async function devolverItem(prestamoId, ejemplarId) {
  const multa = prompt("Multa MXN (0 si no aplica):", "0");
  if (multa === null) return;

  const condicion = prompt("Condición de devolución (opcional):", "");
  if (condicion === null) return;

  await api.send(`/api/prestamos/${prestamoId}/devolver`, "POST", {
    ejemplar_id: ejemplarId,
    multa_mxn: Number(multa || 0),
    condicion_devolucion: condicion || null
  });

  toast("Devuelto");
  closeModal();
  render();
}

async function newPrestamo() {
  const users = await api.get("/api/select/usuarios");

  const form = h("div", {}, []);
  const top = h("div", { class: "form" }, [
    selectField("Usuario", "usuario_id", users.data),
    field("Observaciones", "observaciones", ""),
    field("Fecha vencimiento (YYYY-MM-DD HH:MM:SS)", "fecha_vencimiento", "", true),
    field("Código de barras", "codigo", "", true)
  ]);

  const items = [];

  const list = h("div", { style: "margin-top:12px;" }, [
    h("div", { style: "font-weight:800;margin-bottom:6px;" }, ["Items del préstamo"]),
    h("div", { class: "muted", style: "margin-bottom:8px;" }, [
      "Agrega ejemplares disponibles por código de barras."
    ]),
    h("div", { id: "itemsBox" }, [])
  ]);

  const refreshItems = () => {
    const box = list.querySelector("#itemsBox");
    box.innerHTML = "";

    if (!items.length) {
      box.appendChild(h("div", { class: "muted" }, ["—"]));
      return;
    }

    box.appendChild(
      table(
        ["Ejemplar ID", "Código", "Libro", "Acción"],
        items.map((it, idx) => [
          it.ejemplar_id,
          it.codigo,
          it.titulo,
          h("button", {
            class: "btn danger",
            onClick: () => {
              items.splice(idx, 1);
              refreshItems();
            }
          }, ["Quitar"])
        ])
      )
    );
  };

  const addByBarcode = async () => {
    const codigo = top.querySelector("input[name='codigo']").value.trim();
    if (!codigo) return;

    const r = await api.get(`/api/ejemplares/lookup?codigo=${encodeURIComponent(codigo)}`);
    const ej = r.data;

    if (ej.ESTADO !== "disponible") {
      alert("Ese ejemplar no está disponible.");
      return;
    }

    if (items.some((x) => x.ejemplar_id === ej.ID)) {
      alert("Ese ejemplar ya fue agregado.");
      return;
    }

    items.push({
      ejemplar_id: ej.ID,
      codigo: ej.CODIGO_BARRAS,
      titulo: ej.LIBRO_TITULO
    });

    top.querySelector("input[name='codigo']").value = "";
    refreshItems();
  };

  const addBtn = h("button", { class: "btn", onClick: addByBarcode }, ["Agregar ejemplar"]);
  top.appendChild(h("div", { class: "field full" }, [addBtn]));

  form.appendChild(top);
  form.appendChild(list);
  refreshItems();

  const save = async () => {
    const usuario_id = Number(top.querySelector("select[name='usuario_id']").value);
    const observaciones = top.querySelector("input[name='observaciones']").value.trim() || null;

    let fecha_vencimiento = top.querySelector("input[name='fecha_vencimiento']").value.trim();

    if (!fecha_vencimiento) {
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
      items: items.map((x) => ({
        ejemplar_id: x.ejemplar_id,
        fecha_vencimiento
      }))
    });

    toast("Préstamo creado");
    closeModal();
    render();
  };

  openModal("Nuevo préstamo", "Circulación", form, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Crear"])
  ]);
}

// =========================
// RESERVAS
// =========================
async function renderReservas() {
  const { data } = await api.get(`/api/reservas?estado=`);
  const rows = data.map((x) => [
    x.ID,
    x.USUARIO_NOMBRE || "—",
    x.LIBRO_TITULO || "—",
    x.ESTADO || "—",
    h("div", { class: "actions" }, [
      x.ESTADO === "activa"
        ? h("button", { class: "btn", onClick: () => cancelarReserva(x.ID) }, ["Cancelar"])
        : h("span", { class: "muted" }, ["—"]),
      x.ESTADO === "activa"
        ? h("button", { class: "btn primary", onClick: () => cumplirReserva(x.ID) }, ["Cumplir"])
        : h("span", { class: "muted" }, ["—"])
    ])
  ]);

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID", "Usuario", "Libro", "Estado", "Acciones"], rows));
}

async function newReserva() {
  const [users, libros] = await Promise.all([
    api.get("/api/select/usuarios"),
    api.get("/api/select/libros")
  ]);

  const form = h("div", { class: "form" }, [
    selectField("Usuario", "usuario_id", users.data),
    selectField("Libro", "libro_id", libros.data.map((x) => ({ ID: x.ID, LABEL: x.TITULO }))),
    field("Expira en (opcional)", "expira_en", "")
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
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Crear"])
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

// =========================
// NEW BY VIEW
// =========================
async function onNew() {
  if (state.view === "libros") return newLibro();
  if (state.view === "autores") return newAutor();
  if (state.view === "editoriales") return newEditorial();
  if (state.view === "usuarios") return newUsuario();
  if (state.view === "ediciones") return newEdicion();
  if (state.view === "ejemplares") return newEjemplar();
  if (state.view === "prestamos") return newPrestamo();
  if (state.view === "reservas") return newReserva();
}

render();