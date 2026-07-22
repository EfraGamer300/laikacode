import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";

export interface Config {
  apiKey: string;
  model: string;
  smallModel: string;
  baseURL: string;
  maxTokens: number;
  maxIterations: number;
}

const DEFAULTS: Config = {
  apiKey: "",
  model: "anthropic/claude-3.5-sonnet",
  smallModel: "anthropic/claude-3.5-haiku",
  baseURL: "https://openrouter.ai/api/v1",
  maxTokens: 16384,
  maxIterations: 30,
};

export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "laikacode");
}

export function configFile(): string {
  return path.join(configDir(), "config.yaml");
}

export function loadConfig(): Config {
  const cfg = { ...DEFAULTS };
  const file = configFile();
  if (fs.existsSync(file)) {
    try {
      const parsed = YAML.parse(fs.readFileSync(file, "utf8")) || {};
      Object.assign(cfg, parsed);
    } catch {
      // ignore malformed
    }
  }
  if (process.env.OPENROUTER_API_KEY) cfg.apiKey = process.env.OPENROUTER_API_KEY;
  if (process.env.LAIKACODE_MODEL) cfg.model = process.env.LAIKACODE_MODEL;
  if (process.env.LAIKACODE_SMALL_MODEL) cfg.smallModel = process.env.LAIKACODE_SMALL_MODEL;
  if (process.env.LAIKACODE_BASE_URL) cfg.baseURL = process.env.LAIKACODE_BASE_URL;
  return cfg;
}

export function saveConfig(patch: Partial<Config>): void {
  const dir = configDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const current = loadConfig();
  const next = { ...current, ...patch };
  fs.writeFileSync(configFile(), YAML.stringify(next), "utf8");
}

export function ensureConfig(): Config {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    console.error(
      "LaikaCode: OPENROUTER_API_KEY not set.\n" +
        "Set it via env var, or run: laikacode config set apiKey sk-or-...\n" +
        "Or edit " + configFile()
    );
    process.exit(1);
  }
  return cfg;
}
