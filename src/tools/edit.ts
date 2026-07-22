import fs from "node:fs";
import type { Tool } from "../types";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

export const editTool: Tool = {
  definition: {
    name: "edit",
    description:
      "Performs an exact string replacement in a file. The old_string MUST appear exactly once unless replaceAll=true. " +
      "You MUST read the file before editing. Keep surrounding context to make the match unique.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the file to edit" },
        old_string: { type: "string", description: "Exact text to find (after line-number prefix). Don't include line numbers." },
        new_string: { type: "string", description: "Replacement text. Must differ from old_string." },
        replace_all: { type: "boolean", description: "Replace every occurrence. Default false." },
        regex: { type: "boolean", description: "Treat old_string as a regex. Default false." },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  async execute(input, _ctx) {
    const fp = String(input.file_path || "");
    if (!fp) return { output: "file_path required", isError: true };
    const oldStr = normalizeNewlines(String(input.old_string ?? ""));
    const newStr = normalizeNewlines(String(input.new_string ?? ""));
    if (oldStr === newStr && !input.regex) {
      return { output: "old_string equals new_string", isError: true };
    }
    const replaceAll = !!input.replace_all;
    const useRegex = !!input.regex;
    try {
      if (!fs.existsSync(fp)) return { output: `File not found: ${fp}`, isError: true };
      const raw = fs.readFileSync(fp, "utf8");
      const content = normalizeNewlines(raw);
      let count = 0;
      let result: string;
      if (useRegex) {
        const re = new RegExp(oldStr, replaceAll ? "g" : "");
        const matches = content.match(re);
        count = matches ? matches.length : 0;
        result = content.replace(re, newStr);
      } else {
        count = content.split(escapeRegex(oldStr)).length - 1;
        if (count === 0) return { output: "old_string not found", isError: true };
        if (count > 1 && !replaceAll) {
          return { output: `Found ${count} matches, provide more context or set replace_all=true`, isError: true };
        }
        if (replaceAll) {
          result = content.split(oldStr).join(newStr);
        } else {
          const i = content.indexOf(oldStr);
          result = content.slice(0, i) + newStr + content.slice(i + oldStr.length);
        }
      }
      if (count === 0) return { output: "old_string not found", isError: true };
      fs.writeFileSync(fp, result, "utf8");
      return { output: `Edited ${fp}: ${count} replacement(s)` };
    } catch (e: any) {
      return { output: `Error: ${e.message}`, isError: true };
    }
  },
};
