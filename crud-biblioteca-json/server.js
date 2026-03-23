const { createApp } = require("./src/app");

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`✅ Biblioteca (JSON) en http://localhost:${PORT}`);
});