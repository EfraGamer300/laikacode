#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, saveConfig, ensureConfig, configFile } from "./config";
import { checkForUpdates, performUpdate, getCurrentVersion } from "./updater";

const args = process.argv.slice(2);
const cwd = process.cwd();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPLETIONS_DIR = path.resolve(__dirname, "..", "completions");

function printHelp() {
  console.log(`
\x1b[38;2;124;58;237m        ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
        ┃\x1b[0m  \x1b[1;38;2;167;139;250m🦴  LaikaCode\x1b[0m  \x1b[2mv0.1.0\x1b[0m            \x1b[38;2;124;58;237m┃
\x1b[38;2;124;58;237m        ┃\x1b[0m  \x1b[2mAI-powered coding assistant\x1b[0m       \x1b[38;2;124;58;237m┃
\x1b[38;2;124;58;237m        ┃\x1b[0m  \x1b[2mgithub.com/EfraGamer300\x1b[0m          \x1b[38;2;124;58;237m┃
\x1b[38;2;124;58;237m        ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\x1b[0m

\x1b[1;38;2;124;58;237mUsage:\x1b[0m
  laikacode [options] [prompt]       Start REPL or run a single prompt
  laikacode config [key] [value]     Get or set config values
  laikacode completions [--install]  Show or install shell completions
  laikacode --update                 Check and install updates
  laikacode --version                Show version
  laikacode --help                   Show this help

\x1b[1;38;2;124;58;237mExamples:\x1b[0m
  laikacode                          Start interactive REPL
  laikacode "fix the bug in main.ts"  Run a single prompt
  laikacode config set apiKey sk-or-...  Set API key
  laikacode config get model         Show current model
  laikacode completions --install    Install bash/zsh completions

\x1b[1;38;2;124;58;237mEnvironment:\x1b[0m
  OPENROUTER_API_KEY   OpenRouter API key (required for openrouter/openai/anthropic)
  LAIKACODE_PROVIDER   Override provider (openrouter, openai, anthropic, ollama)
  LAIKACODE_MODEL      Override model
  LAIKACODE_BASE_URL   Override base URL

\x1b[1;38;2;124;58;237mConfig:\x1b[0m
  Config file: ${configFile()}
  Edit directly or use: laikacode config set <key> <value>
`);
}

function printVersion() {
  console.log("laikacode v0.1.0");
  console.log("AI coding assistant");
}

function handleConfig(configArgs: string[]) {
  const sub = configArgs[0];
  if (sub === "set") {
    const key = configArgs[1];
    const value = configArgs.slice(2).join(" ");
    if (!key || !value) {
      console.error("Usage: laikacode config set <key> <value>");
      process.exit(1);
    }
    saveConfig({ [key]: value } as any);
    console.log(`Set ${key} = ${value}`);
    console.log(`Config saved to ${configFile()}`);
  } else if (sub === "get") {
    const cfg = loadConfig();
    const key = configArgs[1];
    if (key) {
      const val = (cfg as any)[key];
      if (val === undefined) {
        console.error(`Unknown key: ${key}`);
        process.exit(1);
      }
      if (key === "apiKey") {
        console.log(`${key}: ${String(val).slice(0, 8)}...${String(val).slice(-4)}`);
      } else {
        console.log(`${key}: ${val}`);
      }
    } else {
      console.log("Config:");
      for (const [k, v] of Object.entries(cfg)) {
        if (k === "apiKey") {
          console.log(`  ${k}: ${String(v).slice(0, 8)}...${String(v).slice(-4)}`);
        } else {
          console.log(`  ${k}: ${v}`);
        }
      }
    }
  } else if (sub === "path") {
    console.log(configFile());
  } else if (sub === "edit") {
    try {
      execSync(`${process.env.EDITOR || "vi"} "${configFile()}"`, { stdio: "inherit" });
    } catch {
      // user cancelled editor
    }
  } else {
    console.log("Usage: laikacode config [set|get|path|edit] [key] [value]");
  }
}

function handleCompletions(completionsArgs: string[]) {
  const install = completionsArgs.includes("--install");
  const shell = completionsArgs.find((a) => a === "--bash" || a === "--zsh");

  if (install) {
    // Auto-detect shell
    const userShell = process.env.SHELL || "";
    const isZsh = userShell.includes("zsh");
    const isBash = userShell.includes("bash");

    if (shell === "--bash" || (!shell && isBash)) {
      const src = path.join(COMPLETIONS_DIR, "laikacode.bash");
      const dest = path.join(process.env.HOME || "~", ".bash_completion.d", "laikacode");
      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, dest);
      console.log(`Installed bash completions to ${dest}`);
      console.log("Run: source ~/.bash_completion.d/laikacode");
    } else if (shell === "--zsh" || (!shell && isZsh)) {
      const src = path.join(COMPLETIONS_DIR, "laikacode.zsh");
      const destDir = path.join(process.env.HOME || "~", ".zsh", "completions");
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, path.join(destDir, "_laikacode"));
      console.log(`Installed zsh completions to ${destDir}/_laikacode`);
      console.log(`Add to ~/.zshrc:  fpath=(${destDir} $fpath)`);
      console.log("Then run: compinit");
    } else {
      // Install both
      const bashDir = path.join(process.env.HOME || "~", ".bash_completion.d");
      const zshDir = path.join(process.env.HOME || "~", ".zsh", "completions");
      if (!fs.existsSync(bashDir)) fs.mkdirSync(bashDir, { recursive: true });
      if (!fs.existsSync(zshDir)) fs.mkdirSync(zshDir, { recursive: true });
      fs.copyFileSync(path.join(COMPLETIONS_DIR, "laikacode.bash"), path.join(bashDir, "laikacode"));
      fs.copyFileSync(path.join(COMPLETIONS_DIR, "laikacode.zsh"), path.join(zshDir, "_laikacode"));
      console.log("Installed completions:");
      console.log(`  Bash: ${bashDir}/laikacode`);
      console.log(`  Zsh:  ${zshDir}/_laikacode`);
      console.log("");
      console.log("For bash: source ~/.bash_completion.d/laikacode");
      console.log("For zsh:  add to ~/.zshrc:  fpath=(${zshDir} $fpath) && compinit");
    }
  } else {
    // Print the completion script to stdout
    const bash = fs.readFileSync(path.join(COMPLETIONS_DIR, "laikacode.bash"), "utf8");
    console.log("# Bash completions for LaikaCode");
    console.log("# Source this:  source <(laikacode completions)");
    console.log("# Or install:   laikacode completions --install\n");
    console.log(bash);
  }
}

async function handleUpdate() {
  const current = getCurrentVersion();
  console.log(`\x1b[1;36m  Checking for updates...\x1b[0m`);

  const info = await checkForUpdates();

  if (!info.hasUpdate) {
    console.log(`\x1b[32m  ✓ Already on the latest version (v${current})\x1b[0m`);
    return;
  }

  console.log(`\x1b[33m  ▸ New version available: \x1b[1mv${info.latest}\x1b[0m\x1b[33m (current: v${info.current})\x1b[0m`);

  if (info.body) {
    const lines = info.body.split("\n").slice(0, 10);
    console.log(`\n\x1b[2m  Release notes:\x1b[0m`);
    for (const line of lines) {
      console.log(`  ${line}`);
    }
    console.log();
  }

  // Auto-update (non-interactive for now)
  const result = await performUpdate((line) => {
    if (line) console.log(`  ${line}`);
  });

  if (result.success) {
    console.log(`\x1b[32m  ✓ ${result.message}\x1b[0m`);
  } else {
    console.error(`\x1b[31m  ✗ ${result.message}\x1b[0m`);
    process.exit(1);
  }
}

async function main() {
  if (args.includes("--version") || args.includes("-v")) {
    printVersion();
    return;
  }
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  if (args[0] === "config") {
    handleConfig(args.slice(1));
    return;
  }
  if (args[0] === "completions") {
    handleCompletions(args.slice(1));
    return;
  }
  if (args.includes("--update")) {
    await handleUpdate();
    return;
  }

  // Background update check
  checkForUpdates().then((info) => {
    if (info.hasUpdate) {
      console.log(
        `\x1b[33m  ▸ New version available: \x1b[1mv${info.latest}\x1b[0m\x1b[33m (current: v${info.current})\x1b[0m`
      );
      console.log(
        `\x1b[2m    Run \x1b[0m\x1b[1mlaikacode --update\x1b[0m\x1b[2m to install\x1b[0m\n`
      );
    }
  }).catch(() => {});

  ensureConfig();

  const { startRepl } = await import("./tui/repl.js");
  const initialPrompt = args.filter((a) => !a.startsWith("--")).join(" ") || undefined;
  await startRepl({ cfg: ensureConfig(), cwd, initialPrompt });
}

main().catch((e: any) => {
  console.error(`LaikaCode fatal: ${e.message || e}`);
  process.exit(1);
});
