import type { Tool } from "../types";
import { bashTool } from "./bash";
import { readTool } from "./read";
import { writeTool } from "./write";
import { editTool } from "./edit";
import { globTool } from "./glob";
import { grepTool } from "./grep";

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
