import path from "node:path";
import { DATA_DIR } from "./config";
import { createLogger } from "./ezlog";

// deadslog to the console and $DATA_DIR/logs/ezchrono.log (ez standard).
export const logger = createLogger(path.join(DATA_DIR, "logs"), "ezchrono");
