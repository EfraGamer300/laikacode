import type { Message, Provider, StreamEvent, ToolDefinition, ContentPart } from "../types";
import { createSSEParser } from "./sse";

interface OpenAIArgs {
  apiKey: string;
  baseURL?: string;
}

function toOpenAIMessages(messages: Message[]) {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    const parts = m.content as ContentPart[];
    if (m.role === "assistant") {
      const content = parts
        .filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join("");
      const toolCalls = parts
        .filter((p): p is Extract<ContentPart, { type: "tool_call" }> => p.type === "tool_call")
        .map((p) => ({
          id: p.id,
          type: "function",
          function: { name: p.name, arguments: JSON.stringify(p.input) },
        }));
      const out: Record<string, unknown> = { role: "assistant" };
      if (content) out.content = content;
      if (toolCalls.length) out.tool_calls = toolCalls;
      return out;
    }
    if (m.role === "tool") {
      const tr = parts.find((p): p is Extract<ContentPart, { type: "tool_result" }> => p.type === "tool_result");
      if (tr) {
        return { role: "tool", tool_call_id: tr.id, content: tr.output };
      }
    }
    return { role: m.role, content: "" };
  });
}

function toOpenAITools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function createOpenAIProvider({ apiKey, baseURL }: OpenAIArgs): Provider {
  const url = baseURL || "https://api.openai.com/v1";
  return {
    name: "openai",
    async *stream(messages, tools, model, signal) {
      const body: Record<string, unknown> = {
        model,
        messages: toOpenAIMessages(messages),
        stream: true,
        max_tokens: 8192,
      };
      if (tools.length) {
        body.tools = toOpenAITools(tools);
        body.tool_choice = "auto";
      }
      const res = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 400)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const events: StreamEvent[] = [];

      const parser = createSSEParser({
        onText: (text) => events.push({ type: "text", text }),
        onToolCallStart: (id, name) => events.push({ type: "tool_call_start", toolCall: { id, name, input: {} } }),
        onToolCallDelta: (id, name, argsDelta) => events.push({ type: "tool_call_delta", toolCall: { id, name, input: {} }, text: argsDelta }),
        onToolCallEnd: (id, name, input) => events.push({ type: "tool_call_end", toolCall: { id, name, input } }),
        onDone: () => events.push({ type: "done" }),
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            parser.feed(line + "\n");
            for (const ev of events) yield ev;
            events.length = 0;
          }
        }
        if (buf.trim()) parser.feed(buf);
        for (const ev of events) yield ev;
        events.length = 0;
        yield { type: "done" };
      } finally {
        reader.releaseLock();
      }
    },
  };
}
