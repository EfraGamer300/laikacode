import readline from "node:readline";
import chalk from "chalk";
import type { AgentEvent } from "../agent.ts";
import { runAgent } from "../agent.ts";
import type { Config } from "../config.ts";
import { createOpenRouterProvider } from "../providers/openrouter.ts";
import type { Message } from "../types.ts";
import { ALL_TOOLS, toolByName } from "../tools/index.ts";
import { renderMarkdown, truncJSON, truncate } from "./format.ts";
import { checkForUpdates, performUpdate, getCurrentVersion } from "../updater.ts";

interface SlashCommand {
  name: string;
  describe: string;
  run: (args: string, ctx: ReplContext) => Promise<void> | void;
}

interface ReplContext {
  cfg: Config;
  cwd: string;
  messages: Message[];
  rl: readline.Interface;
  clear: () => void;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const USER = chalk.gray("›");
const OK = chalk.green("✔");
const ERR = chalk.red("✘");
const WARN = chalk.yellow("▸");
const DIM = chalk.gray;
const BOLD = chalk.bold;
const SEP = chalk.gray("─".repeat(52));

// ─── Colors ──────────────────────────────────────────────────────────────────
const c = {
  accent: chalk.hex("#7C3AED"),
  accentLight: chalk.hex("#A78BFA"),
  muted: chalk.hex("#6B7280"),
  surface: chalk.hex("#1F2937"),
  green: chalk.hex("#10B981"),
  yellow: chalk.hex("#F59E0B"),
  red: chalk.hex("#EF4444"),
  cyan: chalk.hex("#06B6D4"),
  white: chalk.hex("#F9FAFB"),
  dim: chalk.hex("#9CA3AF"),
};

// ─── Banner ───────────────────────────────────────────────────────────────────
const BANNER = `
${c.accent("        ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮")}
${c.accent("        ┃")}  ${c.accentLight.bold("🦴  LaikaCode")}  ${c.dim("v0.1.0")}            ${c.accent("┃")}
${c.accent("        ┃")}  ${c.dim("AI-powered coding assistant")}       ${c.accent("┃")}
${c.accent("        ┃")}  ${c.muted("github.com/EfraGamer300")}          ${c.accent("┃")}
${c.accent("        ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯")}
`;

// ─── Spinner frames ──────────────────────────────────────────────────────────
const SPINNERS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ─── Entry ────────────────────────────────────────────────────────────────────
export async function startRepl(opts: {
  cfg: Config;
  cwd: string;
  initialPrompt?: string;
}): Promise<void> {
  const { cfg, cwd } = opts;
  const provider = createOpenRouterProvider({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
  });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `  ${c.accent("❯")} `,
    terminal: process.stdin.isTTY,
    historySize: 100,
  });
  const messages: Message[] = [];
  let controller: AbortController | null = null;

  function clear() {
    process.stdout.write("\x1b[2J\x1b[H");
  }

  const ctx: ReplContext = { cfg, cwd, messages, rl, clear };

  // ─── Slash commands ───────────────────────────────────────────────────────
  const commands: SlashCommand[] = [
    {
      name: "/help",
      describe: "List available commands",
      run: () => {
        console.log();
        console.log(`  ${c.accent.bold("Commands")}`);
        console.log(`  ${SEP}`);
        for (const cmd of commands) {
          console.log(
            `  ${c.accentLight(cmd.name.padEnd(14))} ${c.dim(cmd.describe)}`
          );
        }
        console.log();
      },
    },
    {
      name: "/clear",
      describe: "Clear conversation history",
      run: (_a, c2) => {
        c2.messages.length = 0;
        c2.clear();
        showBanner();
        console.log(`  ${c.dim("Conversation cleared.")}`);
      },
    },
    {
      name: "/model",
      describe: "Show or set model (e.g. /model anthropic/claude-sonnet-4)",
      run: (args, c2) => {
        if (!args.trim()) {
          console.log(`  ${c.dim("current")}  ${BOLD(c2.cfg.model)}`);
          console.log(`  ${c.dim("small")}    ${BOLD(c2.cfg.smallModel)}`);
          console.log(`  ${c.dim("usage")}    /model <provider/model-name>`);
        } else {
          c2.cfg.model = args.trim();
          console.log(`  ${c.green("✔")} model → ${BOLD(c2.cfg.model)}`);
        }
      },
    },
    {
      name: "/cwd",
      describe: "Show working directory",
      run: (_a, c2) => console.log(`  ${c.dim(c2.cwd)}`),
    },
    {
      name: "/tools",
      describe: "List available tools",
      run: () => {
        console.log();
        console.log(`  ${c.accent.bold("Tools")}`);
        console.log(`  ${SEP}`);
        for (const t of ALL_TOOLS) {
          const desc = t.definition.description.split("\n")[0];
          console.log(
            `  ${c.green(t.definition.name.padEnd(12))} ${c.dim(desc)}`
          );
        }
        console.log();
      },
    },
    {
      name: "/tokens",
      describe: "Show token estimates for this conversation",
      run: (_a, c2) => {
        let total = 0;
        for (const m of c2.messages) {
          const text =
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content);
          total += Math.ceil(text.length / 4);
        }
        console.log(`  ${c.dim("messages")}    ${c2.messages.length}`);
        console.log(`  ${c.dim("~tokens")}    ~${total.toLocaleString()}`);
      },
    },
    {
      name: "/completions",
      describe: "Show install instructions for shell completions",
      run: () => {
        console.log();
        console.log(`  ${c.dim("Install completions for your shell:")}`);
        console.log();
        console.log(`  ${c.cyan("Bash:")}  source <(laikacode completions)`);
        console.log(`  ${c.cyan("Bash:")}  laikacode completions --install --bash`);
        console.log();
        console.log(`  ${c.cyan("Zsh:")}   laikacode completions --install --zsh`);
        console.log(`         ${c.dim("add to ~/.zshrc:")}  fpath=(~/.zsh/completions $fpath) && compinit`);
        console.log();
      },
    },
    {
      name: "/update",
      describe: "Check and install updates",
      run: async () => {
        const current = getCurrentVersion();
        console.log();
        console.log(`  ${c.dim("current version")}  ${BOLD(`v${current}`)}`);
        console.log(`  ${c.dim("checking...")}`);

        const info = await checkForUpdates();

        if (!info.hasUpdate) {
          console.log(`  ${c.green("✔")} ${c.dim("Already on the latest version.")}`);
          console.log();
          return;
        }

        console.log(`  ${c.yellow("▸")} ${c.dim("new version available:")} ${BOLD(`v${info.latest}`)}`);

        if (info.body) {
          const lines = info.body.split("\n").slice(0, 8);
          console.log(`  ${c.dim("release notes:")}`);
          for (const line of lines) {
            console.log(`    ${line}`);
          }
        }
        console.log();

        const result = await performUpdate((line) => {
          if (line) console.log(`  ${line}`);
        });

        if (result.success) {
          console.log(`  ${c.green("✔")} ${result.message}`);
        } else {
          console.log(`  ${c.red("✘")} ${result.message}`);
        }
        console.log();
      },
    },
    {
      name: "/exit",
      describe: "Exit LaikaCode",
      run: () => {
        console.log(`  ${c.dim("bye!")}`);
        rl.close();
      },
    },
  ];

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function showBanner() {
    process.stdout.write(BANNER);
    console.log(
      `  ${c.dim("cwd")}  ${BOLD(cwd)}`
    );
    console.log(
      `  ${c.dim("model")} ${BOLD(cfg.model)}`
    );
    console.log();
    console.log(
      `  ${c.dim("Type")} ${c.white("/help")} ${c.dim("for commands")}`
    );
    console.log();
  }

  // ─── Run text through agent ──────────────────────────────────────────────
  async function runText(text: string, ac: AbortController) {
    messages.push({ role: "user", content: text });

    // Show user message
    console.log();
    console.log(`  ${c.accent("›")} ${BOLD(text)}`);

    let spinnerIdx = 0;
    let spinTimer: NodeJS.Timeout | null = null;
    let startedText = false;
    let totalChars = 0;
    let toolCalls = 0;

    function startSpinner() {
      if (spinTimer) return;
      spinTimer = setInterval(() => {
        if (startedText) return;
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(
          `  ${c.accent(SPINNERS[spinnerIdx % SPINNERS.length])} ${c.dim("thinking")}`
        );
        spinnerIdx++;
      }, 80);
    }

    function stopSpinner() {
      if (spinTimer) {
        clearInterval(spinTimer);
        spinTimer = null;
        if (!startedText) {
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
        }
      }
    }

    const emit = (ev: AgentEvent) => {
      if (ev.type === "text") {
        if (!startedText) {
          stopSpinner();
          startedText = true;
          process.stdout.write("\n");
        }
        process.stdout.write(ev.text);
        totalChars += ev.text.length;
      } else if (ev.type === "tool_call_start") {
        stopSpinner();
        if (!startedText && toolCalls === 0) {
          process.stdout.write("\n");
        }
        toolCalls++;
        const inputStr = truncJSON(ev.input);
        process.stdout.write(
          `\n  ${c.yellow("▸")} ${c.white(ev.name)} ${c.dim(inputStr)}\n`
        );
      } else if (ev.type === "tool_call_end") {
        const icon = ev.isError ? ERR : OK;
        const color = ev.isError ? c.red : c.green;
        const preview = truncate(ev.output.split("\n")[0], 100);
        process.stdout.write(
          `  ${color(icon)} ${c.dim(ev.name)} ${c.dim("→")} ${c.dim(preview)}${ev.output.length > 100 ? " …" : ""}\n`
        );
      } else if (ev.type === "error") {
        stopSpinner();
        console.log(`\n  ${ERR} ${c.red(ev.error)}`);
      } else if (ev.type === "done") {
        stopSpinner();
      }
    };

    startSpinner();
    try {
      await runAgent(messages, {
        provider,
        model: cfg.model,
        maxIterations: cfg.maxIterations,
        cwd,
        tools: ALL_TOOLS,
        toolsByName: toolByName,
        onEvent: emit,
        abortSignal: ac.signal,
      });
      stopSpinner();

      // Bottom bar with stats
      if (startedText) {
        const approxTokens = Math.ceil(totalChars / 4);
        const toolsNote =
          toolCalls > 0 ? `  ${c.dim("·")}  ${c.dim(`${toolCalls} tool call${toolCalls > 1 ? "s" : ""}`)}` : "";
        console.log();
        console.log(
          `  ${c.dim("~" + approxTokens.toLocaleString() + " tokens")}${toolsNote}`
        );
      }
      console.log();
    } catch (e: any) {
      stopSpinner();
      console.log(`\n  ${ERR} ${c.red(e.message || e)}\n`);
    } finally {
      controller = null;
    }
  }

  // ─── Handle input ────────────────────────────────────────────────────────
  async function handleUserInput(text: string) {
    text = text.trim();
    if (!text) return;

    if (text[0] === "/") {
      const parts = text.slice(1).split(/\s+/, 1);
      const name = "/" + parts[0];
      const args = text.slice(name.length).trim();
      const cmd = commands.find((c) => c.name === name);
      if (!cmd) {
        console.log(`  ${ERR} Unknown command: ${c.white(name)}. Type ${c.white("/help")}`);
        return;
      }
      await cmd.run(args, ctx);
      rl.prompt();
      return;
    }

    controller = new AbortController();
    await runText(text, controller);
    rl.prompt();
  }

  // ─── Boot ────────────────────────────────────────────────────────────────
  showBanner();
  rl.prompt();

  rl.on("line", async (line) => {
    await handleUserInput(line);
  });

  let waitingForExit = false;
  rl.on("SIGINT", () => {
    if (controller) {
      controller.abort();
      controller = null;
      process.stdout.write(`\n  ${c.dim("Interrupted.")}\n`);
      rl.prompt();
      return;
    }
    if (waitingForExit) {
      console.log(`\n  ${c.dim("bye!")}\n`);
      process.exit(0);
    }
    waitingForExit = true;
    process.stdout.write(`\n  ${c.dim("Press Ctrl+C again to exit.")}\n`);
    rl.prompt();
    // Reset after a timeout so normal Ctrl+C works next time
    setTimeout(() => { waitingForExit = false; }, 2000);
  });

  rl.on("close", () => {
    process.stdout.write("\n");
    process.exit(0);
  });

  if (opts.initialPrompt) {
    await handleUserInput(opts.initialPrompt);
  }
}
