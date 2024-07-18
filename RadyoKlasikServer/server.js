const app = require("./app");
const PORT = process.env.PORT || 8001;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
