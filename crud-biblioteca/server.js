require("dotenv").config();
const { createApp } = require("./src/app");

const PORT = Number(process.env.PORT || 3000);
const app = createApp();

app.listen(PORT, () => {
  console.log(`✅ Biblioteca lista en http://localhost:${PORT}`);
});