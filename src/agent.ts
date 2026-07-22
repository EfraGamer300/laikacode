import chalk from "chalk";
import type { ContentPart, Message, Provider, StreamEvent, Tool, ToolDefinition, ToolExecutionContext } from "./types";
import { buildSystemPrompt } from "./prompt";

export interface AgentRunOptions {
  provider: Provider;
  model: string;
  maxIterations: number;
  cwd: string;
  tools: Tool[];
  toolsByName: Map<string, Tool>;
  onEvent: (ev: AgentEvent) => void | Promise<void>;
  abortSignal: AbortSignal;
}

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call_start"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_call_end"; id: string; name: string; input: Record<string, unknown>; output: string; isError?: boolean }
  | { type: "assistant_message"; message: Message }
  | { type: "error"; error: string }
  | { type: "done" };

interface PendingToolCall {
  id: string;
  name: string;
  argBuf: string;
}

function parsePartialInput(argBuf: string): Record<string, unknown> {
  if (!argBuf) return {};
  try {
    return JSON.parse(argBuf);
  } catch {
    return { _partial: argBuf };
  }
}

export async function runAgent(
  initialMessages: Message[],
  opts: AgentRunOptions
): Promise<Message[]> {
  const { provider, model, maxIterations, tools, toolsByName, onEvent, abortSignal, cwd } = opts;
  const toolDefs: ToolDefinition[] = tools.map((t) => t.definition);

  const messages: Message[] = [
    { role: "system", content: buildSystemPrompt({ cwd, tools: toolDefs }) },
    ...initialMessages,
  ];

  for (let iter = 0; iter < maxIterations; iter++) {
    if (abortSignal.aborted) {
      await onEvent({ type: "error", error: "aborted" });
      break;
    }

    const assistantParts: ContentPart[] = [];
    let textBuf = "";
    const pending = new Map<string, PendingToolCall>();

    try {
      for await (const ev of provider.stream(messages, toolDefs, model, abortSignal)) {
        if (ev.type === "text") {
          textBuf += ev.text;
          await onEvent({ type: "text", text: ev.text! });
        } else if (ev.type === "tool_call_start") {
          pending.set(ev.toolCall!.id, { id: ev.toolCall!.id, name: ev.toolCall!.name, argBuf: "" });
          await onEvent({ type: "tool_call_start", id: ev.toolCall!.id, name: ev.toolCall!.name, input: {} });
        } else if (ev.type === "tool_call_delta") {
          const p = pending.get(ev.toolCall!.id);
          if (p && typeof ev.text === "string") p.argBuf += ev.text;
        } else if (ev.type === "tool_call_end") {
          const p = pending.get(ev.toolCall!.id) || {
            id: ev.toolCall!.id,
            name: ev.toolCall!.name,
            argBuf: JSON.stringify(ev.toolCall!.input || {}),
          };
          const input = parsePartialInput(p.argBuf);
          assistantParts.push({ type: "tool_call", id: p.id, name: p.name, input });
        } else if (ev.type === "error") {
          await onEvent({ type: "error", error: ev.error || "stream error" });
          return messages;
        } else if (ev.type === "done") {
          // break out of inner loop
          break;
        }
      }
    } catch (e: any) {
      await onEvent({ type: "error", error: e.message || String(e) });
      break;
    }

    if (textBuf) assistantParts.unshift({ type: "text", text: textBuf });
    if (assistantParts.length === 0) {
      // nothing produced; stop
      break;
    }
    const assistantMsg: Message = { role: "assistant", content: assistantParts };
    messages.push(assistantMsg);
    await onEvent({ type: "assistant_message", message: assistantMsg });

    const calls = assistantParts.filter((p): p is Extract<ContentPart, { type: "tool_call" }> => p.type === "tool_call");
    if (calls.length === 0) {
      await onEvent({ type: "done" });
      break;
    }

    const ctx: ToolExecutionContext = { cwd, abortSignal };
    for (const call of calls) {
      if (abortSignal.aborted) break;
      const tool = toolsByName.get(call.name);
      let output = "";
      let isError = false;
      try {
        if (!tool) {
          output = `Tool not found: ${call.name}`;
          isError = true;
        } else {
          const r = await tool.execute(call.input || {}, ctx);
          output = r.output;
          isError = !!r.isError;
        }
      } catch (e: any) {
        output = `Error running ${call.name}: ${e.message}`;
        isError = true;
      }
      const toolMsg: Message = {
        role: "tool",
        content: [{ type: "tool_result", id: call.id, name: call.name, output, isError }],
      };
      messages.push(toolMsg);
      await onEvent({ type: "tool_call_end", id: call.id, name: call.name, input: call.input, output, isError });
    }
  }

  await onEvent({ type: "done" });
  return messages;
}

export { chalk };
