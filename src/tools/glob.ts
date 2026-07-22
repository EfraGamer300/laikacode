import fs from "node:fs/promises";
import path from "node:path";
import type { Tool } from "../types";

function globToRegex(g: string): RegExp {
  const parts: string[] = [];
  let i = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        parts.push(".*");
        i += 2;
        continue;
      }
      parts.push("[^/]*");
      i++;
      continue;
    }
    if (c === "?") {
      parts.push("[^/]");
      i++;
      continue;
    }
    if (".[](){}|^$+\\,".includes(c)) {
      parts.push("\\" + c);
    } else {
      parts.push(c);
    }
    i++;
  }
  return new RegExp(parts.join(""));
}

export const globTool: Tool = {
  definition: {
    name: "glob",
    description:
      "Fast file pattern matcher. Supports patterns like `**/*.ts` or `src/**/*.{ts,tsx}`. Returns matching file paths.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern" },
        path: { type: "string", description: "Root directory. Default cwd." },
      },
      required: ["pattern"],
    },
  },
  async execute(input, ctx) {
    const pattern = String(input.pattern || "**/*");
    const root = (input.path as string) || ctx.cwd;
    const matches: string[] = [];
    const limit = 1000;

    const braceExpand = (p: string): string[] => {
      const open = p.indexOf("{");
      const close = p.indexOf("}", open);
      if (open < 0 || close < 0) return [p];
      const alts = p.slice(open + 1, close).split(",");
      const out: string[] = [];
      for (const alt of alts) {
        const replaced = p.slice(0, open) + alt + p.slice(close + 1);
        out.push(...braceExpand(replaced));
      }
      return out;
    };

    const patterns = braceExpand(pattern).map((p) => {
      let abs = path.isAbsolute(p) ? p : path.join(root, p);
      return { original: p, regex: globToRegex(abs.replace(/\*/g, ".*").replace(/\\/g, "/")) };
    });

    const seen = new Set<string>();
    async function walk(dir: string, depth: number) {
      if (matches.length >= limit) return;
      if (dir.includes("/node_modules/") && depth > 0) return;
      if (dir.includes("/.git/") && depth > 0) return;
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = full.replace(/\\/g, "/");
        for (const pat of patterns) {
          if (pat.regex.test(rel) && !seen.has(rel)) {
            seen.add(rel);
            matches.push(full);
          }
        }
        if (e.isDirectory()) {
          if (matches.length < limit) await walk(full, depth + 1);
        }
      }
    }

    // For absolute patterns, anchor walk at the longest non-glob prefix
    let walkRoot = root;
    for (const pat of patterns) {
      const orig = pat.original;
      const abs = path.isAbsolute(orig) ? orig : path.join(root, orig);
      const fixed = abs.split(/[?*{]/)[0];
      const base = path.dirname(fixed);
      if (path.resolve(base).length > path.resolve(walkRoot).length) walkRoot = base;
    }
    await walk(walkRoot, 0);
    if (matches.length === 0) return { output: "No matches" };
    return { output: matches.slice(0, limit).join("\n") };
  },
};
