import fs from "node:fs";
import path from "node:path";
import type { Tool } from "../types";

export const writeTool: Tool = {
  definition: {
    name: "write",
    description:
      "Write a file to the local filesystem, overwriting if present. You MUST read before overwriting existing files. " +
      "Do not create documentation files unless explicitly asked.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to write to" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["file_path", "content"],
    },
  },
  async execute(input, _ctx) {
    const fp = String(input.file_path || "");
    if (!fp) return { output: "file_path required", isError: true };
    const content = String(input.content ?? "");
    try {
      const dir = path.dirname(fp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fp, content, "utf8");
      return { output: `Wrote ${content.length} bytes to ${fp}` };
    } catch (e: any) {
      return { output: `Error: ${e.message}`, isError: true };
    }
  },
};
