export type AiErrorCode =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "auth_failed"
  | "bad_request"
  | "model_not_found"
  | "provider_error"
  | "network_error"
  | "aborted";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
    public upstreamStatus?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

const MESSAGES: Record<AiErrorCode, string> = {
  not_configured: "The AI provider is not configured yet. An admin must add the Cloudflare credentials.",
  timeout: "The AI provider took too long to respond. Try again.",
  rate_limited: "The AI provider is rate limiting requests. Wait a moment and try again.",
  auth_failed: "The AI provider rejected the credentials. An admin should check the Cloudflare API token.",
  bad_request: "The AI provider rejected the request (check the model ID and input).",
  model_not_found: "The configured model was not found on the AI provider.",
  provider_error: "The AI provider returned an error. Try again shortly.",
  network_error: "Could not reach the AI provider.",
  aborted: "The request was cancelled.",
};

export function messageFor(code: AiErrorCode) {
  return MESSAGES[code];
}

/** Map an upstream HTTP status to a stable error code. */
export function mapProviderStatus(status: number, detail?: string): AiError {
  let code: AiErrorCode = "provider_error";
  if (status === 401 || status === 403) code = "auth_failed";
  else if (status === 404) code = "model_not_found";
  else if (status === 408 || status === 504) code = "timeout";
  else if (status === 429) code = "rate_limited";
  else if (status >= 400 && status < 500) code = "bad_request";
  const msg = detail ? `${MESSAGES[code]} (${detail.slice(0, 200)})` : MESSAGES[code];
  return new AiError(code, msg, status);
}

/** HTTP status our own API returns for each error code. */
export function httpStatusFor(code: AiErrorCode): number {
  switch (code) {
    case "not_configured":
      return 503;
    case "timeout":
      return 504;
    case "rate_limited":
      return 429;
    case "bad_request":
    case "model_not_found":
      return 400;
    case "aborted":
      return 499;
    default:
      return 502;
  }
}

export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Error && e.name === "AbortError") return new AiError("aborted", MESSAGES.aborted);
  return new AiError("network_error", MESSAGES.network_error);
}
