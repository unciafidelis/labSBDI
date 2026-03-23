function notFound(req, res) {
  res.status(404).json({ ok: false, message: "Ruta no encontrada" });
}

function errorHandler(err, req, res, next) {
  const status = err?.status || 500;
  res.status(status).json({
    ok: false,
    message: err?.message || "Error interno",
    detail: err?.detail || null
  });
}

module.exports = { notFound, errorHandler };