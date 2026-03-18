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