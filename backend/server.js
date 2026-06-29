const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const { createApp } = require("./app");
const config = require("./config");

const app = createApp();

app.listen(config.port, () => {
  console.log(`L&C Enterprise running at http://localhost:${config.port}`);
});
