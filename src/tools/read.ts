import fs from "node:fs";
import path from "node:path";
import type { Tool } from "../types";

export const readTool: Tool = {
  definition: {
    name: "read",
    description:
      "Read a file or directory from the local filesystem. Returns contents with line numbers like `N: <line>`. " +
      "Use offset (1-indexed) and limit to read slices of large files. Use this instead of head/tail/cat.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to read" },
        offset: { type: "number", description: "Line to start at (1-indexed). Default 1." },
        limit: { type: "number", description: "Max lines to return. Default 2000." },
      },
      required: ["file_path"],
    },
  },
  async execute(input, _ctx) {
    const fp = String(input.file_path || "");
    if (!fp) return { output: "file_path required", isError: true };
    const offset = Number(input.offset || 1);
    const limit = Number(input.limit || 2000);
    try {
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(fp).map((e) => e + (fs.statSync(path.join(fp, e)).isDirectory() ? "/" : ""));
        return { output: `${fp}\n` + entries.join("\n") };
      }
      const raw = fs.readFileSync(fp, "utf8");
      const lines = raw.split("\n");
      const start = Math.max(1, offset) - 1;
      const end = Math.min(lines.length, start + limit);
      const out: string[] = [];
      for (let i = start; i < end; i++) {
        let line = lines[i] ?? "";
        if (line.length > 2000) line = line.slice(0, 2000) + " … [truncated]";
        out.push(`${i + 1}: ${line}`);
      }
      return { output: out.join("\n") };
    } catch (e: any) {
      return { output: `Error: ${e.message}`, isError: true };
    }
  },
};
