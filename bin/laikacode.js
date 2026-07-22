#!/usr/bin/env node
// LaikaCode launcher
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
const srcMain = resolve(root, "src", "main.ts");

// Try local tsx first (installed with the package), then global
const localTsx = resolve(root, "node_modules", ".bin", "tsx");

if (existsSync(localTsx)) {
  try {
    execFileSync(localTsx, [srcMain, ...process.argv.slice(2)], {
      stdio: "inherit",
      cwd: root,
    });
  } catch (e) {
    process.exit(e.status || 1);
  }
} else {
  // Fallback: try npx tsx
  try {
    execFileSync("npx", ["tsx", srcMain, ...process.argv.slice(2)], {
      stdio: "inherit",
      cwd: root,
    });
  } catch {
    console.error(
      "LaikaCode: could not find tsx.\n" +
      "Run: npm install"
    );
    process.exit(1);
  }
}
