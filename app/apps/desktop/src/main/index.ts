import { join } from "node:path";
import { app } from "electron";
import { startDesktop } from "./lifecycle.js";
import { initializeLogger, logger } from "./logger.js";

app.setName("SAGE");
app.setPath("userData", process.env.SAGE_USER_DATA_DIR ?? join(app.getPath("appData"), "SAGE"));
initializeLogger();

void app.whenReady()
  .then(startDesktop)
  .catch((error) => { logger.error("Desktop startup failed", error); app.exit(1); });
