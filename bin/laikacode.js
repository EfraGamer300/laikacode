#!/usr/bin/env node
// LaikaCode launcher
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcMain = resolve(__dirname, "..", "src", "main.ts");

// Try node --experimental-strip-types first (Node 22+), then tsx
try {
  execFileSync("node", ["--experimental-strip-types", srcMain, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
} catch {
  try {
    execFileSync("npx", ["tsx", srcMain, ...process.argv.slice(2)], {
      stdio: "inherit",
      cwd: resolve(__dirname, ".."),
    });
  } catch {
    console.error(
      "LaikaCode requires Node.js >= 22.13 or tsx to run TypeScript.\n" +
      "Install tsx: npm i -g tsx"
    );
    process.exit(1);
  }
}
