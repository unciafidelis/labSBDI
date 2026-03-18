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