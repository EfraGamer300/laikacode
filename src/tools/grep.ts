import { spawn } from "node:child_process";
import path from "node:path";
import type { Tool } from "../types.ts";

export const grepTool: Tool = {
  definition: {
    name: "grep",
    description:
      "Fast content search using regular expressions across files. Returns file paths with line numbers of matches. " +
      "Use `include` to filter by file extension (e.g. '*.ts').",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "Directory to search. Default cwd." },
        include: { type: "string", description: "File pattern filter (e.g. '*.ts')" },
      },
      required: ["pattern"],
    },
  },
  async execute(input, ctx) {
    const pattern = String(input.pattern || "");
    if (!pattern) return { output: "pattern required", isError: true };
    const root = (input.path as string) || ctx.cwd;
    const include = (input.include as string) || "";
    return new Promise((resolve) => {
      const args = [
        "--line-number",
        "--no-heading",
        "--color=never",
        "-E",
        "--",
        pattern,
        root,
      ];
      let lastErr = "";
      const tryAlternate = (idx: number) => {
        if (idx === 0) {
          const child = spawn("rg", args, { stdio: ["ignore", "pipe", "pipe"] });
          const out: Buffer[] = [];
          const err: Buffer[] = [];
          child.stdout.on("data", (c) => out.push(c));
          child.stderr.on("data", (c) => err.push(c));
          child.on("error", () => tryAlternate(1));
          child.on("close", (code) => {
            if (code === 0 || code === 1) {
              const text = Buffer.concat(out).toString("utf8").trim();
              resolve({ output: text || "No matches" });
            } else {
              lastErr = Buffer.concat(err).toString("utf8");
              tryAlternate(1);
            }
          });
        } else if (idx === 1) {
          const cmdArgs = ["-rn", "-E"];
          if (include) cmdArgs.push(`--include=${include}`);
          cmdArgs.push("--", pattern, root);
          const child = spawn("grep", cmdArgs, { stdio: ["ignore", "pipe", "pipe"] });
          const out: Buffer[] = [];
          child.stdout.on("data", (c) => out.push(c));
          child.on("error", () => tryAlternate(2));
          child.on("close", (code) => {
            if (code === 0 || code === 1) {
              const text = Buffer.concat(out).toString("utf8").trim();
              resolve({ output: text || "No matches" });
            } else {
              tryAlternate(2);
            }
          });
        } else {
          resolve({ output: lastErr || "No matches", isError: true });
        }
      };
      tryAlternate(0);
    });
  },
};
