export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface ChatProvider {
  readonly name: string;
  complete(req: ChatRequest): Promise<{ text: string }>;
  /** Resolves once the upstream accepted the request; the stream yields text deltas. */
  stream(req: ChatRequest): Promise<ReadableStream<string>>;
}

export const MODEL_ID_PATTERN = /^@(cf|hf)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._\-/]+$/;
export function isValidModelId(id: string) {
  return MODEL_ID_PATTERN.test(id);
}
export const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
export const SUGGESTED_MODELS = [
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/qwen/qwen2.5-coder-32b-instruct",
];
