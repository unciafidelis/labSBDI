const el = (id) => document.getElementById(id);

const listEl = el("list");
const statusText = el("statusText");
const metaText = el("metaText");
const pageText = el("pageText");

const createForm = el("createForm");
const titleInput = el("titleInput");
const doneInput = el("doneInput");

const searchInput = el("searchInput");
const doneFilter = el("doneFilter");
const pageSize = el("pageSize");

const refreshBtn = el("refreshBtn");
const prevBtn = el("prevBtn");
const nextBtn = el("nextBtn");

const toastEl = el("toast");

let state = {
  q: "",
  done: "",
  limit: 20,
  offset: 0,
  total: 0,
  data: [],
  loading: false,
};

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function setStatus(message) {
  statusText.textContent = message;
}

async function api(url, options) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (res.status === 204) return null;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = payload?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return payload;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function buildQuery() {
  const params = new URLSearchParams();
  params.set("limit", String(state.limit));
  params.set("offset", String(state.offset));
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.done === "0" || state.done === "1") params.set("done", state.done);
  return params.toString();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  metaText.textContent = `${state.total} total · mostrando ${state.data.length} · offset ${state.offset} · límite ${state.limit}`;

  const pageIndex = Math.floor(state.offset / state.limit) + 1;
  const pageCount = Math.max(1, Math.ceil(state.total / state.limit));
  pageText.textContent = `Página ${pageIndex} / ${pageCount}`;

  prevBtn.disabled = state.offset <= 0 || state.loading;
  nextBtn.disabled = state.offset + state.limit >= state.total || state.loading;

  if (state.loading) {
    listEl.innerHTML = `<div class="muted">Cargando...</div>`;
    return;
  }

  if (!state.data.length) {
    listEl.innerHTML = `<div class="muted">Sin resultados.</div>`;
    return;
  }

  listEl.innerHTML = state.data
    .map((t) => {
      const dotClass = t.done ? "done" : "todo";
      return `
        <div class="item" data-id="${t.id}">
          <div class="dot ${dotClass}" title="${t.done ? "Hecha" : "Pendiente"}"></div>

          <div class="title">
            <strong class="task-title">${escapeHtml(t.title)}</strong>
            <small>id #${t.id} · creado: ${fmtDate(t.created_at)} · actualizado: ${fmtDate(t.updated_at)}</small>
          </div>

          <div class="actions">
            <button class="btn ok" data-action="toggle" type="button">${t.done ? "Desmarcar" : "Hecha"}</button>
            <button class="btn" data-action="edit" type="button">Editar</button>
            <button class="btn danger" data-action="delete" type="button">Eliminar</button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function load() {
  try {
    state.loading = true;
    render();
    setStatus("Cargando tareas...");

    const payload = await api(`/api/tasks?${buildQuery()}`);
    state.total = payload.total;
    state.data = payload.data;

    setStatus("Listo.");
  } catch (e) {
    setStatus(`Error: ${e.message}`);
    toast(`Error: ${e.message}`);
  } finally {
    state.loading = false;
    render();
  }
}

async function createTask(title, done) {
  return api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title, done }),
  });
}

async function updateTask(id, patch) {
  return api(`/api/tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

async function deleteTask(id) {
  await api(`/api/tasks/${id}`, { method: "DELETE" });
}

createForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const title = titleInput.value.trim();
  const done = doneInput.checked ? 1 : 0;

  if (!title) {
    toast("El título es requerido.");
    titleInput.focus();
    return;
  }

  try {
    setStatus("Creando...");
    await createTask(title, done);
    titleInput.value = "";
    doneInput.checked = false;
    toast("Tarea creada.");
    state.offset = 0;
    await load();
  } catch (e) {
    setStatus(`Error: ${e.message}`);
    toast(`Error: ${e.message}`);
  }
});

let searchT = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    state.q = searchInput.value;
    state.offset = 0;
    load();
  }, 250);
});

doneFilter.addEventListener("change", () => {
  state.done = doneFilter.value;
  state.offset = 0;
  load();
});

pageSize.addEventListener("change", () => {
  state.limit = parseInt(pageSize.value, 10) || 20;
  state.offset = 0;
  load();
});

refreshBtn.addEventListener("click", () => load());

prevBtn.addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - state.limit);
  load();
});

nextBtn.addEventListener("click", () => {
  state.offset = state.offset + state.limit;
  load();
});

listEl.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button[data-action]");
  if (!btn) return;

  const item = ev.target.closest(".item");
  if (!item) return;

  const id = Number(item.getAttribute("data-id"));
  const action = btn.getAttribute("data-action");
  const task = state.data.find((x) => x.id === id);
  if (!task) return;

  try {
    if (action === "toggle") {
      setStatus("Actualizando...");
      await updateTask(id, { done: task.done ? 0 : 1 });
      toast("Actualizada.");
      await load();
      return;
    }

    if (action === "delete") {
      const ok = confirm(`¿Eliminar la tarea #${id}?`);
      if (!ok) return;
      setStatus("Eliminando...");
      await deleteTask(id);
      toast("Eliminada.");
      if (state.offset >= state.limit && state.data.length === 1) {
        state.offset = state.offset - state.limit;
      }
      await load();
      return;
    }

    if (action === "edit") {
      const nuevo = prompt(`Editar título (id #${id})`, task.title);
      if (nuevo === null) return;

      const trimmed = nuevo.trim();
      if (!trimmed) {
        toast("El título no puede quedar vacío.");
        return;
      }

      setStatus("Guardando...");
      await updateTask(id, { title: trimmed });
      toast("Guardado.");
      await load();
      return;
    }
  } catch (e) {
    setStatus(`Error: ${e.message}`);
    toast(`Error: ${e.message}`);
  }
});

load();