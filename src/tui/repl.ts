import readline from "node:readline";
import chalk from "chalk";
import type { AgentEvent } from "../agent.ts";
import { runAgent } from "../agent.ts";
import type { Config } from "../config.ts";
import { createOpenRouterProvider } from "../providers/openrouter.ts";
import type { Message } from "../types.ts";
import { ALL_TOOLS, toolByName } from "../tools/index.ts";
import { renderMarkdown, truncJSON, truncate } from "./format.ts";

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
const DOG = chalk.cyanBright("🦴");
const USER = chalk.gray("›");
const THINK = chalk.gray("◌");
const OK = chalk.green("✓");
const ERR = chalk.red("✗");
const WARN = chalk.yellow("▸");
const DIM = chalk.gray;
const BOLD = chalk.bold;
const SEP = chalk.gray("─".repeat(50));

// ─── Banner ───────────────────────────────────────────────────────────────────
const BANNER = `
${chalk.cyan("    ╭──────────────────────────────────────╮")}
${chalk.cyan("    │")}  ${BOLD.cyanBright("LaikaCode")}  ${DIM("v0.1.0")}                  ${chalk.cyan("│")}
${chalk.cyan("    │")}  ${DIM("AI coding assistant")}                   ${chalk.cyan("│")}
${chalk.cyan("    │")}  ${DIM("Powered by OpenRouter")}                ${chalk.cyan("│")}
${chalk.cyan("    ╰──────────────────────────────────────╯")}
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
    prompt: chalk.cyanBright("❯ "),
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
        console.log(BOLD.cyan("  Commands"));
        console.log(SEP);
        for (const cmd of commands) {
          console.log(
            `  ${chalk.cyanBright(cmd.name.padEnd(14))} ${DIM(cmd.describe)}`
          );
        }
        console.log();
      },
    },
    {
      name: "/clear",
      describe: "Clear conversation history",
      run: (_a, c) => {
        c.messages.length = 0;
        c.clear();
        showBanner();
        console.log(DIM("Conversation cleared."));
      },
    },
    {
      name: "/model",
      describe: "Show or set model (e.g. /model anthropic/claude-sonnet-4)",
      run: (args, c) => {
        if (!args.trim()) {
          console.log(DIM(`Current:  ${BOLD(c.cfg.model)}`));
          console.log(DIM(`Small:    ${BOLD(c.cfg.smallModel)}`));
          console.log(
            DIM(`Usage:    /model <provider/model-name>`)
          );
        } else {
          c.cfg.model = args.trim();
          console.log(DIM(`Model → ${BOLD(c.cfg.model)}`));
        }
      },
    },
    {
      name: "/cwd",
      describe: "Show working directory",
      run: (_a, c) => console.log(DIM(c.cwd)),
    },
    {
      name: "/tools",
      describe: "List available tools",
      run: () => {
        console.log();
        console.log(BOLD.cyan("  Tools"));
        console.log(SEP);
        for (const t of ALL_TOOLS) {
          const desc = t.definition.description.split("\n")[0];
          console.log(
            `  ${chalk.greenBright(t.definition.name.padEnd(12))} ${DIM(desc)}`
          );
        }
        console.log();
      },
    },
    {
      name: "/tokens",
      describe: "Show token estimates for this conversation",
      run: (_a, c) => {
        let total = 0;
        for (const m of c.messages) {
          const text =
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content);
          total += Math.ceil(text.length / 4);
        }
        console.log(DIM(`Messages: ${c.messages.length}`));
        console.log(DIM(`Approx. tokens: ~${total.toLocaleString()}`));
      },
    },
    {
      name: "/completions",
      describe: "Show install instructions for shell completions",
      run: () => {
        console.log();
        console.log(DIM("Install completions for your shell:"));
        console.log();
        console.log(`  ${chalk.cyan("Bash:")}  source <(laikacode completions)`);
        console.log(`  ${chalk.cyan("Bash:")}  laikacode completions --install --bash`);
        console.log();
        console.log(`  ${chalk.cyan("Zsh:")}   laikacode completions --install --zsh`);
        console.log(`         Then add to ~/.zshrc:  fpath=(~/.zsh/completions $fpath) && compinit`);
        console.log();
      },
    },
    {
      name: "/exit",
      describe: "Exit LaikaCode",
      run: () => {
        rl.close();
      },
    },
  ];

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function showBanner() {
    process.stdout.write(BANNER);
    console.log(
      `  ${DIM("cwd:")} ${BOLD(cwd)}  ${DIM("·")}  ${DIM("model:")} ${BOLD(cfg.model)}`
    );
    console.log(
      `  ${DIM("Type")} ${chalk.white("/help")} ${DIM("for commands")}  ${DIM("·")}  ${DIM("Ctrl+C")} ${DIM("twice to exit")}`
    );
    console.log();
  }

  // ─── Run text through agent ──────────────────────────────────────────────
  async function runText(text: string, ac: AbortController) {
    messages.push({ role: "user", content: text });

    // Show user message
    console.log();
    console.log(`${USER} ${BOLD(text)}`);

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
          `  ${chalk.cyan(SPINNERS[spinnerIdx % SPINNERS.length])} ${DIM("thinking…")}`
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
          `\n  ${chalk.yellow("▸")} ${chalk.white(ev.name)} ${DIM(inputStr)}\n`
        );
      } else if (ev.type === "tool_call_end") {
        const icon = ev.isError ? ERR : OK;
        const head = `${icon} ${chalk.white(ev.name)}`;
        const preview = truncate(ev.output.split("\n")[0], 120);
        process.stdout.write(
          `  ${icon} ${chalk.white(ev.name)} → ${DIM(preview)}${ev.output.length > 120 ? " …" : ""}\n`
        );
      } else if (ev.type === "error") {
        stopSpinner();
        console.log(`\n  ${ERR} ${chalk.red(ev.error)}`);
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
          toolCalls > 0 ? ` · ${toolCalls} tool call${toolCalls > 1 ? "s" : ""}` : "";
        console.log();
        console.log(
          DIM(`  ~${approxTokens.toLocaleString()} tokens${toolsNote}`)
        );
      }
      console.log();
    } catch (e: any) {
      stopSpinner();
      console.log(`\n  ${ERR} ${chalk.red(e.message || e)}\n`);
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
        console.log(`${ERR} Unknown command: ${name}. Type ${chalk.white("/help")}`);
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
      process.stdout.write(`\n  ${DIM("Interrupted.")}\n`);
      rl.prompt();
      return;
    }
    if (waitingForExit) {
      console.log();
      process.exit(0);
    }
    waitingForExit = true;
    process.stdout.write(`\n  ${DIM("Press Ctrl+C again to exit.")}\n`);
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
