import path from "node:path";
import { ROOT, buildConfig, loadDotEnv, validateConfig } from "./config.js";
import { createApp, createLogger } from "./app.js";

// CLI overrides: --mock, --port=NNNN
if (process.argv.includes("--mock")) process.env.MOCK = "1";
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
if (portArg) process.env.PORT = portArg.slice("--port=".length);
loadDotEnv(path.join(ROOT, ".env"));
const config = buildConfig(process.env);
const log = createLogger(config.logLevel);

const { warnings, errors } = validateConfig(config);
for (const warning of warnings) log.warn(warning);
if (errors.length) {
  for (const error of errors) log.error(error);
  process.exit(1);
}

const app = createApp(config, { logger: log });

try {
  const address = await app.start();
  const shown = address.family === "IPv6" ? `[${address.address}]` : address.address;
  log.info(`Tesla dashboard listening at http://${shown}:${address.port} (${config.mock ? "demo/mock" : "Home Assistant"} mode)`);
} catch (error) {
  log.error(error.code === "EADDRINUSE" ? `Port ${config.port} is already in use; set PORT in .env` : error.message);
  process.exit(1);
}

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log.info(`${signal} received, shutting down`);
  const force = setTimeout(() => process.exit(1), 5000);
  force.unref();
  await app.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
