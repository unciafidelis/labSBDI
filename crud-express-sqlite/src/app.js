const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const tasksRoutes = require("./routes/tasks.routes");
const { notFound, errorHandler } = require("./middlewares/error");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.use(express.static(path.join(process.cwd(), "public")));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "crud-express-sqlite-uaz" });
});

app.use("/api/tasks", tasksRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;