import "server-only";

/**
 * Minimal client for Sarvam's chat completions API (OpenAI-compatible, text only).
 * Used on the server when an admin prepares a lesson; never in the learner's path.
 */
const URL = "https://api.sarvam.ai/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: "sarvam-105b" | "sarvam-105b-conversations";
  maxTokens?: number;
  /** sarvam-105b only. "low" keeps reasoning short so the answer fits in maxTokens. */
  reasoningEffort?: "low" | "medium" | "high" | null;
  temperature?: number;
}

export interface ChatResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number; reasoningTokens: number };
}

export class SarvamError extends Error {}

export async function sarvamChat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new SarvamError("SARVAM_API_KEY is not set in apps/web/.env.local");
  const model = opts.model ?? "sarvam-105b-conversations";
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
  };
  if (model === "sarvam-105b") body.reasoning_effort = opts.reasoningEffort ?? "low";

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) {
      const j = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
      };
      const content = j.choices?.[0]?.message?.content ?? "";
      if (!content) {
        throw new SarvamError(
          `The model returned no answer (finish reason: ${j.choices?.[0]?.finish_reason ?? "unknown"}). The file may be too long; try a shorter one.`,
        );
      }
      return {
        content,
        usage: {
          promptTokens: j.usage?.prompt_tokens ?? 0,
          completionTokens: j.usage?.completion_tokens ?? 0,
          reasoningTokens: j.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        },
      };
    }
    lastError = `${res.status} ${(await res.text()).slice(0, 300)}`;
    // Retry rate limits and server errors; give up on bad requests.
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new SarvamError(`Sarvam request failed: ${lastError}`);
}

/** Pulls the first JSON object out of a model answer (tolerates ```json fences and chatter). */
export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SarvamError("The model's answer was not JSON.");
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new SarvamError("The model's answer was not valid JSON.");
  }
}
