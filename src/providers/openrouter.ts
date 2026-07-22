import type { Message, Provider, StreamEvent, ToolDefinition, ContentPart } from "../types";

interface OpenRouterArgs {
  apiKey: string;
  baseURL: string;
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
        return {
          role: "tool",
          tool_call_id: tr.id,
          content: tr.output,
        };
      }
    }
    return { role: m.role, content: "" };
  });
}

function toOpenAITools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function createOpenRouterProvider({ apiKey, baseURL }: OpenRouterArgs): Provider {
  return {
    name: "openrouter",
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
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/laikacode",
          "X-Title": "LaikaCode",
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 400)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      const partials = new Map<string, { name: string; argBuf: string }>();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            let line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            line = line.trim();
            if (!line) continue;
            if (line.startsWith(":")) continue;
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") {
              yield { type: "done" };
              return;
            }
            let json: any;
            try {
              json = JSON.parse(data);
            } catch {
              continue;
            }
            const choice = json.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta || {};
            if (typeof delta.content === "string" && delta.content) {
              yield { type: "text", text: delta.content };
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const id: string | undefined = tc.id;
                const fn = tc.function || {};
                const name: string | undefined = fn.name;
                const argsDelta: string = fn.arguments || "";
                const key = id || name || "_";
                if (!partials.has(key)) {
                  partials.set(key, { name: name || "", argBuf: "" });
                  if (id) {
                    yield {
                      type: "tool_call_start",
                      toolCall: { id, name: name || "", input: {} },
                    };
                  }
                }
                const p = partials.get(key)!;
                if (name) p.name = name;
                if (argsDelta) p.argBuf += argsDelta;
                if (argsDelta) {
                  yield {
                    type: "tool_call_delta",
                    toolCall: { id: key, name: p.name, input: {} },
                    text: argsDelta,
                  };
                }
              }
            }
            if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
              for (const [key, p] of partials.entries()) {
                let input: Record<string, unknown> = {};
                if (p.argBuf) {
                  try {
                    input = JSON.parse(p.argBuf);
                  } catch {
                    input = { _raw: p.argBuf };
                  }
                }
                yield {
                  type: "tool_call_end",
                  toolCall: { id: key, name: p.name, input },
                };
              }
              partials.clear();
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
