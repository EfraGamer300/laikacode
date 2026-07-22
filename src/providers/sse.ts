import type { StreamEvent } from "../types";

export interface SSEParserOpts {
  onText: (text: string) => void;
  onToolCallStart: (id: string, name: string) => void;
  onToolCallDelta: (id: string, name: string, argsDelta: string) => void;
  onToolCallEnd: (id: string, name: string, input: Record<string, unknown>) => void;
  onDone: () => void;
}

export function createSSEParser(opts: SSEParserOpts) {
  const partials = new Map<string, { name: string; argBuf: string }>();

  return {
    feed(chunk: string) {
      const lines = chunk.split("\n");
      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith(":") || !line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          opts.onDone();
          return;
        }
        let json: any;
        try { json = JSON.parse(data); } catch { continue; }
        const choice = json.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};

        if (typeof delta.content === "string" && delta.content) {
          opts.onText(delta.content);
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
              if (id) opts.onToolCallStart(id, name || "");
            }
            const p = partials.get(key)!;
            if (name) p.name = name;
            if (argsDelta) p.argBuf += argsDelta;
            if (argsDelta) opts.onToolCallDelta(key, p.name, argsDelta);
          }
        }

        if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
          for (const [key, p] of partials.entries()) {
            let input: Record<string, unknown> = {};
            if (p.argBuf) {
              try { input = JSON.parse(p.argBuf); } catch { input = { _raw: p.argBuf }; }
            }
            opts.onToolCallEnd(key, p.name, input);
          }
          partials.clear();
        }
      }
    },
  };
}
