import express from "express";

const app = express();

const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok!",
    service: "express",
    version: process.env.APP_VERSION ?? "unknown",
  });
});

app.listen(port, () => {
  console.log(`Express API listening on http://localhost:${port}`);
});
