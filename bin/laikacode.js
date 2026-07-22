#!/usr/bin/env node
// LaikaCode launcher
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcMain = resolve(__dirname, "..", "src", "main.ts");

// Try tsx first (dev), then node with experimental strip-types (Node 22+)
try {
  execFileSync("npx", ["tsx", srcMain, ...process.argv.slice(2)], {
    stdio: "inherit",
    cwd: resolve(__dirname, ".."),
  });
} catch {
  // If tsx fails, try node directly with strip-types
  try {
    execFileSync("node", ["--experimental-strip-types", srcMain, ...process.argv.slice(2)], {
      stdio: "inherit",
    });
  } catch {
    console.error(
      "LaikaCode requires tsx or Node.js >= 22.13 to run TypeScript.\n" +
      "Install tsx: npm i -g tsx"
    );
    process.exit(1);
  }
}
