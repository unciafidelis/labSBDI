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