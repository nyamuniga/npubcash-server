import express, { Response } from "express";
import bodyparser from "body-parser";
import cors from "cors";
import compression from "compression";
import { requireHTTPS } from "./middleware/https";
import routes from "./routes";
import path from "path";

const app = express();

app.use(bodyparser.json());
app.use(compression());
app.use(cors());
app.use(requireHTTPS);

import fs from "fs";

app.use(routes);

const staticIndex = path.join(__dirname, "../npubcash-website/dist/index.html");
if (fs.existsSync(staticIndex)) {
  app.use("/", express.static(path.join(__dirname, "../npubcash-website/dist")));
  app.get("*", (_, res: Response) => {
    res.sendFile(staticIndex);
  });
} else {
  app.use("*", (_, res: Response) => {
    res.status(404).json({ status: "ERROR", reason: "Route not found" });
  });
}

export default app;
