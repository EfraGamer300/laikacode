export type Role = "system" | "user" | "assistant" | "tool";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolCallPart {
  type: "tool_call";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultPart {
  type: "tool_result";
  id: string;
  name: string;
  output: string;
  isError?: boolean;
}

export type ContentPart = TextPart | ToolCallPart | ToolResultPart;

export interface Message {
  role: Role;
  content: string | ContentPart[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolExecutionContext {
  cwd: string;
  abortSignal: AbortSignal;
}

export interface Tool {
  definition: ToolDefinition;
  execute: (
    input: Record<string, unknown>,
    ctx: ToolExecutionContext
  ) => Promise<{ output: string; isError?: boolean }>;
}

export interface StreamEvent {
  type: "text" | "tool_call_start" | "tool_call_delta" | "tool_call_end" | "done" | "error";
  text?: string;
  toolCall?: { id: string; name: string; input: Record<string, unknown> };
  error?: string;
}

export interface Provider {
  name: string;
  stream: (
    messages: Message[],
    tools: ToolDefinition[],
    model: string,
    signal: AbortSignal
  ) => AsyncIterable<StreamEvent>;
}

export interface Config {
  apiKey: string;
  model: string;
  smallModel: string;
  baseURL: string;
  maxTokens: number;
  maxIterations: number;
  includeCoEnv: boolean;
}
