import type { Provider } from "../types";
import type { Config } from "../config";
import { createOpenRouterProvider } from "./openrouter";
import { createOpenAIProvider } from "./openai";
import { createAnthropicProvider } from "./anthropic";
import { createOllamaProvider } from "./ollama";

export type ProviderName = "openrouter" | "openai" | "anthropic" | "ollama";

export interface ProviderInfo {
  name: ProviderName;
  label: string;
  description: string;
  needsApiKey: boolean;
  defaultBaseURL: string;
  defaultModel: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    name: "openrouter",
    label: "OpenRouter",
    description: "Proxy multi-model (Claude, GPT, Gemini...)",
    needsApiKey: true,
    defaultBaseURL: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
  },
  {
    name: "openai",
    label: "OpenAI",
    description: "Direto (GPT-4o, GPT-4.1...)",
    needsApiKey: true,
    defaultBaseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
  },
  {
    name: "anthropic",
    label: "Anthropic",
    description: "Direto (Claude Sonnet, Opus...)",
    needsApiKey: true,
    defaultBaseURL: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-20250514",
  },
  {
    name: "ollama",
    label: "Ollama",
    description: "Local e gratis (llama3, codellama...)",
    needsApiKey: false,
    defaultBaseURL: "http://localhost:11434",
    defaultModel: "llama3.1",
  },
];

export function createProvider(cfg: Config): Provider {
  const name = (cfg.provider || "openrouter") as ProviderName;

  switch (name) {
    case "openai":
      return createOpenAIProvider({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL || undefined,
      });
    case "anthropic":
      return createAnthropicProvider({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL || undefined,
      });
    case "ollama":
      return createOllamaProvider({
        baseURL: cfg.baseURL || undefined,
      });
    case "openrouter":
    default:
      return createOpenRouterProvider({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL,
      });
  }
}

export function getProviderInfo(name: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.name === name);
}
