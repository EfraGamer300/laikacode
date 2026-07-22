import type { Tool } from "../types.ts";
import { bashTool } from "./bash.ts";
import { readTool } from "./read.ts";
import { writeTool } from "./write.ts";
import { editTool } from "./edit.ts";
import { globTool } from "./glob.ts";
import { grepTool } from "./grep.ts";

export const ALL_TOOLS: Tool[] = [
  bashTool,
  readTool,
  writeTool,
  editTool,
  globTool,
  grepTool,
];

export const toolByName = new Map<string, Tool>(
  ALL_TOOLS.map((t) => [t.definition.name, t])
);
