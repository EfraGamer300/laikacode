import type { Message, Provider, ToolDefinition, ContentPart } from "../types.ts";

interface AnthropicArgs {
  apiKey: string;
  baseURL?: string;
}

function toAnthropicMessages(messages: Message[]) {
  let system = "";
  const msgs: any[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      system = typeof m.content === "string" ? m.content : "";
      continue;
    }
    if (m.role === "user") {
      const text = typeof m.content === "string"
        ? m.content
        : (m.content as ContentPart[])
            .filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text")
            .map((p) => p.text)
            .join("");
      msgs.push({ role: "user", content: text });
      continue;
    }
    if (m.role === "assistant") {
      if (typeof m.content === "string") {
        msgs.push({ role: "assistant", content: m.content });
        continue;
      }
      const parts = m.content as ContentPart[];
      const blocks: any[] = [];
      for (const p of parts) {
        if (p.type === "text") {
          blocks.push({ type: "text", text: p.text });
        } else if (p.type === "tool_call") {
          blocks.push({
            type: "tool_use",
            id: p.id,
            name: p.name,
            input: p.input,
          });
        }
      }
      if (blocks.length) msgs.push({ role: "assistant", content: blocks });
      continue;
    }
    if (m.role === "tool") {
      const toolParts = typeof m.content === "string" ? [] : m.content as ContentPart[];
      const tr = toolParts.find((p): p is Extract<ContentPart, { type: "tool_result" }> => p.type === "tool_result");
      if (tr) {
        msgs.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: tr.id,
            content: tr.output,
          }],
        });
      }
    }
  }
  return { system, messages: msgs };
}

function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export function createAnthropicProvider({ apiKey, baseURL }: AnthropicArgs): Provider {
  const url = baseURL || "https://api.anthropic.com";
  return {
    name: "anthropic",
    async *stream(messages, tools, model, signal) {
      const { system, messages: msgs } = toAnthropicMessages(messages);
      const body: Record<string, unknown> = {
        model,
        messages: msgs,
        max_tokens: 8192,
        stream: true,
      };
      if (system) body.system = system;
      if (tools.length) body.tools = toAnthropicTools(tools);

      const res = await fetch(`${url}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 400)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let currentToolId = "";
      let currentToolName = "";
      let currentToolInput = "";

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
            if (!line || line.startsWith(":") || !line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            let json: any;
            try { json = JSON.parse(data); } catch { continue; }

            if (json.type === "content_block_start") {
              const block = json.content_block;
              if (block?.type === "tool_use") {
                currentToolId = block.id;
                currentToolName = block.name;
                currentToolInput = "";
                yield {
                  type: "tool_call_start",
                  toolCall: { id: block.id, name: block.name, input: {} },
                };
              }
            } else if (json.type === "content_block_delta") {
              const delta = json.delta;
              if (delta?.type === "text_delta" && delta.text) {
                yield { type: "text", text: delta.text };
              } else if (delta?.type === "input_json_delta" && delta.partial_json) {
                currentToolInput += delta.partial_json;
                yield {
                  type: "tool_call_delta",
                  toolCall: { id: currentToolId, name: currentToolName, input: {} },
                  text: delta.partial_json,
                };
              }
            } else if (json.type === "content_block_stop") {
              if (currentToolId) {
                let input: Record<string, unknown> = {};
                if (currentToolInput) {
                  try { input = JSON.parse(currentToolInput); } catch { input = { _raw: currentToolInput }; }
                }
                yield {
                  type: "tool_call_end",
                  toolCall: { id: currentToolId, name: currentToolName, input },
                };
                currentToolId = "";
                currentToolName = "";
                currentToolInput = "";
              }
            } else if (json.type === "message_stop") {
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
