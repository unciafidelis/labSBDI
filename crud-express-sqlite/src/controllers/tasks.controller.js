const db = require("../db");

function toIntId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

exports.list = (req, res, next) => {
  try {
    const { q, done, limit = "20", offset = "0" } = req.query;

    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const where = [];
    const params = {};

    if (typeof q === "string" && q.trim()) {
      where.push("title LIKE @q");
      params.q = `%${q.trim()}%`;
    }

    if (done === "0" || done === "1") {
      where.push("done = @done");
      params.done = Number(done);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const total = db
      .prepare(`SELECT COUNT(*) AS total FROM tasks ${whereSql}`)
      .get(params).total;

    const rows = db
      .prepare(
        `
        SELECT id, title, done, created_at, updated_at
        FROM tasks
        ${whereSql}
        ORDER BY id DESC
        LIMIT @limit OFFSET @offset
      `
      )
      .all({ ...params, limit: lim, offset: off });

    res.json({ total, limit: lim, offset: off, data: rows });
  } catch (err) {
    next(err);
  }
};

exports.getById = (req, res, next) => {
  try {
    const id = toIntId(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const row = db
      .prepare(
        `
        SELECT id, title, done, created_at, updated_at
        FROM tasks
        WHERE id = ?
      `
      )
      .get(id);

    if (!row) return res.status(404).json({ error: "No encontrado" });

    res.json(row);
  } catch (err) {
    next(err);
  }
};

exports.create = (req, res, next) => {
  try {
    const { title, done } = req.body ?? {};

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title es requerido (string no vacío)" });
    }

    let doneVal = 0;
    if (done === true || done === 1 || done === "1") doneVal = 1;
    if (done === false || done === 0 || done === "0") doneVal = 0;

    const result = db
      .prepare(`INSERT INTO tasks (title, done) VALUES (?, ?)`)
      .run(title.trim(), doneVal);

    const created = db
      .prepare(
        `
        SELECT id, title, done, created_at, updated_at
        FROM tasks
        WHERE id = ?
      `
      )
      .get(result.lastInsertRowid);

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
};

exports.update = (req, res, next) => {
  try {
    const id = toIntId(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const { title, done } = req.body ?? {};
    const fields = [];
    const params = { id };

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title debe ser string no vacío" });
      }
      fields.push("title = @title");
      params.title = title.trim();
    }

    if (done !== undefined) {
      let doneVal;
      if (done === true || done === 1 || done === "1") doneVal = 1;
      else if (done === false || done === 0 || done === "0") doneVal = 0;
      else return res.status(400).json({ error: "done debe ser 0/1 o boolean" });

      fields.push("done = @done");
      params.done = doneVal;
    }

    if (!fields.length) {
      return res.status(400).json({ error: "Nada que actualizar (envía title y/o done)" });
    }

    fields.push("updated_at = datetime('now')");

    const result = db
      .prepare(
        `
        UPDATE tasks
        SET ${fields.join(", ")}
        WHERE id = @id
      `
      )
      .run(params);

    if (result.changes === 0) return res.status(404).json({ error: "No encontrado" });

    const updated = db
      .prepare(
        `
        SELECT id, title, done, created_at, updated_at
        FROM tasks
        WHERE id = ?
      `
      )
      .get(id);

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.remove = (req, res, next) => {
  try {
    const id = toIntId(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    const result = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
    if (result.changes === 0) return res.status(404).json({ error: "No encontrado" });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};