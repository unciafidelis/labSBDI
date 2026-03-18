const express = require("express");
const db = require("./db");

const USER_TYPES = ["alumno", "docente", "externo", "bibliotecario", "admin"];
const EJEMPLAR_ESTADOS = ["disponible", "prestado", "reservado", "mantenimiento", "baja"];
const PRESTAMO_ESTADOS = ["activo", "vencido", "cerrado", "cancelado"];
const PRESTAMO_ITEM_ESTADOS = ["activo", "devuelto", "vencido"];
const RESERVA_ESTADOS = ["activa", "cancelada", "cumplida", "expirada"];

function apiRouter() {
  const router = express.Router();

  // =========================
  // HELPERS
  // =========================
  const route = (handler) => (req, res, next) => {
    try {
      return handler(req, res, next);
    } catch (err) {
      return handleError(res, err);
    }
  };

  const httpError = (status, message) => {
    const err = new Error(message);
    err.status = status;
    return err;
  };

  const handleError = (res, err) => {
    console.error(err);

    if (err?.status) {
      return res.status(err.status).json({ ok: false, message: err.message });
    }

    const code = String(err?.code || "");

    if (code.includes("SQLITE_CONSTRAINT_UNIQUE")) {
      return res.status(409).json({
        ok: false,
        message: "Registro duplicado. Verifica campos únicos como ISBN, email o código de barras."
      });
    }

    if (code.includes("SQLITE_CONSTRAINT_FOREIGNKEY")) {
      return res.status(409).json({
        ok: false,
        message: "No se puede realizar la operación por relaciones existentes en la base de datos."
      });
    }

    if (code.includes("SQLITE_CONSTRAINT_CHECK")) {
      return res.status(400).json({
        ok: false,
        message: "Uno o más valores no cumplen las restricciones permitidas."
      });
    }

    if (code.includes("SQLITE_CONSTRAINT_NOTNULL")) {
      return res.status(400).json({
        ok: false,
        message: "Faltan campos obligatorios."
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor."
    });
  };

  const toInt = (value, defaultValue = 0) => {
    const n = Number(value);
    return Number.isInteger(n) ? n : defaultValue;
  };

  const requireId = (value, label = "ID") => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      throw httpError(400, `${label} inválido.`);
    }
    return id;
  };

  const cleanText = (value) => {
    if (value === undefined || value === null) return null;
    const s = String(value).trim();
    return s.length ? s : null;
  };

  const requireText = (value, label, min = 2) => {
    const s = cleanText(value);
    if (!s || s.length < min) {
      throw httpError(400, `${label} requerido.`);
    }
    return s;
  };

  const optionalPositiveInt = (value, label) => {
    if (value === undefined || value === null || String(value).trim() === "") return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
      throw httpError(400, `${label} inválido.`);
    }
    return n;
  };

  const optionalNonNegativeNumber = (value, label) => {
    if (value === undefined || value === null || String(value).trim() === "") return 0;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      throw httpError(400, `${label} inválido.`);
    }
    return n;
  };

  const bool01 = (value, defaultValue = 1) => {
    if (value === undefined || value === null || value === "") return defaultValue;
    if (value === 1 || value === "1" || value === true) return 1;
    if (value === 0 || value === "0" || value === false) return 0;
    throw httpError(400, "Valor booleano inválido.");
  };

  const enumValue = (value, allowed, fallback, label) => {
    const s = cleanText(value);
    const finalValue = s ?? fallback;
    if (!allowed.includes(finalValue)) {
      throw httpError(400, `${label} inválido.`);
    }
    return finalValue;
  };

  const exists = (table, id) => {
    const row = db.prepare(`SELECT ID FROM ${table} WHERE ID = ?`).get(id);
    return !!row;
  };

  // =========================
  // AUTORES
  // =========================
  router.get("/autores", route((req, res) => {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(toInt(req.query.limit, 50), 200);
    const offset = Math.max(toInt(req.query.offset, 0), 0);

    const rows = db.prepare(`
      SELECT ID, NOMBRE, NACIONALIDAD, BIBLIOGRAFIA, CREATED_AT, UPDATED_AT
      FROM AUTOR
      WHERE (? = '' OR NOMBRE LIKE '%' || ? || '%' OR NACIONALIDAD LIKE '%' || ? || '%')
      ORDER BY ID DESC
      LIMIT ? OFFSET ?;
    `).all(q, q, q, limit, offset);

    res.json({ ok: true, data: rows });
  }));

  router.get("/autores/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const row = db.prepare(`
      SELECT ID, NOMBRE, NACIONALIDAD, BIBLIOGRAFIA, CREATED_AT, UPDATED_AT
      FROM AUTOR
      WHERE ID = ?;
    `).get(id);

    if (!row) throw httpError(404, "Autor no encontrado.");
    res.json({ ok: true, data: row });
  }));

  router.post("/autores", route((req, res) => {
    const nombre = requireText(req.body?.nombre, "Nombre de autor");
    const nacionalidad = cleanText(req.body?.nacionalidad);
    const bibliografia = cleanText(req.body?.bibliografia);

    const info = db.prepare(`
      INSERT INTO AUTOR (NOMBRE, NACIONALIDAD, BIBLIOGRAFIA)
      VALUES (?, ?, ?);
    `).run(nombre, nacionalidad, bibliografia);

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  }));

  router.put("/autores/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const nombre = requireText(req.body?.nombre, "Nombre");
    const nacionalidad = cleanText(req.body?.nacionalidad);
    const bibliografia = cleanText(req.body?.bibliografia);

    const info = db.prepare(`
      UPDATE AUTOR
      SET NOMBRE = ?,
          NACIONALIDAD = ?,
          BIBLIOGRAFIA = ?,
          UPDATED_AT = CURRENT_TIMESTAMP
      WHERE ID = ?;
    `).run(nombre, nacionalidad, bibliografia, id);

    if (info.changes === 0) throw httpError(404, "Autor no encontrado.");
    res.json({ ok: true, changes: info.changes });
  }));

  router.delete("/autores/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const info = db.prepare(`DELETE FROM AUTOR WHERE ID = ?;`).run(id);

    if (info.changes === 0) throw httpError(404, "Autor no encontrado.");
    res.json({ ok: true, changes: info.changes });
  }));

  // =========================
  // EDITORIALES
  // =========================
  router.get("/editoriales", route((req, res) => {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(toInt(req.query.limit, 50), 200);
    const offset = Math.max(toInt(req.query.offset, 0), 0);

    const rows = db.prepare(`
      SELECT ID, NOMBRE, DIRECCION, TELEFONO, EMAIL, CREATED_AT, UPDATED_AT
      FROM EDITORIAL
      WHERE (? = '' OR NOMBRE LIKE '%' || ? || '%' OR EMAIL LIKE '%' || ? || '%')
      ORDER BY ID DESC
      LIMIT ? OFFSET ?;
    `).all(q, q, q, limit, offset);

    res.json({ ok: true, data: rows });
  }));

  router.get("/editoriales/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const row = db.prepare(`
      SELECT ID, NOMBRE, DIRECCION, TELEFONO, EMAIL, CREATED_AT, UPDATED_AT
      FROM EDITORIAL
      WHERE ID = ?;
    `).get(id);

    if (!row) throw httpError(404, "Editorial no encontrada.");
    res.json({ ok: true, data: row });
  }));

  router.post("/editoriales", route((req, res) => {
    const nombre = requireText(req.body?.nombre, "Nombre de editorial");
    const direccion = cleanText(req.body?.direccion);
    const telefono = cleanText(req.body?.telefono);
    const email = cleanText(req.body?.email);

    const info = db.prepare(`
      INSERT INTO EDITORIAL (NOMBRE, DIRECCION, TELEFONO, EMAIL)
      VALUES (?, ?, ?, ?);
    `).run(nombre, direccion, telefono, email);

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  }));

  router.put("/editoriales/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const nombre = requireText(req.body?.nombre, "Nombre");
    const direccion = cleanText(req.body?.direccion);
    const telefono = cleanText(req.body?.telefono);
    const email = cleanText(req.body?.email);

    const info = db.prepare(`
      UPDATE EDITORIAL
      SET NOMBRE = ?,
          DIRECCION = ?,
          TELEFONO = ?,
          EMAIL = ?,
          UPDATED_AT = CURRENT_TIMESTAMP
      WHERE ID = ?;
    `).run(nombre, direccion, telefono, email, id);

    if (info.changes === 0) throw httpError(404, "Editorial no encontrada.");
    res.json({ ok: true, changes: info.changes });
  }));

  router.delete("/editoriales/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const info = db.prepare(`DELETE FROM EDITORIAL WHERE ID = ?;`).run(id);

    if (info.changes === 0) throw httpError(404, "Editorial no encontrada.");
    res.json({ ok: true, changes: info.changes });
  }));

  // =========================
  // USUARIOS
  // =========================
  router.get("/usuarios", route((req, res) => {
    const q = String(req.query.q || "").trim();
    const tipo = String(req.query.tipo || "").trim();
    const activo = req.query.activo;

    let sql = `
      SELECT ID, NOMBRE, EMAIL, TELEFONO, DIRECCION, TIPO, ACTIVO, FECHA_REGISTRO, UPDATED_AT
      FROM USUARIO
      WHERE (? = '' OR NOMBRE LIKE '%' || ? || '%' OR EMAIL LIKE '%' || ? || '%')
    `;
    const params = [q, q, q];

    if (tipo) {
      sql += ` AND TIPO = ? `;
      params.push(tipo);
    }

    if (activo !== undefined && activo !== "") {
      sql += ` AND ACTIVO = ? `;
      params.push(bool01(activo));
    }

    sql += ` ORDER BY ID DESC; `;

    const rows = db.prepare(sql).all(...params);
    res.json({ ok: true, data: rows });
  }));

  router.get("/usuarios/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const row = db.prepare(`
      SELECT ID, NOMBRE, EMAIL, TELEFONO, DIRECCION, TIPO, ACTIVO, FECHA_REGISTRO, UPDATED_AT
      FROM USUARIO
      WHERE ID = ?;
    `).get(id);

    if (!row) throw httpError(404, "Usuario no encontrado.");
    res.json({ ok: true, data: row });
  }));

  router.post("/usuarios", route((req, res) => {
    const nombre = requireText(req.body?.nombre, "Nombre");
    const email = cleanText(req.body?.email);
    const telefono = cleanText(req.body?.telefono);
    const direccion = cleanText(req.body?.direccion);
    const tipo = enumValue(req.body?.tipo, USER_TYPES, "alumno", "Tipo");
    const activo = bool01(req.body?.activo, 1);

    const info = db.prepare(`
      INSERT INTO USUARIO (NOMBRE, EMAIL, TELEFONO, DIRECCION, TIPO, ACTIVO)
      VALUES (?, ?, ?, ?, ?, ?);
    `).run(nombre, email, telefono, direccion, tipo, activo);

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  }));

  router.put("/usuarios/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const nombre = requireText(req.body?.nombre, "Nombre");
    const email = cleanText(req.body?.email);
    const telefono = cleanText(req.body?.telefono);
    const direccion = cleanText(req.body?.direccion);
    const tipo = enumValue(req.body?.tipo, USER_TYPES, "alumno", "Tipo");
    const activo = bool01(req.body?.activo, 1);

    const info = db.prepare(`
      UPDATE USUARIO
      SET NOMBRE = ?,
          EMAIL = ?,
          TELEFONO = ?,
          DIRECCION = ?,
          TIPO = ?,
          ACTIVO = ?,
          UPDATED_AT = CURRENT_TIMESTAMP
      WHERE ID = ?;
    `).run(nombre, email, telefono, direccion, tipo, activo, id);

    if (info.changes === 0) throw httpError(404, "Usuario no encontrado.");
    res.json({ ok: true, changes: info.changes });
  }));

  router.delete("/usuarios/:id", route((req, res) => {
    const id = requireId(req.params.id);

    const info = db.prepare(`
      UPDATE USUARIO
      SET ACTIVO = 0,
          UPDATED_AT = CURRENT_TIMESTAMP
      WHERE ID = ?;
    `).run(id);

    if (info.changes === 0) throw httpError(404, "Usuario no encontrado.");
    res.json({ ok: true, changes: info.changes });
  }));

  router.put("/usuarios/:id/reactivar", route((req, res) => {
    const id = requireId(req.params.id);

    const info = db.prepare(`
      UPDATE USUARIO
      SET ACTIVO = 1,
          UPDATED_AT = CURRENT_TIMESTAMP
      WHERE ID = ?;
    `).run(id);

    if (info.changes === 0) throw httpError(404, "Usuario no encontrado.");
    res.json({ ok: true, changes: info.changes });
  }));

  // =========================
  // LIBROS
  // =========================
  router.get("/libros", route((req, res) => {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(toInt(req.query.limit, 50), 200);
    const offset = Math.max(toInt(req.query.offset, 0), 0);

    const rows = db.prepare(`
      SELECT
        L.ID,
        L.TITULO,
        L.ISBN,
        L.GENERO,
        L.IDIOMA,
        L.PAGINAS,
        L.FECHA_PUBLICACION,
        L.DESCRIPCION,
        L.CREATED_AT,
        L.UPDATED_AT,
        (
          SELECT GROUP_CONCAT(A.NOMBRE, ', ')
          FROM LIBRO_AUTOR LA
          JOIN AUTOR A ON A.ID = LA.AUTOR_ID
          WHERE LA.LIBRO_ID = L.ID
        ) AS AUTORES,
        (
          SELECT COUNT(*)
          FROM EDICION E
          JOIN EJEMPLAR J ON J.EDICION_ID = E.ID
          WHERE E.LIBRO_ID = L.ID
        ) AS TOTAL_EJEMPLARES,
        (
          SELECT COUNT(*)
          FROM EDICION E
          JOIN EJEMPLAR J ON J.EDICION_ID = E.ID
          WHERE E.LIBRO_ID = L.ID AND J.ESTADO = 'disponible'
        ) AS DISPONIBLES
      FROM LIBRO L
      WHERE (
        ? = ''
        OR L.TITULO LIKE '%' || ? || '%'
        OR L.ISBN LIKE '%' || ? || '%'
        OR L.GENERO LIKE '%' || ? || '%'
        OR L.IDIOMA LIKE '%' || ? || '%'
      )
      ORDER BY L.ID DESC
      LIMIT ? OFFSET ?;
    `).all(q, q, q, q, q, limit, offset);

    res.json({ ok: true, data: rows });
  }));

  router.get("/libros/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const row = db.prepare(`
      SELECT ID, TITULO, ISBN, GENERO, IDIOMA, PAGINAS, FECHA_PUBLICACION, DESCRIPCION, CREATED_AT, UPDATED_AT
      FROM LIBRO
      WHERE ID = ?;
    `).get(id);

    if (!row) throw httpError(404, "Libro no encontrado.");
    res.json({ ok: true, data: row });
  }));

  router.get("/libros/:id/detail", route((req, res) => {
    const id = requireId(req.params.id);

    const libro = db.prepare(`
      SELECT ID, TITULO, ISBN, GENERO, IDIOMA, PAGINAS, FECHA_PUBLICACION, DESCRIPCION, CREATED_AT, UPDATED_AT
      FROM LIBRO
      WHERE ID = ?;
    `).get(id);

    if (!libro) throw httpError(404, "Libro no encontrado.");

    const autores = db.prepare(`
      SELECT A.ID, A.NOMBRE, LA.ORDEN_AUTORIA, LA.ROL
      FROM LIBRO_AUTOR LA
      JOIN AUTOR A ON A.ID = LA.AUTOR_ID
      WHERE LA.LIBRO_ID = ?
      ORDER BY COALESCE(LA.ORDEN_AUTORIA, 9999), A.NOMBRE;
    `).all(id);

    const ediciones = db.prepare(`
      SELECT
        E.ID,
        E.LIBRO_ID,
        E.EDITORIAL_ID,
        E.NUM_EDICION,
        E.FECHA_LANZAMIENTO,
        E.LUGAR_PUBLICACION,
        E.ISBN_EDICION,
        E.CREATED_AT,
        E.UPDATED_AT,
        ED.NOMBRE AS EDITORIAL_NOMBRE,
        (
          SELECT COUNT(*)
          FROM EJEMPLAR J
          WHERE J.EDICION_ID = E.ID
        ) AS TOTAL_EJEMPLARES,
        (
          SELECT COUNT(*)
          FROM EJEMPLAR J
          WHERE J.EDICION_ID = E.ID AND J.ESTADO = 'disponible'
        ) AS DISPONIBLES
      FROM EDICION E
      JOIN EDITORIAL ED ON ED.ID = E.EDITORIAL_ID
      WHERE E.LIBRO_ID = ?
      ORDER BY E.ID DESC;
    `).all(id);

    res.json({ ok: true, data: { libro, autores, ediciones } });
  }));

  router.post("/libros", route((req, res) => {
    const titulo = requireText(req.body?.titulo, "Título");
    const isbn = cleanText(req.body?.isbn);
    const genero = cleanText(req.body?.genero);
    const idioma = cleanText(req.body?.idioma);
    const paginas = optionalPositiveInt(req.body?.paginas, "Páginas");
    const fecha_publicacion = cleanText(req.body?.fecha_publicacion);
    const descripcion = cleanText(req.body?.descripcion);

    const info = db.prepare(`
      INSERT INTO LIBRO (TITULO, ISBN, GENERO, IDIOMA, PAGINAS, FECHA_PUBLICACION, DESCRIPCION)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `).run(titulo, isbn, genero, idioma, paginas, fecha_publicacion, descripcion);

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  }));

  router.put("/libros/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const titulo = requireText(req.body?.titulo, "Título");
    const isbn = cleanText(req.body?.isbn);
    const genero = cleanText(req.body?.genero);
    const idioma = cleanText(req.body?.idioma);
    const paginas = optionalPositiveInt(req.body?.paginas, "Páginas");
    const fecha_publicacion = cleanText(req.body?.fecha_publicacion);
    const descripcion = cleanText(req.body?.descripcion);

    const info = db.prepare(`
      UPDATE LIBRO
      SET TITULO = ?,
          ISBN = ?,
          GENERO = ?,
          IDIOMA = ?,
          PAGINAS = ?,
          FECHA_PUBLICACION = ?,
          DESCRIPCION = ?,
          UPDATED_AT = CURRENT_TIMESTAMP
      WHERE ID = ?;
    `).run(titulo, isbn, genero, idioma, paginas, fecha_publicacion, descripcion, id);

    if (info.changes === 0) throw httpError(404, "Libro no encontrado.");
    res.json({ ok: true, changes: info.changes });
  }));

  router.delete("/libros/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const info = db.prepare(`DELETE FROM LIBRO WHERE ID = ?;`).run(id);

    if (info.changes === 0) throw httpError(404, "Libro no encontrado.");
    res.json({ ok: true, changes: info.changes });
  }));

  router.put("/libros/:id/autores", route((req, res) => {
    const libroId = requireId(req.params.id, "ID de libro");
    const autores = Array.isArray(req.body?.autores) ? req.body.autores : [];

    if (!exists("LIBRO", libroId)) {
      throw httpError(404, "Libro no encontrado.");
    }

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM LIBRO_AUTOR WHERE LIBRO_ID = ?;`).run(libroId);

      if (autores.length === 0) return;

      const insert = db.prepare(`
        INSERT INTO LIBRO_AUTOR (LIBRO_ID, AUTOR_ID, ORDEN_AUTORIA, ROL)
        VALUES (?, ?, ?, ?);
      `);

      const used = new Set();

      for (const item of autores) {
        const autorId = requireId(item?.autor_id, "autor_id");
        if (used.has(autorId)) continue;
        used.add(autorId);

        insert.run(
          libroId,
          autorId,
          optionalPositiveInt(item?.orden_autoria, "orden_autoria"),
          cleanText(item?.rol)
        );
      }
    });

    tx();
    res.json({ ok: true });
  }));

  // =========================
  // EDICIONES
  // =========================
  router.get("/ediciones", route((req, res) => {
    const libroId = toInt(req.query.libro_id, 0);
    const editorialId = toInt(req.query.editorial_id, 0);

    let sql = `
      SELECT
        E.ID,
        E.LIBRO_ID,
        E.EDITORIAL_ID,
        E.NUM_EDICION,
        E.FECHA_LANZAMIENTO,
        E.LUGAR_PUBLICACION,
        E.ISBN_EDICION,
        E.CREATED_AT,
        E.UPDATED_AT,
        L.TITULO AS LIBRO_TITULO,
        ED.NOMBRE AS EDITORIAL_NOMBRE
      FROM EDICION E
      JOIN LIBRO L ON L.ID = E.LIBRO_ID
      JOIN EDITORIAL ED ON ED.ID = E.EDITORIAL_ID
      WHERE 1 = 1
    `;
    const params = [];

    if (libroId > 0) {
      sql += ` AND E.LIBRO_ID = ? `;
      params.push(libroId);
    }

    if (editorialId > 0) {
      sql += ` AND E.EDITORIAL_ID = ? `;
      params.push(editorialId);
    }

    sql += ` ORDER BY E.ID DESC; `;

    const rows = db.prepare(sql).all(...params);
    res.json({ ok: true, data: rows });
  }));

  router.get("/ediciones/:id", route((req, res) => {
    const id = requireId(req.params.id);

    const row = db.prepare(`
      SELECT
        E.ID,
        E.LIBRO_ID,
        E.EDITORIAL_ID,
        E.NUM_EDICION,
        E.FECHA_LANZAMIENTO,
        E.LUGAR_PUBLICACION,
        E.ISBN_EDICION,
        E.CREATED_AT,
        E.UPDATED_AT,
        L.TITULO AS LIBRO_TITULO,
        ED.NOMBRE AS EDITORIAL_NOMBRE
      FROM EDICION E
      JOIN LIBRO L ON L.ID = E.LIBRO_ID
      JOIN EDITORIAL ED ON ED.ID = E.EDITORIAL_ID
      WHERE E.ID = ?;
    `).get(id);

    if (!row) throw httpError(404, "Edición no encontrada.");
    res.json({ ok: true, data: row });
  }));

  router.post("/ediciones", route((req, res) => {
    const libro_id = requireId(req.body?.libro_id, "libro_id");
    const editorial_id = requireId(req.body?.editorial_id, "editorial_id");
    const num_edicion = optionalPositiveInt(req.body?.num_edicion, "num_edicion");
    const fecha_lanzamiento = cleanText(req.body?.fecha_lanzamiento);
    const lugar_publicacion = cleanText(req.body?.lugar_publicacion);
    const isbn_edicion = cleanText(req.body?.isbn_edicion);

    const info = db.prepare(`
      INSERT INTO EDICION (LIBRO_ID, EDITORIAL_ID, NUM_EDICION, FECHA_LANZAMIENTO, LUGAR_PUBLICACION, ISBN_EDICION)
      VALUES (?, ?, ?, ?, ?, ?);
    `).run(
      libro_id,
      editorial_id,
      num_edicion,
      fecha_lanzamiento,
      lugar_publicacion,
      isbn_edicion
    );

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  }));

  router.put("/ediciones/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const libro_id = requireId(req.body?.libro_id, "libro_id");
    const editorial_id = requireId(req.body?.editorial_id, "editorial_id");
    const num_edicion = optionalPositiveInt(req.body?.num_edicion, "num_edicion");
    const fecha_lanzamiento = cleanText(req.body?.fecha_lanzamiento);
    const lugar_publicacion = cleanText(req.body?.lugar_publicacion);
    const isbn_edicion = cleanText(req.body?.isbn_edicion);

    const info = db.prepare(`
      UPDATE EDICION
      SET LIBRO_ID = ?,
          EDITORIAL_ID = ?,
          NUM_EDICION = ?,
          FECHA_LANZAMIENTO = ?,
          LUGAR_PUBLICACION = ?,
          ISBN_EDICION = ?
      WHERE ID = ?;
    `).run(
      libro_id,
      editorial_id,
      num_edicion,
      fecha_lanzamiento,
      lugar_publicacion,
      isbn_edicion,
      id
    );

    if (info.changes === 0) throw httpError(404, "Edición no encontrada.");
    res.json({ ok: true, changes: info.changes });
  }));

  router.delete("/ediciones/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const info = db.prepare(`DELETE FROM EDICION WHERE ID = ?;`).run(id);

    if (info.changes === 0) throw httpError(404, "Edición no encontrada.");
    res.json({ ok: true, changes: info.changes });
  }));

  // =========================
  // EJEMPLARES
  // =========================
  router.get("/ejemplares", route((req, res) => {
    const q = String(req.query.q || "").trim();
    const estado = String(req.query.estado || "").trim();
    const edicionId = toInt(req.query.edicion_id, 0);

    let sql = `
      SELECT
        J.ID,
        J.EDICION_ID,
        J.CODIGO_BARRAS,
        J.UBICACION,
        J.ESTADO,
        J.FECHA_ALTA,
        L.TITULO AS LIBRO_TITULO,
        E.ISBN_EDICION,
        ED.NOMBRE AS EDITORIAL_NOMBRE
      FROM EJEMPLAR J
      JOIN EDICION E ON E.ID = J.EDICION_ID
      JOIN LIBRO L ON L.ID = E.LIBRO_ID
      JOIN EDITORIAL ED ON ED.ID = E.EDITORIAL_ID
      WHERE (? = '' OR J.CODIGO_BARRAS LIKE '%' || ? || '%' OR L.TITULO LIKE '%' || ? || '%')
    `;
    const params = [q, q, q];

    if (estado) {
      sql += ` AND J.ESTADO = ? `;
      params.push(estado);
    }

    if (edicionId > 0) {
      sql += ` AND J.EDICION_ID = ? `;
      params.push(edicionId);
    }

    sql += ` ORDER BY J.ID DESC; `;

    const rows = db.prepare(sql).all(...params);
    res.json({ ok: true, data: rows });
  }));

  router.get("/ejemplares/lookup", route((req, res) => {
    const codigo = requireText(req.query.codigo, "codigo", 1);

    const row = db.prepare(`
      SELECT
        J.ID,
        J.CODIGO_BARRAS,
        J.ESTADO,
        J.UBICACION,
        L.TITULO AS LIBRO_TITULO
      FROM EJEMPLAR J
      JOIN EDICION E ON E.ID = J.EDICION_ID
      JOIN LIBRO L ON L.ID = E.LIBRO_ID
      WHERE J.CODIGO_BARRAS = ?;
    `).get(codigo);

    if (!row) throw httpError(404, "No encontrado.");
    res.json({ ok: true, data: row });
  }));

  router.get("/ejemplares/:id", route((req, res) => {
    const id = requireId(req.params.id);

    const row = db.prepare(`
      SELECT
        J.ID,
        J.EDICION_ID,
        J.CODIGO_BARRAS,
        J.UBICACION,
        J.ESTADO,
        J.FECHA_ALTA,
        L.TITULO AS LIBRO_TITULO,
        E.ISBN_EDICION,
        ED.NOMBRE AS EDITORIAL_NOMBRE
      FROM EJEMPLAR J
      JOIN EDICION E ON E.ID = J.EDICION_ID
      JOIN LIBRO L ON L.ID = E.LIBRO_ID
      JOIN EDITORIAL ED ON ED.ID = E.EDITORIAL_ID
      WHERE J.ID = ?;
    `).get(id);

    if (!row) throw httpError(404, "Ejemplar no encontrado.");
    res.json({ ok: true, data: row });
  }));

  router.post("/ejemplares", route((req, res) => {
    const edicion_id = requireId(req.body?.edicion_id, "edicion_id");
    const codigo_barras = requireText(req.body?.codigo_barras, "codigo_barras", 1);
    const ubicacion = cleanText(req.body?.ubicacion);
    const estado = enumValue(req.body?.estado, EJEMPLAR_ESTADOS, "disponible", "Estado");

    const info = db.prepare(`
      INSERT INTO EJEMPLAR (EDICION_ID, CODIGO_BARRAS, UBICACION, ESTADO)
      VALUES (?, ?, ?, ?);
    `).run(edicion_id, codigo_barras, ubicacion, estado);

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  }));

  router.put("/ejemplares/:id", route((req, res) => {
    const id = requireId(req.params.id);

    const actual = db.prepare(`
      SELECT ID, EDICION_ID, CODIGO_BARRAS, UBICACION, ESTADO
      FROM EJEMPLAR
      WHERE ID = ?;
    `).get(id);

    if (!actual) throw httpError(404, "Ejemplar no encontrado.");

    const edicion_id = req.body?.edicion_id !== undefined
      ? requireId(req.body?.edicion_id, "edicion_id")
      : actual.EDICION_ID;

    const codigo_barras = req.body?.codigo_barras !== undefined
      ? requireText(req.body?.codigo_barras, "codigo_barras", 1)
      : actual.CODIGO_BARRAS;

    const ubicacion = req.body?.ubicacion !== undefined
      ? cleanText(req.body?.ubicacion)
      : actual.UBICACION;

    const estado = req.body?.estado !== undefined
      ? enumValue(req.body?.estado, EJEMPLAR_ESTADOS, actual.ESTADO, "Estado")
      : actual.ESTADO;

    const info = db.prepare(`
      UPDATE EJEMPLAR
      SET EDICION_ID = ?,
          CODIGO_BARRAS = ?,
          UBICACION = ?,
          ESTADO = ?
      WHERE ID = ?;
    `).run(edicion_id, codigo_barras, ubicacion, estado, id);

    res.json({ ok: true, changes: info.changes });
  }));

  router.delete("/ejemplares/:id", route((req, res) => {
    const id = requireId(req.params.id);
    const info = db.prepare(`DELETE FROM EJEMPLAR WHERE ID = ?;`).run(id);

    if (info.changes === 0) throw httpError(404, "Ejemplar no encontrado.");
    res.json({ ok: true, changes: info.changes });
  }));

  // =========================
  // PRESTAMOS
  // =========================
  router.get("/prestamos", route((req, res) => {
    const estado = String(req.query.estado || "").trim();
    const usuarioId = toInt(req.query.usuario_id, 0);

    let sql = `
      SELECT
        P.ID,
        P.USUARIO_ID,
        U.NOMBRE AS USUARIO_NOMBRE,
        P.FECHA_PRESTAMO,
        P.ESTADO,
        P.OBSERVACIONES,
        (
          SELECT COUNT(*)
          FROM PRESTAMO_ITEM PI
          WHERE PI.PRESTAMO_ID = P.ID
        ) AS ITEMS,
        (
          SELECT COUNT(*)
          FROM PRESTAMO_ITEM PI
          WHERE PI.PRESTAMO_ID = P.ID
            AND PI.ESTADO = 'activo'
            AND datetime(PI.FECHA_VENCIMIENTO) < datetime('now')
        ) AS VENCIDOS
      FROM PRESTAMO P
      JOIN USUARIO U ON U.ID = P.USUARIO_ID
      WHERE 1 = 1
    `;
    const params = [];

    if (estado) {
      sql += ` AND P.ESTADO = ? `;
      params.push(estado);
    }

    if (usuarioId > 0) {
      sql += ` AND P.USUARIO_ID = ? `;
      params.push(usuarioId);
    }

    sql += ` ORDER BY P.ID DESC; `;

    const rows = db.prepare(sql).all(...params);
    res.json({ ok: true, data: rows });
  }));

  router.get("/prestamos/:id", route((req, res) => {
    const id = requireId(req.params.id);

    const prestamo = db.prepare(`
      SELECT
        P.ID,
        P.USUARIO_ID,
        U.NOMBRE AS USUARIO_NOMBRE,
        P.FECHA_PRESTAMO,
        P.ESTADO,
        P.OBSERVACIONES
      FROM PRESTAMO P
      JOIN USUARIO U ON U.ID = P.USUARIO_ID
      WHERE P.ID = ?;
    `).get(id);

    if (!prestamo) throw httpError(404, "Préstamo no encontrado.");

    const items = db.prepare(`
      SELECT
        PI.PRESTAMO_ID,
        PI.EJEMPLAR_ID,
        PI.FECHA_VENCIMIENTO,
        PI.FECHA_DEVOLUCION,
        PI.ESTADO,
        PI.CONDICION_DEVOLUCION,
        PI.MULTA_MXN,
        J.CODIGO_BARRAS,
        L.TITULO AS LIBRO_TITULO
      FROM PRESTAMO_ITEM PI
      JOIN EJEMPLAR J ON J.ID = PI.EJEMPLAR_ID
      JOIN EDICION E ON E.ID = J.EDICION_ID
      JOIN LIBRO L ON L.ID = E.LIBRO_ID
      WHERE PI.PRESTAMO_ID = ?
      ORDER BY PI.EJEMPLAR_ID DESC;
    `).all(id);

    res.json({ ok: true, data: { prestamo, items } });
  }));

  router.post("/prestamos", route((req, res) => {
    const usuario_id = requireId(req.body?.usuario_id, "usuario_id");
    const observaciones = cleanText(req.body?.observaciones);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (items.length === 0) {
      throw httpError(400, "Debes enviar al menos un item.");
    }

    const createTx = db.transaction(() => {
      const user = db.prepare(`
        SELECT ID, ACTIVO
        FROM USUARIO
        WHERE ID = ?;
      `).get(usuario_id);

      if (!user) throw httpError(404, "Usuario no existe.");
      if (user.ACTIVO !== 1) throw httpError(400, "Usuario inactivo.");

      const prestamoInfo = db.prepare(`
        INSERT INTO PRESTAMO (USUARIO_ID, OBSERVACIONES)
        VALUES (?, ?);
      `).run(usuario_id, observaciones);

      const prestamoId = prestamoInfo.lastInsertRowid;

      const getEjemplar = db.prepare(`
        SELECT ID, ESTADO
        FROM EJEMPLAR
        WHERE ID = ?;
      `);

      const insertItem = db.prepare(`
        INSERT INTO PRESTAMO_ITEM (PRESTAMO_ID, EJEMPLAR_ID, FECHA_VENCIMIENTO, ESTADO, MULTA_MXN)
        VALUES (?, ?, ?, 'activo', 0);
      `);

      const updateEjemplar = db.prepare(`
        UPDATE EJEMPLAR
        SET ESTADO = 'prestado'
        WHERE ID = ?;
      `);

      const used = new Set();

      for (const item of items) {
        const ejemplarId = requireId(item?.ejemplar_id, "ejemplar_id");
        const fechaVencimiento = requireText(item?.fecha_vencimiento, "fecha_vencimiento", 1);

        if (used.has(ejemplarId)) {
          throw httpError(400, "No puedes repetir el mismo ejemplar en un préstamo.");
        }
        used.add(ejemplarId);

        const ej = getEjemplar.get(ejemplarId);
        if (!ej) throw httpError(404, `El ejemplar ${ejemplarId} no existe.`);
        if (String(ej.ESTADO) !== "disponible") {
          throw httpError(409, `El ejemplar ${ejemplarId} no está disponible.`);
        }

        insertItem.run(prestamoId, ejemplarId, fechaVencimiento);
        updateEjemplar.run(ejemplarId);
      }

      return prestamoId;
    });

    const prestamoId = createTx();
    res.status(201).json({ ok: true, id: prestamoId });
  }));

  router.post("/prestamos/:id/devolver", route((req, res) => {
    const prestamoId = requireId(req.params.id, "prestamo_id");
    const ejemplar_id = requireId(req.body?.ejemplar_id, "ejemplar_id");
    const condicion_devolucion = cleanText(req.body?.condicion_devolucion);
    const multa_mxn = optionalNonNegativeNumber(req.body?.multa_mxn, "multa_mxn");

    const tx = db.transaction(() => {
      const item = db.prepare(`
        SELECT ESTADO
        FROM PRESTAMO_ITEM
        WHERE PRESTAMO_ID = ? AND EJEMPLAR_ID = ?;
      `).get(prestamoId, ejemplar_id);

      if (!item) throw httpError(404, "Item de préstamo no existe.");
      if (item.ESTADO !== "activo") throw httpError(409, "El item no está activo.");

      db.prepare(`
        UPDATE PRESTAMO_ITEM
        SET ESTADO = 'devuelto',
            FECHA_DEVOLUCION = CURRENT_TIMESTAMP,
            CONDICION_DEVOLUCION = ?,
            MULTA_MXN = ?
        WHERE PRESTAMO_ID = ? AND EJEMPLAR_ID = ?;
      `).run(condicion_devolucion, multa_mxn, prestamoId, ejemplar_id);

      db.prepare(`
        UPDATE EJEMPLAR
        SET ESTADO = 'disponible'
        WHERE ID = ?;
      `).run(ejemplar_id);

      const abiertos = db.prepare(`
        SELECT COUNT(*) AS total
        FROM PRESTAMO_ITEM
        WHERE PRESTAMO_ID = ? AND ESTADO = 'activo';
      `).get(prestamoId);

      if (abiertos.total === 0) {
        db.prepare(`
          UPDATE PRESTAMO
          SET ESTADO = 'cerrado'
          WHERE ID = ?;
        `).run(prestamoId);
      }
    });

    tx();
    res.json({ ok: true });
  }));

  router.put("/prestamos/:id/cancelar", route((req, res) => {
    const prestamoId = requireId(req.params.id);

    const tx = db.transaction(() => {
      const prestamo = db.prepare(`
        SELECT ID, ESTADO
        FROM PRESTAMO
        WHERE ID = ?;
      `).get(prestamoId);

      if (!prestamo) throw httpError(404, "Préstamo no encontrado.");
      if (prestamo.ESTADO !== "activo") {
        throw httpError(409, "Solo se pueden cancelar préstamos activos.");
      }

      const activos = db.prepare(`
        SELECT EJEMPLAR_ID
        FROM PRESTAMO_ITEM
        WHERE PRESTAMO_ID = ? AND ESTADO = 'activo';
      `).all(prestamoId);

      db.prepare(`
        UPDATE PRESTAMO_ITEM
        SET ESTADO = 'devuelto',
            FECHA_DEVOLUCION = CURRENT_TIMESTAMP,
            CONDICION_DEVOLUCION = 'cancelacion',
            MULTA_MXN = 0
        WHERE PRESTAMO_ID = ? AND ESTADO = 'activo';
      `).run(prestamoId);

      for (const row of activos) {
        db.prepare(`
          UPDATE EJEMPLAR
          SET ESTADO = 'disponible'
          WHERE ID = ?;
        `).run(row.EJEMPLAR_ID);
      }

      db.prepare(`
        UPDATE PRESTAMO
        SET ESTADO = 'cancelado'
        WHERE ID = ?;
      `).run(prestamoId);
    });

    tx();
    res.json({ ok: true });
  }));

  // =========================
  // RESERVAS
  // =========================
  router.get("/reservas", route((req, res) => {
    const estado = String(req.query.estado || "").trim();
    const usuarioId = toInt(req.query.usuario_id, 0);
    const libroId = toInt(req.query.libro_id, 0);

    let sql = `
      SELECT
        R.ID,
        R.USUARIO_ID,
        U.NOMBRE AS USUARIO_NOMBRE,
        R.LIBRO_ID,
        L.TITULO AS LIBRO_TITULO,
        R.FECHA_RESERVA,
        R.EXPIRA_EN,
        R.ESTADO
      FROM RESERVA R
      JOIN USUARIO U ON U.ID = R.USUARIO_ID
      JOIN LIBRO L ON L.ID = R.LIBRO_ID
      WHERE 1 = 1
    `;
    const params = [];

    if (estado) {
      sql += ` AND R.ESTADO = ? `;
      params.push(estado);
    }

    if (usuarioId > 0) {
      sql += ` AND R.USUARIO_ID = ? `;
      params.push(usuarioId);
    }

    if (libroId > 0) {
      sql += ` AND R.LIBRO_ID = ? `;
      params.push(libroId);
    }

    sql += ` ORDER BY R.ID DESC; `;

    const rows = db.prepare(sql).all(...params);
    res.json({ ok: true, data: rows });
  }));

  router.get("/reservas/:id", route((req, res) => {
    const id = requireId(req.params.id);

    const row = db.prepare(`
      SELECT
        R.ID,
        R.USUARIO_ID,
        U.NOMBRE AS USUARIO_NOMBRE,
        R.LIBRO_ID,
        L.TITULO AS LIBRO_TITULO,
        R.FECHA_RESERVA,
        R.EXPIRA_EN,
        R.ESTADO
      FROM RESERVA R
      JOIN USUARIO U ON U.ID = R.USUARIO_ID
      JOIN LIBRO L ON L.ID = R.LIBRO_ID
      WHERE R.ID = ?;
    `).get(id);

    if (!row) throw httpError(404, "Reserva no encontrada.");
    res.json({ ok: true, data: row });
  }));

  router.post("/reservas", route((req, res) => {
    const usuario_id = requireId(req.body?.usuario_id, "usuario_id");
    const libro_id = requireId(req.body?.libro_id, "libro_id");
    const expira_en = cleanText(req.body?.expira_en);

    const usuario = db.prepare(`SELECT ID, ACTIVO FROM USUARIO WHERE ID = ?;`).get(usuario_id);
    if (!usuario) throw httpError(404, "Usuario no existe.");
    if (usuario.ACTIVO !== 1) throw httpError(400, "Usuario inactivo.");

    if (!exists("LIBRO", libro_id)) {
      throw httpError(404, "Libro no existe.");
    }

    const info = db.prepare(`
      INSERT INTO RESERVA (USUARIO_ID, LIBRO_ID, EXPIRA_EN)
      VALUES (?, ?, ?);
    `).run(usuario_id, libro_id, expira_en);

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  }));

  router.put("/reservas/:id/cancelar", route((req, res) => {
    const id = requireId(req.params.id);

    const info = db.prepare(`
      UPDATE RESERVA
      SET ESTADO = 'cancelada'
      WHERE ID = ?;
    `).run(id);

    if (info.changes === 0) throw httpError(404, "Reserva no encontrada.");
    res.json({ ok: true, changes: info.changes });
  }));

  router.put("/reservas/:id/cumplir", route((req, res) => {
    const id = requireId(req.params.id);

    const info = db.prepare(`
      UPDATE RESERVA
      SET ESTADO = 'cumplida'
      WHERE ID = ?;
    `).run(id);

    if (info.changes === 0) throw httpError(404, "Reserva no encontrada.");
    res.json({ ok: true, changes: info.changes });
  }));

  router.put("/reservas/:id/expirar", route((req, res) => {
    const id = requireId(req.params.id);

    const info = db.prepare(`
      UPDATE RESERVA
      SET ESTADO = 'expirada'
      WHERE ID = ?;
    `).run(id);

    if (info.changes === 0) throw httpError(404, "Reserva no encontrada.");
    res.json({ ok: true, changes: info.changes });
  }));

  // =========================
  // SELECTS PARA UI
  // =========================
  router.get("/select/autores", route((req, res) => {
    const rows = db.prepare(`
      SELECT ID, NOMBRE
      FROM AUTOR
      ORDER BY NOMBRE;
    `).all();

    res.json({ ok: true, data: rows });
  }));

  router.get("/select/editoriales", route((req, res) => {
    const rows = db.prepare(`
      SELECT ID, NOMBRE
      FROM EDITORIAL
      ORDER BY NOMBRE;
    `).all();

    res.json({ ok: true, data: rows });
  }));

  router.get("/select/libros", route((req, res) => {
    const rows = db.prepare(`
      SELECT ID, TITULO
      FROM LIBRO
      ORDER BY TITULO;
    `).all();

    res.json({ ok: true, data: rows });
  }));

  router.get("/select/usuarios", route((req, res) => {
    const rows = db.prepare(`
      SELECT ID, NOMBRE
      FROM USUARIO
      WHERE ACTIVO = 1
      ORDER BY NOMBRE;
    `).all();

    res.json({ ok: true, data: rows });
  }));

  router.get("/select/ediciones", route((req, res) => {
    const libroId = toInt(req.query.libro_id, 0);

    const rows = db.prepare(`
      SELECT
        E.ID,
        (
          L.TITULO || ' — ' || ED.NOMBRE || COALESCE(' — Ed. ' || E.NUM_EDICION, '')
        ) AS LABEL
      FROM EDICION E
      JOIN LIBRO L ON L.ID = E.LIBRO_ID
      JOIN EDITORIAL ED ON ED.ID = E.EDITORIAL_ID
      WHERE (? = 0 OR E.LIBRO_ID = ?)
      ORDER BY E.ID DESC;
    `).all(libroId, libroId);

    res.json({ ok: true, data: rows });
  }));

  return router;
}

module.exports = { apiRouter };