const app = require('./server/app');

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Chauffeur booking API listening on port ${PORT}`);
});
