import { execSync, spawn } from "node:child_process";
import type { Tool } from "../types";

export const bashTool: Tool = {
  definition: {
    name: "bash",
    description:
      "Executes a bash command in the persistent shell session. Use this for terminal operations like git, npm, build, tests. " +
      "Prefer the specialized tools (read/write/edit/glob/grep) over cat/echo/sed. " +
      "Use 'workdir' param to change working directory. Returns combined stdout+stderr up to ~50KB.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
        workdir: { type: "string", description: "Working directory. Defaults to current." },
        timeout: { type: "number", description: "Timeout in ms (default 120000)." },
      },
      required: ["command"],
    },
  },
  async execute(input, ctx) {
    const cmd = String(input.command || "");
    if (!cmd) return { output: "No command provided", isError: true };
    const workdir = (input.workdir as string) || ctx.cwd;
    const timeout = (input.timeout as number) || 120000;
    return new Promise((resolve) => {
      const child = spawn("bash", ["-c", cmd], {
        cwd: workdir,
        env: { ...process.env, TERM: "dumb" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      child.stdout.on("data", (c) => chunks.push(c));
      child.stderr.on("data", (c) => errChunks.push(c));
      let killed = false;
      const timer = setTimeout(() => {
        killed = true;
        child.kill("SIGKILL");
      }, Math.min(timeout, 120000));
      ctx.abortSignal.addEventListener("abort", () => {
        killed = true;
        child.kill("SIGKILL");
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const stdout = Buffer.concat(chunks).toString("utf8");
        const stderr = Buffer.concat(errChunks).toString("utf8");
        let result = stdout;
        if (stderr) result += (result ? "\n" : "") + stderr;
        result = `[exit ${killed ? "timeout/aborted" : code}]\n` + result;
        const MAX = 200 * 1024;
        if (result.length > MAX) {
          result = result.slice(0, MAX) + `\n... [truncated, ${result.length - MAX} bytes dropped]`;
        }
        resolve({ output: result, isError: killed || (code !== 0 ? true : false) });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ output: `Error: ${err.message}`, isError: true });
      });
    });
  },
};
