// src/api.js
const express = require("express");
const { createStore } = require("./store");

function apiRouter() {
  const router = express.Router();
  const store = createStore();

  const toInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // -----------------------------
  // AUTORES
  // -----------------------------
  router.get("/autores", (req, res, next) => {
    try {
      const q = String(req.query.q || "");
      res.json({ ok: true, data: store.listAutores(q) });
    } catch (e) { next(e); }
  });

  router.post("/autores", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const a = store.createAutor(req.body || {});
        res.status(201).json({ ok: true, data: a });
      } catch (e) { next(e); }
    });
  });

  router.put("/autores/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const a = store.updateAutor(toInt(req.params.id), req.body || {});
        res.json({ ok: true, data: a });
      } catch (e) { next(e); }
    });
  });

  router.delete("/autores/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const ok = store.deleteAutor(toInt(req.params.id));
        res.json({ ok: true, changes: ok ? 1 : 0 });
      } catch (e) { next(e); }
    });
  });

  // -----------------------------
  // EDITORIALES
  // -----------------------------
  router.get("/editoriales", (req, res, next) => {
    try {
      const q = String(req.query.q || "");
      res.json({ ok: true, data: store.listEditoriales(q) });
    } catch (e) { next(e); }
  });

  router.post("/editoriales", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const x = store.createEditorial(req.body || {});
        res.status(201).json({ ok: true, data: x });
      } catch (e) { next(e); }
    });
  });

  router.put("/editoriales/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const x = store.updateEditorial(toInt(req.params.id), req.body || {});
        res.json({ ok: true, data: x });
      } catch (e) { next(e); }
    });
  });

  router.delete("/editoriales/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const ok = store.deleteEditorial(toInt(req.params.id));
        res.json({ ok: true, changes: ok ? 1 : 0 });
      } catch (e) { next(e); }
    });
  });

  // -----------------------------
  // USUARIOS
  // -----------------------------
  router.get("/usuarios", (req, res, next) => {
    try {
      const q = String(req.query.q || "");
      res.json({ ok: true, data: store.listUsuarios(q) });
    } catch (e) { next(e); }
  });

  router.post("/usuarios", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const u = store.createUsuario(req.body || {});
        res.status(201).json({ ok: true, data: u });
      } catch (e) { next(e); }
    });
  });

  router.put("/usuarios/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const u = store.updateUsuario(toInt(req.params.id), req.body || {});
        res.json({ ok: true, data: u });
      } catch (e) { next(e); }
    });
  });

  // Soft-delete -> desactivar
  router.delete("/usuarios/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const u = store.deactivateUsuario(toInt(req.params.id));
        res.json({ ok: true, data: u });
      } catch (e) { next(e); }
    });
  });

  // -----------------------------
  // LIBROS
  // -----------------------------
  router.get("/libros", (req, res, next) => {
    try {
      const q = String(req.query.q || "");
      res.json({ ok: true, data: store.listLibros(q) });
    } catch (e) { next(e); }
  });

  router.get("/libros/:id/detail", (req, res, next) => {
    try {
      res.json({ ok: true, data: store.getLibroDetail(toInt(req.params.id)) });
    } catch (e) { next(e); }
  });

  router.post("/libros", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const l = store.createLibro(req.body || {});
        res.status(201).json({ ok: true, data: l });
      } catch (e) { next(e); }
    });
  });

  router.put("/libros/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const l = store.updateLibro(toInt(req.params.id), req.body || {});
        res.json({ ok: true, data: l });
      } catch (e) { next(e); }
    });
  });

  router.delete("/libros/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const ok = store.deleteLibro(toInt(req.params.id));
        res.json({ ok: true, changes: ok ? 1 : 0 });
      } catch (e) { next(e); }
    });
  });

  router.put("/libros/:id/autores", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const libroId = toInt(req.params.id);
        const autores = Array.isArray(req.body?.autores) ? req.body.autores : [];
        store.replaceLibroAutores(libroId, autores);
        res.json({ ok: true });
      } catch (e) { next(e); }
    });
  });

  // -----------------------------
  // EDICIONES
  // -----------------------------
  router.get("/ediciones", (req, res, next) => {
    try {
      const libroId = toInt(req.query.libro_id || 0);
      res.json({ ok: true, data: store.listEdiciones(libroId) });
    } catch (e) { next(e); }
  });

  router.post("/ediciones", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const e = store.createEdicion(req.body || {});
        res.status(201).json({ ok: true, data: e });
      } catch (e) { next(e); }
    });
  });

  router.put("/ediciones/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const e = store.updateEdicion(toInt(req.params.id), req.body || {});
        res.json({ ok: true, data: e });
      } catch (e) { next(e); }
    });
  });

  router.delete("/ediciones/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const ok = store.deleteEdicion(toInt(req.params.id));
        res.json({ ok: true, changes: ok ? 1 : 0 });
      } catch (e) { next(e); }
    });
  });

  // -----------------------------
  // EJEMPLARES
  // -----------------------------
  router.get("/ejemplares", (req, res, next) => {
    try {
      const q = String(req.query.q || "");
      const estado = String(req.query.estado || "");
      res.json({ ok: true, data: store.listEjemplares(q, estado) });
    } catch (e) { next(e); }
  });

  router.get("/ejemplares/lookup", (req, res, next) => {
    try {
      const codigo = String(req.query.codigo || "");
      res.json({ ok: true, data: store.lookupEjemplar(codigo) });
    } catch (e) { next(e); }
  });

  router.post("/ejemplares", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const j = store.createEjemplar(req.body || {});
        res.status(201).json({ ok: true, data: j });
      } catch (e) { next(e); }
    });
  });

  router.put("/ejemplares/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const j = store.updateEjemplar(toInt(req.params.id), req.body || {});
        res.json({ ok: true, data: j });
      } catch (e) { next(e); }
    });
  });

  router.delete("/ejemplares/:id", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const ok = store.deleteEjemplar(toInt(req.params.id));
        res.json({ ok: true, changes: ok ? 1 : 0 });
      } catch (e) { next(e); }
    });
  });

  // -----------------------------
  // PRESTAMOS
  // -----------------------------
  router.get("/prestamos", (req, res, next) => {
    try {
      const estado = String(req.query.estado || "");
      res.json({ ok: true, data: store.listPrestamos(estado) });
    } catch (e) { next(e); }
  });

  router.get("/prestamos/:id", (req, res, next) => {
    try {
      res.json({ ok: true, data: store.getPrestamoDetail(toInt(req.params.id)) });
    } catch (e) { next(e); }
  });

  router.post("/prestamos", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const p = store.createPrestamo(req.body || {});
        res.status(201).json({ ok: true, data: p });
      } catch (e) { next(e); }
    });
  });

  router.post("/prestamos/:id/devolver", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const prestamoId = toInt(req.params.id);
        const ejemplarId = toInt(req.body?.ejemplar_id);
        if (!ejemplarId) {
          const e = new Error("ejemplar_id requerido");
          e.status = 400;
          throw e;
        }
        store.devolverItem(prestamoId, ejemplarId, req.body || {});
        res.json({ ok: true });
      } catch (e) { next(e); }
    });
  });

  // -----------------------------
  // RESERVAS
  // -----------------------------
  router.get("/reservas", (req, res, next) => {
    try {
      const estado = String(req.query.estado || "");
      res.json({ ok: true, data: store.listReservas(estado) });
    } catch (e) { next(e); }
  });

  router.post("/reservas", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const r = store.createReserva(req.body || {});
        res.status(201).json({ ok: true, data: r });
      } catch (e) { next(e); }
    });
  });

  router.put("/reservas/:id/cancelar", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const r = store.cancelarReserva(toInt(req.params.id));
        res.json({ ok: true, data: r });
      } catch (e) { next(e); }
    });
  });

  router.put("/reservas/:id/cumplir", (req, res, next) => {
    store.withWriteLock(async () => {
      try {
        const r = store.cumplirReserva(toInt(req.params.id));
        res.json({ ok: true, data: r });
      } catch (e) { next(e); }
    });
  });

  // -----------------------------
  // SELECTS para UI (contrato del frontend)
  // -----------------------------
  router.get("/select/autores", (req, res) => {
    const data = store.selectAutores().map((a) => ({ ID: a.id, NOMBRE: a.nombre }));
    res.json({ ok: true, data });
  });

  router.get("/select/editoriales", (req, res) => {
    const data = store.selectEditoriales().map((e) => ({ ID: e.id, NOMBRE: e.nombre }));
    res.json({ ok: true, data });
  });

  router.get("/select/libros", (req, res) => {
    const data = store.selectLibros().map((l) => ({ ID: l.id, TITULO: l.titulo }));
    res.json({ ok: true, data });
  });

  router.get("/select/usuarios", (req, res) => {
    const data = store.selectUsuariosActivos().map((u) => ({ ID: u.id, NOMBRE: u.nombre }));
    res.json({ ok: true, data });
  });

  router.get("/select/ediciones", (req, res) => {
    const libroId = toInt(req.query.libro_id || 0);
    const data = store.selectEdiciones(libroId).map((e) => ({ ID: e.id, LABEL: e.label }));
    res.json({ ok: true, data });
  });

  return router;
}

module.exports = { apiRouter };