import type { Message, Provider, ToolDefinition, ContentPart } from "../types.ts";

interface OllamaArgs {
  baseURL?: string;
}

function toOllamaMessages(messages: Message[]) {
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
          function: { name: p.name, arguments: p.input },
        }));
      const out: Record<string, unknown> = { role: "assistant" };
      if (content) out.content = content;
      if (toolCalls.length) out.tool_calls = toolCalls;
      return out;
    }
    if (m.role === "tool") {
      const tr = parts.find((p): p is Extract<ContentPart, { type: "tool_result" }> => p.type === "tool_result");
      if (tr) {
        return { role: "tool", content: tr.output };
      }
    }
    return { role: m.role, content: "" };
  });
}

function toOllamaTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function createOllamaProvider({ baseURL }: OllamaArgs): Provider {
  const url = baseURL || "http://localhost:11434";
  return {
    name: "ollama",
    async *stream(messages, tools, model, signal) {
      const body: Record<string, unknown> = {
        model,
        messages: toOllamaMessages(messages),
        stream: true,
      };
      if (tools.length) {
        body.tools = toOllamaTools(tools);
      }
      const res = await fetch(`${url}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Ollama ${res.status}: ${txt.slice(0, 400)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            if (!line.trim()) continue;
            let json: any;
            try { json = JSON.parse(line); } catch { continue; }

            const msg = json.message;
            if (!msg) continue;

            if (msg.content) {
              yield { type: "text", text: msg.content };
            }

            if (Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls) {
                const fn = tc.function || {};
                const name = fn.name || "";
                const input = fn.arguments || {};
                const id = `ollama_${name}_${Date.now()}`;
                yield { type: "tool_call_start", toolCall: { id, name, input: {} } };
                yield { type: "tool_call_delta", toolCall: { id, name, input: {} }, text: JSON.stringify(input) };
                yield { type: "tool_call_end", toolCall: { id, name, input } };
              }
            }

            if (json.done) {
              yield { type: "done" };
              return;
            }
          }
        }
        yield { type: "done" };
      } finally {
        reader.releaseLock();
      }
    },
  };
}
