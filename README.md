Perfecto. Tu BD **ya trae el modelo de biblioteca** (LIBRO, AUTOR, EJEMPLAR, PRESTAMO, RESERVA, etc.), pero tiene un detalle importante: **3 tablas tienen llaves foráneas apuntando a tablas “*_OLD”** (EDICION, LIBRO_AUTOR, RESERVA). Eso te va a romper inserts/updates si activas `foreign_keys = ON`. En este CRUD te dejo una **migración automática** que corrige eso **sin inventar tablas** (solo re-crea esas 3 con FKs correctas).

Además te genero el **sistema completo**: catálogo (libros/autores/editoriales/ediciones/ejemplares), usuarios, préstamos con devolución, y reservas, con interfaz web **minimalista** (blanco/negro + azul tipo Facebook `#1877F2`). ([Brand Color Code][1])

---

# 0) Coloca tu base de datos en el proyecto

1. Copia tu archivo **`SQLite (6).db`** a la raíz del proyecto y renómbralo:

```bash
cp "SQLite (6).db" biblioteca.db
```

2. (Opcional) Si NO quieres renombrar, usa variable:

```bash
export DB_PATH="/ruta/completa/SQLite (6).db"
```

---

# 1) Estructura del proyecto

```
crud-biblioteca/
  server.js
  package.json
  .env.example
  src/
    app.js
    db.js
    migrate.js
    api.js
    errors.js
  public/
    index.html
    styles.css
    app.js
```

---

# 2) BACKEND (Node.js + Express + better-sqlite3)

## Archivo: `package.json` (carpeta raíz)

```json
{
  "name": "crud-biblioteca",
  "version": "1.0.0",
  "main": "server.js",
  "type": "commonjs",
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "morgan": "^1.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.14"
  }
}
```

## Archivo: `.env.example` (carpeta raíz)

```bash
PORT=3000
DB_PATH=./biblioteca.db
```

## Archivo: `server.js` (carpeta raíz)

```js
require("dotenv").config();
const { createApp } = require("./src/app");

const PORT = Number(process.env.PORT || 3000);
const app = createApp();

app.listen(PORT, () => {
  console.log(`✅ Biblioteca lista en http://localhost:${PORT}`);
});
```

## Archivo: `src/app.js` (carpeta `src/`)

```js
const path = require("path");
const express = require("express");
const morgan = require("morgan");
const { apiRouter } = require("./api");
const { notFound, errorHandler } = require("./errors");

function createApp() {
  const app = express();

  app.use(morgan("dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.use("/api", apiRouter());

  const publicDir = path.join(process.cwd(), "public");
  app.use(express.static(publicDir));

  app.get("/", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
```

## Archivo: `src/db.js` (carpeta `src/`)

```js
const path = require("path");
const Database = require("better-sqlite3");
const { migrateIfNeeded } = require("./migrate");

function openDb() {
  const dbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(process.cwd(), "biblioteca.db");

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  migrateIfNeeded(db);

  db.pragma("foreign_keys = ON");
  return db;
}

module.exports = { openDb };
```

## Archivo: `src/migrate.js` (carpeta `src/`)

```js
function migrateIfNeeded(db) {
  db.pragma("foreign_keys = OFF");

  const tx = db.transaction(() => {
    fixOldFkTable(db, "EDICION", createEdicionSql());
    fixOldFkTable(db, "LIBRO_AUTOR", createLibroAutorSql());
    fixOldFkTable(db, "RESERVA", createReservaSql());

    ensureUpdatedAtTriggers(db);
  });

  tx();
  db.pragma("foreign_keys = ON");
}

function tableSql(db, name) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
  return row?.sql || "";
}

function fixOldFkTable(db, name, createSql) {
  const sql = tableSql(db, name);
  if (!sql) return;

  const hasOld = sql.includes("_OLD");
  if (!hasOld) return;

  const tmp = `${name}__OLD_FIX`;

  db.exec(`ALTER TABLE ${name} RENAME TO ${tmp};`);
  db.exec(createSql);

  const cols = db
    .prepare(`PRAGMA table_info(${tmp})`)
    .all()
    .map((c) => c.name);

  const colsNew = db
    .prepare(`PRAGMA table_info(${name})`)
    .all()
    .map((c) => c.name);

  const common = cols.filter((c) => colsNew.includes(c));

  if (common.length) {
    db.exec(
      `INSERT INTO ${name} (${common.join(",")})
       SELECT ${common.join(",")} FROM ${tmp};`
    );
  }

  db.exec(`DROP TABLE ${tmp};`);

  if (name === "EDICION") {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_edicion_libro ON EDICION (LIBRO_ID);`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_edicion_editorial ON EDICION (EDITORIAL_ID);`
    );
  }

  if (name === "LIBRO_AUTOR") {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_libro_autor_autor ON LIBRO_AUTOR (AUTOR_ID);`
    );
  }

  if (name === "RESERVA") {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_reserva_usuario ON RESERVA (USUARIO_ID);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_reserva_libro ON RESERVA (LIBRO_ID);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_reserva_estado ON RESERVA (ESTADO);`);

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_reserva_activa_usuario_libro
      ON RESERVA (USUARIO_ID, LIBRO_ID)
      WHERE ESTADO = 'activa';
    `);
  }
}

function createEdicionSql() {
  return `
    CREATE TABLE EDICION (
      ID                INTEGER PRIMARY KEY,
      LIBRO_ID          INTEGER NOT NULL,
      EDITORIAL_ID      INTEGER NOT NULL,
      NUM_EDICION       INTEGER CHECK (NUM_EDICION IS NULL OR NUM_EDICION > 0),
      FECHA_LANZAMIENTO TEXT,
      LUGAR_PUBLICACION TEXT,
      ISBN_EDICION      TEXT,
      CREATED_AT        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (LIBRO_ID) REFERENCES LIBRO(ID)
        ON UPDATE CASCADE ON DELETE CASCADE,
      FOREIGN KEY (EDITORIAL_ID) REFERENCES EDITORIAL(ID)
        ON UPDATE CASCADE ON DELETE RESTRICT,

      UNIQUE (LIBRO_ID, EDITORIAL_ID, NUM_EDICION, FECHA_LANZAMIENTO),
      UNIQUE (ISBN_EDICION)
    );
  `;
}

function createLibroAutorSql() {
  return `
    CREATE TABLE LIBRO_AUTOR (
      LIBRO_ID       INTEGER NOT NULL,
      AUTOR_ID       INTEGER NOT NULL,
      ORDEN_AUTORIA  INTEGER CHECK (ORDEN_AUTORIA IS NULL OR ORDEN_AUTORIA > 0),
      ROL            TEXT,
      PRIMARY KEY (LIBRO_ID, AUTOR_ID),
      FOREIGN KEY (LIBRO_ID) REFERENCES LIBRO(ID)
        ON UPDATE CASCADE ON DELETE CASCADE,
      FOREIGN KEY (AUTOR_ID) REFERENCES AUTOR(ID)
        ON UPDATE CASCADE ON DELETE RESTRICT
    ) WITHOUT ROWID;
  `;
}

function createReservaSql() {
  return `
    CREATE TABLE RESERVA (
      ID            INTEGER PRIMARY KEY,
      USUARIO_ID    INTEGER NOT NULL,
      LIBRO_ID      INTEGER NOT NULL,
      FECHA_RESERVA TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      EXPIRA_EN     TEXT,
      ESTADO        TEXT NOT NULL DEFAULT 'activa'
        CHECK (ESTADO IN ('activa','cancelada','cumplida','expirada')),

      FOREIGN KEY (USUARIO_ID) REFERENCES USUARIO(ID)
        ON UPDATE CASCADE ON DELETE RESTRICT,
      FOREIGN KEY (LIBRO_ID) REFERENCES LIBRO(ID)
        ON UPDATE CASCADE ON DELETE RESTRICT
    );
  `;
}

function ensureUpdatedAtTriggers(db) {
  const triggers = [
    ["AUTOR", "ID"],
    ["EDITORIAL", "ID"],
    ["LIBRO", "ID"],
    ["EDICION", "ID"],
    ["USUARIO", "ID"]
  ];

  for (const [table, pk] of triggers) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_${table.toLowerCase()}_updated_at
      AFTER UPDATE ON ${table}
      FOR EACH ROW
      BEGIN
        UPDATE ${table}
        SET UPDATED_AT = CURRENT_TIMESTAMP
        WHERE ${pk} = NEW.${pk};
      END;
    `);
  }
}

module.exports = { migrateIfNeeded };
```

## Archivo: `src/errors.js` (carpeta `src/`)

```js
function notFound(req, res) {
  res.status(404).json({ ok: false, message: "Ruta no encontrada" });
}

function errorHandler(err, req, res, next) {
  const isSqlite = err && typeof err === "object" && err.code === "SQLITE_ERROR";
  const isConstraint =
    err && typeof err === "object" && String(err.code || "").includes("SQLITE_CONSTRAINT");

  if (isConstraint) {
    return res.status(409).json({
      ok: false,
      message: "Conflicto en BD (constraint/unique/foreign key).",
      detail: err.message
    });
  }

  if (isSqlite) {
    return res.status(400).json({
      ok: false,
      message: "Error SQLite.",
      detail: err.message
    });
  }

  console.error(err);
  res.status(500).json({ ok: false, message: "Error interno", detail: err?.message });
}

module.exports = { notFound, errorHandler };
```

## Archivo: `src/api.js` (carpeta `src/`)

```js
const express = require("express");
const { openDb } = require("./db");

function apiRouter() {
  const router = express.Router();
  const db = openDb();

  // Helpers
  const toInt = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  // =========================
  // AUTORES
  // =========================
  router.get("/autores", (req, res) => {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(toInt(req.query.limit, 50), 200);
    const offset = Math.max(toInt(req.query.offset, 0), 0);

    const rows = db
      .prepare(
        `
        SELECT ID, NOMBRE, NACIONALIDAD, BIBLIOGRAFIA, CREATED_AT, UPDATED_AT
        FROM AUTOR
        WHERE (? = '' OR NOMBRE LIKE '%' || ? || '%' OR NACIONALIDAD LIKE '%' || ? || '%')
        ORDER BY ID DESC
        LIMIT ? OFFSET ?;
      `
      )
      .all(q, q, q, limit, offset);

    res.json({ ok: true, data: rows });
  });

  router.post("/autores", (req, res) => {
    const { nombre, nacionalidad, bibliografia } = req.body || {};
    if (!nombre || String(nombre).trim().length < 2) {
      return res.status(400).json({ ok: false, message: "Nombre de autor requerido." });
    }

    const info = db
      .prepare(
        `INSERT INTO AUTOR (NOMBRE, NACIONALIDAD, BIBLIOGRAFIA) VALUES (?,?,?)`
      )
      .run(String(nombre).trim(), nacionalidad ?? null, bibliografia ?? null);

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  });

  router.put("/autores/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    const { nombre, nacionalidad, bibliografia } = req.body || {};

    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });
    if (!nombre || String(nombre).trim().length < 2) {
      return res.status(400).json({ ok: false, message: "Nombre requerido." });
    }

    const info = db
      .prepare(
        `
        UPDATE AUTOR
        SET NOMBRE=?, NACIONALIDAD=?, BIBLIOGRAFIA=?
        WHERE ID=?;
      `
      )
      .run(String(nombre).trim(), nacionalidad ?? null, bibliografia ?? null, id);

    res.json({ ok: true, changes: info.changes });
  });

  router.delete("/autores/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const info = db.prepare(`DELETE FROM AUTOR WHERE ID=?;`).run(id);
    res.json({ ok: true, changes: info.changes });
  });

  // =========================
  // EDITORIALES
  // =========================
  router.get("/editoriales", (req, res) => {
    const q = String(req.query.q || "").trim();
    const rows = db
      .prepare(
        `
        SELECT ID, NOMBRE, DIRECCION, TELEFONO, EMAIL, CREATED_AT, UPDATED_AT
        FROM EDITORIAL
        WHERE (?='' OR NOMBRE LIKE '%'||?||'%' OR EMAIL LIKE '%'||?||'%')
        ORDER BY ID DESC;
      `
      )
      .all(q, q, q);

    res.json({ ok: true, data: rows });
  });

  router.post("/editoriales", (req, res) => {
    const { nombre, direccion, telefono, email } = req.body || {};
    if (!nombre || String(nombre).trim().length < 2) {
      return res.status(400).json({ ok: false, message: "Nombre de editorial requerido." });
    }

    const info = db
      .prepare(
        `INSERT INTO EDITORIAL (NOMBRE, DIRECCION, TELEFONO, EMAIL) VALUES (?,?,?,?)`
      )
      .run(String(nombre).trim(), direccion ?? null, telefono ?? null, email ?? null);

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  });

  router.put("/editoriales/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    const { nombre, direccion, telefono, email } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });
    if (!nombre || String(nombre).trim().length < 2) {
      return res.status(400).json({ ok: false, message: "Nombre requerido." });
    }

    const info = db
      .prepare(
        `
        UPDATE EDITORIAL
        SET NOMBRE=?, DIRECCION=?, TELEFONO=?, EMAIL=?
        WHERE ID=?;
      `
      )
      .run(String(nombre).trim(), direccion ?? null, telefono ?? null, email ?? null, id);

    res.json({ ok: true, changes: info.changes });
  });

  router.delete("/editoriales/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const info = db.prepare(`DELETE FROM EDITORIAL WHERE ID=?;`).run(id);
    res.json({ ok: true, changes: info.changes });
  });

  // =========================
  // USUARIOS
  // =========================
  router.get("/usuarios", (req, res) => {
    const q = String(req.query.q || "").trim();
    const rows = db
      .prepare(
        `
        SELECT ID, NOMBRE, EMAIL, TELEFONO, DIRECCION, TIPO, ACTIVO, FECHA_REGISTRO, UPDATED_AT
        FROM USUARIO
        WHERE (?='' OR NOMBRE LIKE '%'||?||'%' OR EMAIL LIKE '%'||?||'%')
        ORDER BY ID DESC;
      `
      )
      .all(q, q, q);

    res.json({ ok: true, data: rows });
  });

  router.post("/usuarios", (req, res) => {
    const { nombre, email, telefono, direccion, tipo, activo } = req.body || {};
    if (!nombre || String(nombre).trim().length < 2) {
      return res.status(400).json({ ok: false, message: "Nombre requerido." });
    }

    const info = db
      .prepare(
        `
        INSERT INTO USUARIO (NOMBRE, EMAIL, TELEFONO, DIRECCION, TIPO, ACTIVO)
        VALUES (?,?,?,?,?,?);
      `
      )
      .run(
        String(nombre).trim(),
        email ?? null,
        telefono ?? null,
        direccion ?? null,
        tipo ?? "alumno",
        typeof activo === "number" ? activo : 1
      );

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  });

  router.put("/usuarios/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    const { nombre, email, telefono, direccion, tipo, activo } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });
    if (!nombre || String(nombre).trim().length < 2) {
      return res.status(400).json({ ok: false, message: "Nombre requerido." });
    }

    const info = db
      .prepare(
        `
        UPDATE USUARIO
        SET NOMBRE=?, EMAIL=?, TELEFONO=?, DIRECCION=?, TIPO=?, ACTIVO=?
        WHERE ID=?;
      `
      )
      .run(
        String(nombre).trim(),
        email ?? null,
        telefono ?? null,
        direccion ?? null,
        tipo ?? "alumno",
        typeof activo === "number" ? activo : 1,
        id
      );

    res.json({ ok: true, changes: info.changes });
  });

  // Soft-delete (desactivar)
  router.delete("/usuarios/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const info = db.prepare(`UPDATE USUARIO SET ACTIVO=0 WHERE ID=?;`).run(id);
    res.json({ ok: true, changes: info.changes });
  });

  // =========================
  // LIBROS (Catálogo)
  // =========================
  router.get("/libros", (req, res) => {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(toInt(req.query.limit, 50), 200);
    const offset = Math.max(toInt(req.query.offset, 0), 0);

    const rows = db
      .prepare(
        `
        SELECT
          L.ID, L.TITULO, L.ISBN, L.GENERO, L.IDIOMA, L.PAGINAS, L.FECHA_PUBLICACION,
          (SELECT GROUP_CONCAT(A.NOMBRE, ', ')
            FROM LIBRO_AUTOR LA
            JOIN AUTOR A ON A.ID = LA.AUTOR_ID
            WHERE LA.LIBRO_ID = L.ID
            ORDER BY COALESCE(LA.ORDEN_AUTORIA, 9999), A.NOMBRE
          ) AS AUTORES,
          (SELECT COUNT(*)
            FROM EDICION E
            JOIN EJEMPLAR J ON J.EDICION_ID = E.ID
            WHERE E.LIBRO_ID = L.ID
          ) AS TOTAL_EJEMPLARES,
          (SELECT COUNT(*)
            FROM EDICION E
            JOIN EJEMPLAR J ON J.EDICION_ID = E.ID
            WHERE E.LIBRO_ID = L.ID AND J.ESTADO = 'disponible'
          ) AS DISPONIBLES
        FROM LIBRO L
        WHERE (?='' OR L.TITULO LIKE '%'||?||'%' OR L.ISBN LIKE '%'||?||'%' OR L.GENERO LIKE '%'||?||'%')
        ORDER BY L.ID DESC
        LIMIT ? OFFSET ?;
      `
      )
      .all(q, q, q, q, limit, offset);

    res.json({ ok: true, data: rows });
  });

  router.get("/libros/:id/detail", (req, res) => {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const libro = db
      .prepare(
        `
        SELECT ID, TITULO, ISBN, GENERO, IDIOMA, PAGINAS, FECHA_PUBLICACION, DESCRIPCION, CREATED_AT, UPDATED_AT
        FROM LIBRO
        WHERE ID=?;
      `
      )
      .get(id);

    if (!libro) return res.status(404).json({ ok: false, message: "Libro no encontrado." });

    const autores = db
      .prepare(
        `
        SELECT A.ID, A.NOMBRE, LA.ORDEN_AUTORIA, LA.ROL
        FROM LIBRO_AUTOR LA
        JOIN AUTOR A ON A.ID = LA.AUTOR_ID
        WHERE LA.LIBRO_ID=?
        ORDER BY COALESCE(LA.ORDEN_AUTORIA, 9999), A.NOMBRE;
      `
      )
      .all(id);

    const ediciones = db
      .prepare(
        `
        SELECT
          E.ID, E.LIBRO_ID, E.EDITORIAL_ID, E.NUM_EDICION, E.FECHA_LANZAMIENTO, E.LUGAR_PUBLICACION, E.ISBN_EDICION,
          ED.NOMBRE AS EDITORIAL_NOMBRE,
          (SELECT COUNT(*) FROM EJEMPLAR J WHERE J.EDICION_ID = E.ID) AS TOTAL_EJEMPLARES,
          (SELECT COUNT(*) FROM EJEMPLAR J WHERE J.EDICION_ID = E.ID AND J.ESTADO='disponible') AS DISPONIBLES
        FROM EDICION E
        JOIN EDITORIAL ED ON ED.ID = E.EDITORIAL_ID
        WHERE E.LIBRO_ID=?
        ORDER BY E.ID DESC;
      `
      )
      .all(id);

    res.json({ ok: true, data: { libro, autores, ediciones } });
  });

  router.post("/libros", (req, res) => {
    const { titulo, isbn, genero, idioma, paginas, fecha_publicacion, descripcion } = req.body || {};
    if (!titulo || String(titulo).trim().length < 2) {
      return res.status(400).json({ ok: false, message: "Título requerido." });
    }

    const info = db
      .prepare(
        `
        INSERT INTO LIBRO (TITULO, ISBN, GENERO, IDIOMA, PAGINAS, FECHA_PUBLICACION, DESCRIPCION)
        VALUES (?,?,?,?,?,?,?);
      `
      )
      .run(
        String(titulo).trim(),
        isbn ?? null,
        genero ?? null,
        idioma ?? null,
        paginas ?? null,
        fecha_publicacion ?? null,
        descripcion ?? null
      );

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  });

  router.put("/libros/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    const { titulo, isbn, genero, idioma, paginas, fecha_publicacion, descripcion } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });
    if (!titulo || String(titulo).trim().length < 2) {
      return res.status(400).json({ ok: false, message: "Título requerido." });
    }

    const info = db
      .prepare(
        `
        UPDATE LIBRO
        SET TITULO=?, ISBN=?, GENERO=?, IDIOMA=?, PAGINAS=?, FECHA_PUBLICACION=?, DESCRIPCION=?
        WHERE ID=?;
      `
      )
      .run(
        String(titulo).trim(),
        isbn ?? null,
        genero ?? null,
        idioma ?? null,
        paginas ?? null,
        fecha_publicacion ?? null,
        descripcion ?? null,
        id
      );

    res.json({ ok: true, changes: info.changes });
  });

  router.delete("/libros/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const info = db.prepare(`DELETE FROM LIBRO WHERE ID=?;`).run(id);
    res.json({ ok: true, changes: info.changes });
  });

  // Asignar autores a un libro (reemplaza lista completa)
  router.put("/libros/:id/autores", (req, res) => {
    const libroId = toInt(req.params.id, 0);
    const list = Array.isArray(req.body?.autores) ? req.body.autores : [];
    if (!libroId) return res.status(400).json({ ok: false, message: "ID inválido." });

    const doTx = db.transaction(() => {
      db.prepare(`DELETE FROM LIBRO_AUTOR WHERE LIBRO_ID=?;`).run(libroId);

      const ins = db.prepare(`
        INSERT INTO LIBRO_AUTOR (LIBRO_ID, AUTOR_ID, ORDEN_AUTORIA, ROL)
        VALUES (?,?,?,?);
      `);

      for (const a of list) {
        const autorId = Number(a.autor_id);
        if (!Number.isFinite(autorId) || autorId <= 0) continue;
        ins.run(libroId, autorId, a.orden_autoria ?? null, a.rol ?? null);
      }
    });

    doTx();
    res.json({ ok: true });
  });

  // =========================
  // EDICIONES
  // =========================
  router.get("/ediciones", (req, res) => {
    const libroId = toInt(req.query.libro_id, 0);

    const rows = db
      .prepare(
        `
        SELECT
          E.ID, E.LIBRO_ID, E.EDITORIAL_ID, E.NUM_EDICION, E.FECHA_LANZAMIENTO, E.LUGAR_PUBLICACION, E.ISBN_EDICION,
          L.TITULO AS LIBRO_TITULO,
          ED.NOMBRE AS EDITORIAL_NOMBRE
        FROM EDICION E
        JOIN LIBRO L ON L.ID = E.LIBRO_ID
        JOIN EDITORIAL ED ON ED.ID = E.EDITORIAL_ID
        WHERE (?=0 OR E.LIBRO_ID=?)
        ORDER BY E.ID DESC;
      `
      )
      .all(libroId, libroId);

    res.json({ ok: true, data: rows });
  });

  router.post("/ediciones", (req, res) => {
    const { libro_id, editorial_id, num_edicion, fecha_lanzamiento, lugar_publicacion, isbn_edicion } = req.body || {};
    if (!libro_id || !editorial_id) {
      return res.status(400).json({ ok: false, message: "libro_id y editorial_id son requeridos." });
    }

    const info = db
      .prepare(
        `
        INSERT INTO EDICION (LIBRO_ID, EDITORIAL_ID, NUM_EDICION, FECHA_LANZAMIENTO, LUGAR_PUBLICACION, ISBN_EDICION)
        VALUES (?,?,?,?,?,?);
      `
      )
      .run(
        Number(libro_id),
        Number(editorial_id),
        num_edicion ?? null,
        fecha_lanzamiento ?? null,
        lugar_publicacion ?? null,
        isbn_edicion ?? null
      );

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  });

  router.put("/ediciones/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    const { libro_id, editorial_id, num_edicion, fecha_lanzamiento, lugar_publicacion, isbn_edicion } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const info = db
      .prepare(
        `
        UPDATE EDICION
        SET LIBRO_ID=?, EDITORIAL_ID=?, NUM_EDICION=?, FECHA_LANZAMIENTO=?, LUGAR_PUBLICACION=?, ISBN_EDICION=?
        WHERE ID=?;
      `
      )
      .run(
        Number(libro_id),
        Number(editorial_id),
        num_edicion ?? null,
        fecha_lanzamiento ?? null,
        lugar_publicacion ?? null,
        isbn_edicion ?? null,
        id
      );

    res.json({ ok: true, changes: info.changes });
  });

  router.delete("/ediciones/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const info = db.prepare(`DELETE FROM EDICION WHERE ID=?;`).run(id);
    res.json({ ok: true, changes: info.changes });
  });

  // =========================
  // EJEMPLARES
  // =========================
  router.get("/ejemplares", (req, res) => {
    const q = String(req.query.q || "").trim();
    const estado = String(req.query.estado || "").trim();

    const rows = db
      .prepare(
        `
        SELECT
          J.ID, J.EDICION_ID, J.CODIGO_BARRAS, J.UBICACION, J.ESTADO, J.FECHA_ALTA,
          L.TITULO AS LIBRO_TITULO,
          E.ISBN_EDICION,
          ED.NOMBRE AS EDITORIAL_NOMBRE
        FROM EJEMPLAR J
        JOIN EDICION E ON E.ID = J.EDICION_ID
        JOIN LIBRO L ON L.ID = E.LIBRO_ID
        JOIN EDITORIAL ED ON ED.ID = E.EDITORIAL_ID
        WHERE
          (?='' OR J.CODIGO_BARRAS LIKE '%'||?||'%' OR L.TITULO LIKE '%'||?||'%')
          AND (?='' OR J.ESTADO = ?)
        ORDER BY J.ID DESC;
      `
      )
      .all(q, q, q, estado, estado);

    res.json({ ok: true, data: rows });
  });

  router.get("/ejemplares/lookup", (req, res) => {
    const codigo = String(req.query.codigo || "").trim();
    if (!codigo) return res.status(400).json({ ok: false, message: "codigo requerido" });

    const row = db
      .prepare(
        `
        SELECT
          J.ID, J.CODIGO_BARRAS, J.ESTADO,
          L.TITULO AS LIBRO_TITULO
        FROM EJEMPLAR J
        JOIN EDICION E ON E.ID = J.EDICION_ID
        JOIN LIBRO L ON L.ID = E.LIBRO_ID
        WHERE J.CODIGO_BARRAS=?;
      `
      )
      .get(codigo);

    if (!row) return res.status(404).json({ ok: false, message: "No encontrado" });
    res.json({ ok: true, data: row });
  });

  router.post("/ejemplares", (req, res) => {
    const { edicion_id, codigo_barras, ubicacion, estado } = req.body || {};
    if (!edicion_id || !codigo_barras) {
      return res.status(400).json({ ok: false, message: "edicion_id y codigo_barras son requeridos." });
    }

    const info = db
      .prepare(
        `
        INSERT INTO EJEMPLAR (EDICION_ID, CODIGO_BARRAS, UBICACION, ESTADO)
        VALUES (?,?,?,?);
      `
      )
      .run(Number(edicion_id), String(codigo_barras).trim(), ubicacion ?? null, estado ?? "disponible");

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  });

  router.put("/ejemplares/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    const { ubicacion, estado } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const info = db
      .prepare(`UPDATE EJEMPLAR SET UBICACION=?, ESTADO=? WHERE ID=?;`)
      .run(ubicacion ?? null, estado ?? "disponible", id);

    res.json({ ok: true, changes: info.changes });
  });

  router.delete("/ejemplares/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const info = db.prepare(`DELETE FROM EJEMPLAR WHERE ID=?;`).run(id);
    res.json({ ok: true, changes: info.changes });
  });

  // =========================
  // PRESTAMOS
  // =========================
  router.get("/prestamos", (req, res) => {
    const estado = String(req.query.estado || "").trim();

    const rows = db
      .prepare(
        `
        SELECT
          P.ID, P.USUARIO_ID, U.NOMBRE AS USUARIO_NOMBRE,
          P.FECHA_PRESTAMO, P.ESTADO, P.OBSERVACIONES,
          (SELECT COUNT(*) FROM PRESTAMO_ITEM PI WHERE PI.PRESTAMO_ID=P.ID) AS ITEMS,
          (SELECT COUNT(*)
            FROM PRESTAMO_ITEM PI
            WHERE PI.PRESTAMO_ID=P.ID AND PI.ESTADO='activo' AND datetime(PI.FECHA_VENCIMIENTO) < datetime('now')
          ) AS VENCIDOS
        FROM PRESTAMO P
        JOIN USUARIO U ON U.ID = P.USUARIO_ID
        WHERE (?='' OR P.ESTADO=?)
        ORDER BY P.ID DESC;
      `
      )
      .all(estado, estado);

    res.json({ ok: true, data: rows });
  });

  router.get("/prestamos/:id", (req, res) => {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const prestamo = db
      .prepare(
        `
        SELECT P.ID, P.USUARIO_ID, U.NOMBRE AS USUARIO_NOMBRE, P.FECHA_PRESTAMO, P.ESTADO, P.OBSERVACIONES
        FROM PRESTAMO P
        JOIN USUARIO U ON U.ID = P.USUARIO_ID
        WHERE P.ID=?;
      `
      )
      .get(id);

    if (!prestamo) return res.status(404).json({ ok: false, message: "Préstamo no encontrado." });

    const items = db
      .prepare(
        `
        SELECT
          PI.PRESTAMO_ID, PI.EJEMPLAR_ID,
          PI.FECHA_VENCIMIENTO, PI.FECHA_DEVOLUCION, PI.ESTADO, PI.CONDICION_DEVOLUCION, PI.MULTA_MXN,
          J.CODIGO_BARRAS,
          L.TITULO AS LIBRO_TITULO
        FROM PRESTAMO_ITEM PI
        JOIN EJEMPLAR J ON J.ID = PI.EJEMPLAR_ID
        JOIN EDICION E ON E.ID = J.EDICION_ID
        JOIN LIBRO L ON L.ID = E.LIBRO_ID
        WHERE PI.PRESTAMO_ID=?
        ORDER BY PI.EJEMPLAR_ID DESC;
      `
      )
      .all(id);

    res.json({ ok: true, data: { prestamo, items } });
  });

  router.post("/prestamos", (req, res) => {
    const { usuario_id, observaciones, items } = req.body || {};
    if (!usuario_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, message: "usuario_id e items[] son requeridos." });
    }

    const createTx = db.transaction(() => {
      const user = db.prepare(`SELECT ID, ACTIVO FROM USUARIO WHERE ID=?;`).get(Number(usuario_id));
      if (!user) throw new Error("USUARIO_NO_EXISTE");
      if (user.ACTIVO !== 1) throw new Error("USUARIO_INACTIVO");

      const insPrestamo = db.prepare(
        `INSERT INTO PRESTAMO (USUARIO_ID, OBSERVACIONES) VALUES (?,?);`
      );
      const pInfo = insPrestamo.run(Number(usuario_id), observaciones ?? null);
      const prestamoId = pInfo.lastInsertRowid;

      const insItem = db.prepare(
        `
        INSERT INTO PRESTAMO_ITEM (PRESTAMO_ID, EJEMPLAR_ID, FECHA_VENCIMIENTO, ESTADO, MULTA_MXN)
        VALUES (?,?,?,?,0);
      `
      );
      const updEj = db.prepare(`UPDATE EJEMPLAR SET ESTADO='prestado' WHERE ID=?;`);
      const getEj = db.prepare(`SELECT ID, ESTADO FROM EJEMPLAR WHERE ID=?;`);

      for (const it of items) {
        const ejemplarId = Number(it.ejemplar_id);
        const fechaVenc = String(it.fecha_vencimiento || "").trim();
        if (!ejemplarId || !fechaVenc) throw new Error("ITEM_INVALIDO");

        const ej = getEj.get(ejemplarId);
        if (!ej) throw new Error("EJEMPLAR_NO_EXISTE");
        if (String(ej.ESTADO) !== "disponible") throw new Error("EJEMPLAR_NO_DISPONIBLE");

        insItem.run(prestamoId, ejemplarId, fechaVenc, "activo");
        updEj.run(ejemplarId);
      }

      return prestamoId;
    });

    try {
      const prestamoId = createTx();
      res.status(201).json({ ok: true, id: prestamoId });
    } catch (e) {
      if (e.message === "USUARIO_NO_EXISTE") {
        return res.status(400).json({ ok: false, message: "Usuario no existe." });
      }
      if (e.message === "USUARIO_INACTIVO") {
        return res.status(400).json({ ok: false, message: "Usuario inactivo." });
      }
      if (e.message === "EJEMPLAR_NO_DISPONIBLE") {
        return res.status(409).json({ ok: false, message: "Hay un ejemplar no disponible." });
      }
      if (e.message === "ITEM_INVALIDO") {
        return res.status(400).json({ ok: false, message: "Item inválido." });
      }
      throw e;
    }
  });

  router.post("/prestamos/:id/devolver", (req, res) => {
    const prestamoId = toInt(req.params.id, 0);
    const { ejemplar_id, condicion_devolucion, multa_mxn } = req.body || {};
    if (!prestamoId || !ejemplar_id) {
      return res.status(400).json({ ok: false, message: "prestamo_id y ejemplar_id requeridos." });
    }

    const tx = db.transaction(() => {
      const item = db
        .prepare(
          `SELECT ESTADO FROM PRESTAMO_ITEM WHERE PRESTAMO_ID=? AND EJEMPLAR_ID=?;`
        )
        .get(prestamoId, Number(ejemplar_id));

      if (!item) throw new Error("ITEM_NO_EXISTE");
      if (item.ESTADO !== "activo") throw new Error("ITEM_NO_ACTIVO");

      db.prepare(
        `
        UPDATE PRESTAMO_ITEM
        SET ESTADO='devuelto',
            FECHA_DEVOLUCION=CURRENT_TIMESTAMP,
            CONDICION_DEVOLUCION=?,
            MULTA_MXN=?
        WHERE PRESTAMO_ID=? AND EJEMPLAR_ID=?;
      `
      ).run(condicion_devolucion ?? null, Number(multa_mxn || 0), prestamoId, Number(ejemplar_id));

      db.prepare(`UPDATE EJEMPLAR SET ESTADO='disponible' WHERE ID=?;`).run(Number(ejemplar_id));

      const open = db
        .prepare(
          `SELECT COUNT(*) AS c FROM PRESTAMO_ITEM WHERE PRESTAMO_ID=? AND ESTADO='activo';`
        )
        .get(prestamoId);

      if (open.c === 0) {
        db.prepare(`UPDATE PRESTAMO SET ESTADO='cerrado' WHERE ID=?;`).run(prestamoId);
      }
    });

    try {
      tx();
      res.json({ ok: true });
    } catch (e) {
      if (e.message === "ITEM_NO_EXISTE") return res.status(404).json({ ok: false, message: "Item no existe." });
      if (e.message === "ITEM_NO_ACTIVO") return res.status(409).json({ ok: false, message: "Item no está activo." });
      throw e;
    }
  });

  // =========================
  // RESERVAS
  // =========================
  router.get("/reservas", (req, res) => {
    const estado = String(req.query.estado || "").trim();

    const rows = db
      .prepare(
        `
        SELECT
          R.ID, R.USUARIO_ID, U.NOMBRE AS USUARIO_NOMBRE,
          R.LIBRO_ID, L.TITULO AS LIBRO_TITULO,
          R.FECHA_RESERVA, R.EXPIRA_EN, R.ESTADO
        FROM RESERVA R
        JOIN USUARIO U ON U.ID = R.USUARIO_ID
        JOIN LIBRO L ON L.ID = R.LIBRO_ID
        WHERE (?='' OR R.ESTADO=?)
        ORDER BY R.ID DESC;
      `
      )
      .all(estado, estado);

    res.json({ ok: true, data: rows });
  });

  router.post("/reservas", (req, res) => {
    const { usuario_id, libro_id, expira_en } = req.body || {};
    if (!usuario_id || !libro_id) {
      return res.status(400).json({ ok: false, message: "usuario_id y libro_id son requeridos." });
    }

    const info = db
      .prepare(
        `
        INSERT INTO RESERVA (USUARIO_ID, LIBRO_ID, EXPIRA_EN)
        VALUES (?,?,?);
      `
      )
      .run(Number(usuario_id), Number(libro_id), expira_en ?? null);

    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  });

  router.put("/reservas/:id/cancelar", (req, res) => {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const info = db.prepare(`UPDATE RESERVA SET ESTADO='cancelada' WHERE ID=?;`).run(id);
    res.json({ ok: true, changes: info.changes });
  });

  router.put("/reservas/:id/cumplir", (req, res) => {
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

    const info = db.prepare(`UPDATE RESERVA SET ESTADO='cumplida' WHERE ID=?;`).run(id);
    res.json({ ok: true, changes: info.changes });
  });

  // =========================
  // SELECTS para UI
  // =========================
  router.get("/select/autores", (req, res) => {
    const rows = db.prepare(`SELECT ID, NOMBRE FROM AUTOR ORDER BY NOMBRE;`).all();
    res.json({ ok: true, data: rows });
  });

  router.get("/select/editoriales", (req, res) => {
    const rows = db.prepare(`SELECT ID, NOMBRE FROM EDITORIAL ORDER BY NOMBRE;`).all();
    res.json({ ok: true, data: rows });
  });

  router.get("/select/libros", (req, res) => {
    const rows = db.prepare(`SELECT ID, TITULO FROM LIBRO ORDER BY TITULO;`).all();
    res.json({ ok: true, data: rows });
  });

  router.get("/select/usuarios", (req, res) => {
    const rows = db.prepare(`SELECT ID, NOMBRE FROM USUARIO WHERE ACTIVO=1 ORDER BY NOMBRE;`).all();
    res.json({ ok: true, data: rows });
  });

  router.get("/select/ediciones", (req, res) => {
    const libroId = toInt(req.query.libro_id, 0);
    const rows = db
      .prepare(
        `
        SELECT E.ID,
               (L.TITULO || ' — ' || ED.NOMBRE || COALESCE(' — Ed.' || E.NUM_EDICION,'') ) AS LABEL
        FROM EDICION E
        JOIN LIBRO L ON L.ID = E.LIBRO_ID
        JOIN EDITORIAL ED ON ED.ID = E.EDITORIAL_ID
        WHERE (?=0 OR E.LIBRO_ID=?)
        ORDER BY E.ID DESC;
      `
      )
      .all(libroId, libroId);

    res.json({ ok: true, data: rows });
  });

  return router;
}

module.exports = { apiRouter };
```

---

# 3) FRONTEND (HTML + CSS + JS vanilla)

## Archivo: `public/index.html` (carpeta `public/`)

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Biblioteca — Sistema</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <div class="brand-title">Sistema de Biblioteca</div>
      <div class="brand-subtitle">Catálogo · Préstamos · Reservas · Usuarios</div>
    </div>
    <nav class="top-actions">
      <button class="chip" data-view="libros">Libros</button>
      <button class="chip" data-view="autores">Autores</button>
      <button class="chip" data-view="editoriales">Editoriales</button>
      <button class="chip" data-view="ediciones">Ediciones</button>
      <button class="chip" data-view="ejemplares">Ejemplares</button>
      <button class="chip" data-view="usuarios">Usuarios</button>
      <button class="chip" data-view="prestamos">Préstamos</button>
      <button class="chip" data-view="reservas">Reservas</button>
    </nav>
  </header>

  <main class="layout">
    <section class="card">
      <div class="card-head">
        <div>
          <h1 id="viewTitle" class="h1">Libros</h1>
          <div id="viewHint" class="muted">Administra el catálogo y la circulación.</div>
        </div>
        <div class="filters">
          <input id="search" class="input" placeholder="Buscar..." />
          <button id="refresh" class="btn">Actualizar</button>
          <button id="newBtn" class="btn primary">Nuevo</button>
        </div>
      </div>

      <div id="content" class="panel"></div>
    </section>
  </main>

  <div id="modal" class="modal" aria-hidden="true">
    <div class="modal-card">
      <div class="modal-head">
        <div>
          <div id="modalTitle" class="h2">Modal</div>
          <div id="modalSubtitle" class="muted">—</div>
        </div>
        <button id="modalClose" class="btn">Cerrar</button>
      </div>
      <div id="modalBody" class="modal-body"></div>
      <div id="modalFooter" class="modal-footer"></div>
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <script src="./app.js"></script>
</body>
</html>
```

## Archivo: `public/styles.css` (carpeta `public/`)

```css
:root{
  --bg:#fff;
  --text:#111;
  --muted:#6b7280;
  --border:#e5e7eb;
  --shadow:0 10px 25px rgba(0,0,0,.06);

  --primary:#1877F2;
  --primary-hover:#166fe5;
  --primary-soft:rgba(24,119,242,.12);

  --danger:#e11d48;
  --danger-soft:rgba(225,29,72,.10);

  --r:16px;
  --r2:12px;
  --font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
}

*{ box-sizing:border-box; }
html,body{ height:100%; }
body{
  margin:0;
  font-family:var(--font);
  color:var(--text);
  background:var(--bg);
}

.topbar{
  position: sticky;
  top: 0;
  z-index: 10;
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:16px;
  padding:14px 18px;
  background:#fff;
  border-bottom:1px solid var(--border);
}

.brand{ display:flex; flex-direction:column; gap:2px; }
.brand-title{ font-weight:800; font-size:14px; }
.brand-subtitle{ font-size:12px; color:var(--muted); }

.top-actions{ display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
.chip{
  border:1px solid var(--border);
  background:#fff;
  padding:8px 10px;
  border-radius:999px;
  font-size:12px;
  cursor:pointer;
}
.chip.active{
  border-color: rgba(24,119,242,.35);
  background: var(--primary-soft);
}

.layout{
  max-width:1180px;
  margin:22px auto;
  padding:0 18px 26px;
}

.card{
  border:1px solid var(--border);
  border-radius:var(--r);
  background:#fff;
  box-shadow:var(--shadow);
  padding:16px;
}

.card-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  gap:12px;
  margin-bottom:12px;
}

.h1{ margin:0; font-size:18px; }
.h2{ margin:0; font-size:14px; font-weight:800; }
.muted{ color:var(--muted); }

.filters{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  justify-content:flex-end;
  align-items:center;
}

.panel{
  border:1px solid var(--border);
  border-radius:var(--r);
  padding:14px;
  overflow:auto;
}

.input{
  width:260px;
  max-width: 60vw;
  padding:10px 12px;
  border-radius:var(--r2);
  border:1px solid var(--border);
  background:#fff;
  outline:none;
}
.input:focus{
  border-color: rgba(24,119,242,.55);
  box-shadow: 0 0 0 3px rgba(24,119,242,.18);
}

.btn{
  padding:10px 12px;
  border-radius:var(--r2);
  border:1px solid var(--border);
  background:#fff;
  cursor:pointer;
}
.btn.primary{
  background:var(--primary);
  border-color:var(--primary);
  color:#fff;
  font-weight:800;
}
.btn.primary:hover{ background:var(--primary-hover); border-color:var(--primary-hover); }
.btn.danger{
  background:var(--danger-soft);
  border-color: rgba(225,29,72,.35);
  color:#9f1239;
  font-weight:800;
}

.table{
  width:100%;
  border-collapse:collapse;
}
.table th, .table td{
  text-align:left;
  padding:10px 10px;
  border-bottom:1px solid var(--border);
  font-size:13px;
}
.table th{ font-size:12px; color:var(--muted); font-weight:800; }
.actions{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }

.badge{
  display:inline-flex;
  gap:6px;
  align-items:center;
  padding:4px 8px;
  border-radius:999px;
  border:1px solid var(--border);
  font-size:12px;
  color:var(--text);
}
.badge.ok{ border-color: rgba(22,163,74,.25); background: rgba(22,163,74,.08); }
.badge.warn{ border-color: rgba(245,158,11,.25); background: rgba(245,158,11,.10); }
.badge.bad{ border-color: rgba(225,29,72,.25); background: rgba(225,29,72,.08); }

.modal{
  position:fixed;
  inset:0;
  background: rgba(0,0,0,.30);
  display:none;
  align-items:center;
  justify-content:center;
  padding:18px;
}
.modal.show{ display:flex; }
.modal-card{
  width:min(920px, 100%);
  background:#fff;
  border:1px solid var(--border);
  border-radius:18px;
  box-shadow: 0 18px 60px rgba(0,0,0,.18);
  overflow:hidden;
}
.modal-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:10px;
  padding:14px 14px;
  border-bottom:1px solid var(--border);
}
.modal-body{ padding:14px; }
.modal-footer{
  padding:14px;
  border-top:1px solid var(--border);
  display:flex;
  justify-content:flex-end;
  gap:10px;
}

.form{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:12px;
}
.field{ display:flex; flex-direction:column; gap:6px; }
.label{ font-size:12px; color:var(--muted); font-weight:800; }
.full{ grid-column: 1 / -1; }

.toast{
  position:fixed;
  right:18px;
  bottom:18px;
  padding:12px 14px;
  border-radius:14px;
  border:1px solid var(--border);
  background:#111;
  color:#fff;
  box-shadow:var(--shadow);
  opacity:0;
  transform:translateY(10px);
  transition:opacity .18s ease, transform .18s ease;
  pointer-events:none;
}
.toast.show{ opacity:1; transform:translateY(0); }

@media (max-width: 900px){
  .form{ grid-template-columns: 1fr; }
  .input{ width: 100%; }
}
```

## Archivo: `public/app.js` (carpeta `public/`)

```js
const $ = (s) => document.querySelector(s);

const state = {
  view: "libros",
  q: ""
};

const api = {
  async get(path) {
    const r = await fetch(path);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || j.message || "Error");
    return j;
  },
  async send(path, method, body) {
    const r = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || j.message || "Error");
    return j;
  }
};

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1600);
}

function setActiveNav() {
  document.querySelectorAll(".chip").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.view);
  });
}

function openModal(title, subtitle, bodyEl, footerEl) {
  $("#modalTitle").textContent = title;
  $("#modalSubtitle").textContent = subtitle || "";
  const body = $("#modalBody");
  const foot = $("#modalFooter");
  body.innerHTML = "";
  foot.innerHTML = "";
  body.appendChild(bodyEl);
  footerEl?.forEach((x) => foot.appendChild(x));
  $("#modal").classList.add("show");
}

function closeModal() {
  $("#modal").classList.remove("show");
}

$("#modalClose").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (e) => {
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

$("#search").addEventListener("input", (e) => {
  state.q = e.target.value.trim();
});

$("#refresh").addEventListener("click", () => render());
$("#newBtn").addEventListener("click", () => onNew());

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  });
  children.forEach((c) => el.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return el;
}

function table(headers, rows) {
  const thead = h("thead", {}, [
    h("tr", {}, headers.map((x) => h("th", {}, [x])))
  ]);

  const tbody = h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c) => h("td", {}, [c])))));
  return h("table", { class: "table" }, [thead, tbody]);
}

// =========================
// VIEWS
// =========================
async function render() {
  setActiveNav();

  const titleMap = {
    libros: ["Libros", "Catálogo general"],
    autores: ["Autores", "Gestión de autores"],
    editoriales: ["Editoriales", "Gestión de editoriales"],
    ediciones: ["Ediciones", "Ediciones por libro/editorial"],
    ejemplares: ["Ejemplares", "Copias físicas (código de barras)"],
    usuarios: ["Usuarios", "Lectores y personal"],
    prestamos: ["Préstamos", "Alta y devolución"],
    reservas: ["Reservas", "Reservar un libro"]
  };

  $("#viewTitle").textContent = titleMap[state.view][0];
  $("#viewHint").textContent = titleMap[state.view][1];

  const content = $("#content");
  content.innerHTML = "Cargando...";

  try {
    if (state.view === "libros") return renderLibros();
    if (state.view === "autores") return renderAutores();
    if (state.view === "editoriales") return renderEditoriales();
    if (state.view === "usuarios") return renderUsuarios();
    if (state.view === "ediciones") return renderEdiciones();
    if (state.view === "ejemplares") return renderEjemplares();
    if (state.view === "prestamos") return renderPrestamos();
    if (state.view === "reservas") return renderReservas();
  } catch (e) {
    content.innerHTML = "";
    content.appendChild(h("div", {}, [`Error: ${e.message}`]));
  }
}

async function renderLibros() {
  const { data } = await api.get(`/api/libros?q=${encodeURIComponent(state.q)}`);
  const rows = data.map((x) => {
    const disp = Number(x.DISPONIBLES || 0);
    const tot = Number(x.TOTAL_EJEMPLARES || 0);
    const badge =
      tot === 0 ? h("span", { class: "badge warn" }, ["Sin ejemplares"]) :
      disp > 0 ? h("span", { class: "badge ok" }, [`${disp}/${tot} disponibles`]) :
      h("span", { class: "badge bad" }, [`0/${tot} disponibles`]);

    const btns = h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => libroDetalle(x.ID) }, ["Detalle"]),
      h("button", { class: "btn danger", onClick: () => delLibro(x.ID) }, ["Eliminar"])
    ]);

    return [
      String(x.ID),
      x.TITULO || "",
      x.AUTORES || "—",
      x.ISBN || "—",
      badge,
      btns
    ];
  });

  const t = table(["ID", "Título", "Autores", "ISBN", "Disponibilidad", "Acciones"], rows);
  $("#content").innerHTML = "";
  $("#content").appendChild(t);
}

async function libroDetalle(id) {
  const r = await api.get(`/api/libros/${id}/detail`);
  const { libro, autores, ediciones } = r.data;

  const body = h("div", {}, [
    h("div", { class: "muted" }, [`Libro #${libro.ID}`]),
    h("div", { style: "margin:10px 0;font-weight:800;" }, [libro.TITULO]),
    h("div", { class: "muted" }, [`ISBN: ${libro.ISBN || "—"} · Género: ${libro.GENERO || "—"} · Idioma: ${libro.IDIOMA || "—"}`]),
    h("hr", { style: "border:0;border-top:1px solid var(--border);margin:12px 0;" }),

    h("div", { style: "font-weight:800;margin-bottom:6px;" }, ["Autores asignados"]),
    h("div", { class: "muted", style: "margin-bottom:10px;" }, [
      autores.length ? autores.map(a => a.NOMBRE).join(", ") : "—"
    ]),
    h("div", { style: "font-weight:800;margin:12px 0 6px;" }, ["Ediciones"]),
    h("div", { class: "muted", style: "margin-bottom:8px;" }, ["(Puedes crear ediciones desde la pestaña Ediciones.)"]),
    h("div", {}, [
      ediciones.length
        ? table(
            ["ID", "Editorial", "Ed.", "ISBN edición", "Ejemplares"],
            ediciones.map(e => [
              String(e.ID),
              e.EDITORIAL_NOMBRE,
              e.NUM_EDICION ?? "—",
              e.ISBN_EDICION ?? "—",
              `${e.DISPONIBLES}/${e.TOTAL_EJEMPLARES}`
            ])
          )
        : h("div", { class: "muted" }, ["—"])
    ])
  ]);

  const footer = [
    h("button", { class: "btn", onClick: async () => openLibroEdit(libro) }, ["Editar"]),
    h("button", { class: "btn primary", onClick: async () => openAutoresAsignacion(libro.ID) }, ["Asignar autores"])
  ];

  openModal("Detalle de libro", "Catálogo", body, footer);
}

async function openLibroEdit(libro) {
  const form = h("div", { class: "form" }, [
    field("Título", "titulo", libro.TITULO),
    field("ISBN", "isbn", libro.ISBN || ""),
    field("Género", "genero", libro.GENERO || ""),
    field("Idioma", "idioma", libro.IDIOMA || ""),
    field("Páginas", "paginas", libro.PAGINAS ?? ""),
    field("Fecha publicación", "fecha_publicacion", libro.FECHA_PUBLICACION || ""),
    field("Descripción", "descripcion", libro.DESCRIPCION || "", true)
  ]);

  const save = async () => {
    const payload = readForm(form);
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
  const opts = await api.get("/api/select/autores");
  const autores = opts.data || [];

  const wrap = h("div", {}, [
    h("div", { class: "muted", style: "margin-bottom:8px;" }, ["Selecciona autores para este libro (se reemplaza la lista completa)."]),
  ]);

  const list = h("div", { style: "display:grid;gap:8px;" }, autores.map((a) => {
    const row = h("div", { style: "display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:12px;padding:10px;" }, [
      h("div", {}, [a.NOMBRE]),
      h("div", { style: "display:flex;gap:8px;align-items:center;" }, [
        h("input", { type: "checkbox", "data-autor": a.ID }),
        h("input", { class: "input", style: "width:110px;", placeholder: "Orden", "data-orden": a.ID }),
        h("input", { class: "input", style: "width:160px;", placeholder: "Rol", "data-rol": a.ID })
      ])
    ]);
    return row;
  }));

  wrap.appendChild(list);

  const save = async () => {
    const selected = [];
    list.querySelectorAll("input[type='checkbox']").forEach((chk) => {
      if (!chk.checked) return;
      const autorId = Number(chk.getAttribute("data-autor"));
      const orden = list.querySelector(`input[data-orden='${autorId}']`)?.value || null;
      const rol = list.querySelector(`input[data-rol='${autorId}']`)?.value || null;
      selected.push({
        autor_id: autorId,
        orden_autoria: orden ? Number(orden) : null,
        rol: rol || null
      });
    });

    await api.send(`/api/libros/${libroId}/autores`, "PUT", { autores: selected });
    toast("Autores asignados");
    closeModal();
  };

  openModal("Asignar autores", `Libro ID ${libroId}`, wrap, [
    h("button", { class: "btn", onClick: closeModal }, ["Cancelar"]),
    h("button", { class: "btn primary", onClick: save }, ["Guardar"])
  ]);
}

async function delLibro(id) {
  if (!confirm("¿Eliminar libro? (Se borrará y puede fallar si tiene relaciones)")) return;
  await api.send(`/api/libros/${id}`, "DELETE");
  toast("Libro eliminado");
  render();
}

async function renderAutores() {
  const { data } = await api.get(`/api/autores?q=${encodeURIComponent(state.q)}`);
  const rows = data.map((x) => ([
    String(x.ID),
    x.NOMBRE || "",
    x.NACIONALIDAD || "—",
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => editAutor(x) }, ["Editar"]),
      h("button", { class: "btn danger", onClick: () => delAutor(x.ID) }, ["Eliminar"])
    ])
  ]));

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID","Nombre","Nacionalidad","Acciones"], rows));
}

async function renderEditoriales() {
  const { data } = await api.get(`/api/editoriales?q=${encodeURIComponent(state.q)}`);
  const rows = data.map((x) => ([
    String(x.ID),
    x.NOMBRE || "",
    x.EMAIL || "—",
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => editEditorial(x) }, ["Editar"]),
      h("button", { class: "btn danger", onClick: () => delEditorial(x.ID) }, ["Eliminar"])
    ])
  ]));

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID","Nombre","Email","Acciones"], rows));
}

async function renderUsuarios() {
  const { data } = await api.get(`/api/usuarios?q=${encodeURIComponent(state.q)}`);
  const rows = data.map((x) => ([
    String(x.ID),
    x.NOMBRE || "",
    x.TIPO || "",
    x.EMAIL || "—",
    x.ACTIVO === 1 ? h("span", { class: "badge ok" }, ["Activo"]) : h("span", { class: "badge bad" }, ["Inactivo"]),
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => editUsuario(x) }, ["Editar"]),
      h("button", { class: "btn danger", onClick: () => desactUsuario(x.ID) }, ["Desactivar"])
    ])
  ]));

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID","Nombre","Tipo","Email","Estado","Acciones"], rows));
}

async function renderEdiciones() {
  const { data } = await api.get(`/api/ediciones?libro_id=0`);
  const rows = data.map((x) => ([
    String(x.ID),
    x.LIBRO_TITULO,
    x.EDITORIAL_NOMBRE,
    x.NUM_EDICION ?? "—",
    x.ISBN_EDICION ?? "—",
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => editEdicion(x) }, ["Editar"]),
      h("button", { class: "btn danger", onClick: () => delEdicion(x.ID) }, ["Eliminar"])
    ])
  ]));

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID","Libro","Editorial","Ed.","ISBN edición","Acciones"], rows));
}

async function renderEjemplares() {
  const est = "";
  const { data } = await api.get(`/api/ejemplares?q=${encodeURIComponent(state.q)}&estado=${encodeURIComponent(est)}`);
  const rows = data.map((x) => ([
    String(x.ID),
    x.CODIGO_BARRAS,
    x.LIBRO_TITULO,
    x.ESTADO,
    x.UBICACION || "—",
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => editEjemplar(x) }, ["Editar"]),
      h("button", { class: "btn danger", onClick: () => delEjemplar(x.ID) }, ["Eliminar"])
    ])
  ]));

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID","Código","Libro","Estado","Ubicación","Acciones"], rows));
}

async function renderPrestamos() {
  const { data } = await api.get(`/api/prestamos?estado=`);
  const rows = data.map((p) => ([
    String(p.ID),
    p.USUARIO_NOMBRE,
    p.ESTADO,
    String(p.ITEMS || 0),
    Number(p.VENCIDOS || 0) > 0 ? h("span", { class: "badge bad" }, [`${p.VENCIDOS} vencido(s)`]) : h("span", { class: "badge ok" }, ["OK"]),
    h("div", { class: "actions" }, [
      h("button", { class: "btn", onClick: () => detallePrestamo(p.ID) }, ["Detalle"])
    ])
  ]));

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID","Usuario","Estado","Items","Vencimientos","Acciones"], rows));
}

async function detallePrestamo(id) {
  const r = await api.get(`/api/prestamos/${id}`);
  const { prestamo, items } = r.data;

  const body = h("div", {}, [
    h("div", { class: "muted" }, [`Préstamo #${prestamo.ID} — ${prestamo.USUARIO_NOMBRE}`]),
    h("div", { style: "margin:10px 0;font-weight:800;" }, [`Estado: ${prestamo.ESTADO}`]),
    items.length
      ? table(
          ["Ejemplar","Libro","Vence","Estado","Multa","Acción"],
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
  const condicion = prompt("Condición devolución (opcional):", "");
  await api.send(`/api/prestamos/${prestamoId}/devolver`, "POST", {
    ejemplar_id: ejemplarId,
    multa_mxn: Number(multa || 0),
    condicion_devolucion: condicion || null
  });
  toast("Devuelto");
  closeModal();
  render();
}

async function renderReservas() {
  const { data } = await api.get(`/api/reservas?estado=`);
  const rows = data.map((x) => ([
    String(x.ID),
    x.USUARIO_NOMBRE,
    x.LIBRO_TITULO,
    x.ESTADO,
    h("div", { class: "actions" }, [
      x.ESTADO === "activa"
        ? h("button", { class: "btn", onClick: () => cancelarReserva(x.ID) }, ["Cancelar"])
        : h("span", { class: "muted" }, ["—"]),
      x.ESTADO === "activa"
        ? h("button", { class: "btn primary", onClick: () => cumplirReserva(x.ID) }, ["Cumplir"])
        : h("span", { class: "muted" }, ["—"])
    ])
  ]));

  $("#content").innerHTML = "";
  $("#content").appendChild(table(["ID","Usuario","Libro","Estado","Acciones"], rows));
}

// =========================
// MODALS CRUD
// =========================
function field(label, name, value = "", full = false) {
  const input = h("input", { class: "input", name, value: String(value ?? "") });
  return h("div", { class: `field ${full ? "full" : ""}` }, [
    h("div", { class: "label" }, [label]),
    input
  ]);
}

function readForm(root) {
  const obj = {};
  root.querySelectorAll("input[name]").forEach((i) => {
    obj[i.name] = i.value.trim();
  });
  if ("paginas" in obj) obj.paginas = obj.paginas ? Number(obj.paginas) : null;
  return obj;
}

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

async function newLibro() {
  const form = h("div", { class: "form" }, [
    field("Título", "titulo", ""),
    field("ISBN", "isbn", ""),
    field("Género", "genero", ""),
    field("Idioma", "idioma", ""),
    field("Páginas", "paginas", ""),
    field("Fecha publicación", "fecha_publicacion", ""),
    field("Descripción", "descripcion", "", true)
  ]);

  const save = async () => {
    const payload = readForm(form);
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

async function newAutor() {
  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", ""),
    field("Nacionalidad", "nacionalidad", ""),
    field("Bibliografía", "bibliografia", "", true)
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
  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", x.NOMBRE),
    field("Nacionalidad", "nacionalidad", x.NACIONALIDAD || ""),
    field("Bibliografía", "bibliografia", x.BIBLIOGRAFIA || "", true)
  ]);

  const save = async () => {
    const payload = readForm(form);
    await api.send(`/api/autores/${x.ID}`, "PUT", payload);
    toast("Autor actualizado");
    closeModal();
    render();
  };

  openModal("Editar autor", `ID ${x.ID}`, form, [
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

async function newEditorial() {
  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", ""),
    field("Email", "email", ""),
    field("Teléfono", "telefono", ""),
    field("Dirección", "direccion", "", true)
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
  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", x.NOMBRE),
    field("Email", "email", x.EMAIL || ""),
    field("Teléfono", "telefono", x.TELEFONO || ""),
    field("Dirección", "direccion", x.DIRECCION || "", true)
  ]);

  const save = async () => {
    const payload = readForm(form);
    await api.send(`/api/editoriales/${x.ID}`, "PUT", payload);
    toast("Editorial actualizada");
    closeModal();
    render();
  };

  openModal("Editar editorial", `ID ${x.ID}`, form, [
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

async function newUsuario() {
  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", ""),
    field("Email", "email", ""),
    field("Teléfono", "telefono", ""),
    field("Dirección", "direccion", "", true),
    field("Tipo (alumno/docente/externo/bibliotecario/admin)", "tipo", "alumno"),
    field("Activo (1/0)", "activo", "1")
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.activo = payload.activo ? Number(payload.activo) : 1;
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
  const form = h("div", { class: "form" }, [
    field("Nombre", "nombre", x.NOMBRE),
    field("Email", "email", x.EMAIL || ""),
    field("Teléfono", "telefono", x.TELEFONO || ""),
    field("Dirección", "direccion", x.DIRECCION || "", true),
    field("Tipo", "tipo", x.TIPO),
    field("Activo (1/0)", "activo", String(x.ACTIVO))
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.activo = payload.activo ? Number(payload.activo) : 1;
    await api.send(`/api/usuarios/${x.ID}`, "PUT", payload);
    toast("Usuario actualizado");
    closeModal();
    render();
  };

  openModal("Editar usuario", `ID ${x.ID}`, form, [
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

async function newEdicion() {
  const [libros, editoriales] = await Promise.all([
    api.get("/api/select/libros"),
    api.get("/api/select/editoriales")
  ]);

  const form = h("div", { class: "form" }, [
    selectField("Libro", "libro_id", libros.data),
    selectField("Editorial", "editorial_id", editoriales.data),
    field("Num edición", "num_edicion", ""),
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
  const [libros, editoriales] = await Promise.all([
    api.get("/api/select/libros"),
    api.get("/api/select/editoriales")
  ]);

  const form = h("div", { class: "form" }, [
    selectField("Libro", "libro_id", libros.data, x.LIBRO_ID),
    selectField("Editorial", "editorial_id", editoriales.data, x.EDITORIAL_ID),
    field("Num edición", "num_edicion", x.NUM_EDICION ?? ""),
    field("Fecha lanzamiento", "fecha_lanzamiento", x.FECHA_LANZAMIENTO ?? ""),
    field("Lugar publicación", "lugar_publicacion", x.LUGAR_PUBLICACION ?? ""),
    field("ISBN edición", "isbn_edicion", x.ISBN_EDICION ?? "")
  ]);

  const save = async () => {
    const payload = readForm(form);
    payload.libro_id = Number(payload.libro_id);
    payload.editorial_id = Number(payload.editorial_id);
    payload.num_edicion = payload.num_edicion ? Number(payload.num_edicion) : null;
    await api.send(`/api/ediciones/${x.ID}`, "PUT", payload);
    toast("Edición actualizada");
    closeModal();
    render();
  };

  openModal("Editar edición", `ID ${x.ID}`, form, [
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

async function newEjemplar() {
  const ed = await api.get("/api/select/ediciones?libro_id=0");

  const form = h("div", { class: "form" }, [
    selectField("Edición", "edicion_id", ed.data),
    field("Código de barras", "codigo_barras", ""),
    field("Ubicación", "ubicacion", ""),
    field("Estado (disponible/prestado/mantenimiento/baja)", "estado", "disponible")
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
  const form = h("div", { class: "form" }, [
    field("Ubicación", "ubicacion", x.UBICACION || ""),
    field("Estado", "estado", x.ESTADO || "disponible")
  ]);

  const save = async () => {
    const payload = readForm(form);
    await api.send(`/api/ejemplares/${x.ID}`, "PUT", payload);
    toast("Ejemplar actualizado");
    closeModal();
    render();
  };

  openModal("Editar ejemplar", `ID ${x.ID} — ${x.CODIGO_BARRAS}`, form, [
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

function selectField(label, name, options, selected) {
  const sel = h("select", { class: "input", name }, []);
  (options || []).forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.ID;
    opt.textContent = o.LABEL || o.NOMBRE || o.TITULO || `#${o.ID}`;
    if (selected && Number(selected) === Number(o.ID)) opt.selected = true;
    sel.appendChild(opt);
  });
  return h("div", { class: "field" }, [
    h("div", { class: "label" }, [label]),
    sel
  ]);
}

async function newPrestamo() {
  const users = await api.get("/api/select/usuarios");

  const form = h("div", {}, []);
  const top = h("div", { class: "form" }, [
    selectField("Usuario", "usuario_id", users.data),
    field("Observaciones", "observaciones", ""),
    field("Fecha vencimiento (YYYY-MM-DD HH:MM:SS)", "fecha_vencimiento", "", true),
    field("Código de barras (buscar y agregar)", "codigo", "", true)
  ]);

  const items = [];
  const list = h("div", { style: "margin-top:12px;" }, [
    h("div", { style: "font-weight:800;margin-bottom:6px;" }, ["Items del préstamo"]),
    h("div", { class: "muted", style: "margin-bottom:8px;" }, ["Agrega ejemplares disponibles por código de barras."]),
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
          String(it.ejemplar_id),
          it.codigo,
          it.titulo,
          h("button", { class: "btn danger", onClick: () => { items.splice(idx,1); refreshItems(); } }, ["Quitar"])
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
    if (items.some(x => x.ejemplar_id === ej.ID)) {
      alert("Ya está agregado.");
      return;
    }
    items.push({ ejemplar_id: ej.ID, codigo: ej.CODIGO_BARRAS, titulo: ej.LIBRO_TITULO });
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
      fecha_vencimiento = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    }

    if (!items.length) {
      alert("Agrega al menos un ejemplar.");
      return;
    }

    await api.send("/api/prestamos", "POST", {
      usuario_id,
      observaciones,
      items: items.map((x) => ({ ejemplar_id: x.ejemplar_id, fecha_vencimiento }))
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

async function newReserva() {
  const [users, libros] = await Promise.all([
    api.get("/api/select/usuarios"),
    api.get("/api/select/libros")
  ]);

  const form = h("div", { class: "form" }, [
    selectField("Usuario", "usuario_id", users.data),
    selectField("Libro", "libro_id", libros.data.map(x => ({ ID: x.ID, LABEL: x.TITULO }))),
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

render();
```

---

# 4) Ejecutar

```bash
npm install
npm run dev
```

Abre: `http://localhost:3000`

---

## Nota clave (por qué estos cambios eran necesarios)

Tu BD trae FKs a `LIBRO_OLD`, `AUTOR_OLD`, `USUARIO_OLD`, `EDITORIAL_OLD` en **EDICION/LIBRO_AUTOR/RESERVA**. Este proyecto lo corrige automáticamente en `src/migrate.js` para que el sistema funcione completo con `foreign_keys=ON`.

---

Si quieres, en el siguiente paso te integro:

* **Reglas de negocio** (límite de préstamos por tipo de usuario, días por tipo, cálculo automático de multa por días vencidos),
* **pantalla de dashboard** (totales, préstamos activos, vencidos),
* y **búsqueda tipo “catálogo público”** con disponibilidad en tiempo real.

[1]: https://www.brandcolorcode.com/facebook?utm_source=chatgpt.com "Facebook Brand Color Codes » BrandColorCode.com"
