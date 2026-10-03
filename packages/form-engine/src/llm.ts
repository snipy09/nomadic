/**
 * LLM access for open-ended questions only. One batched call per form.
 */
export interface LlmClient {
  /** Returns parsed JSON or null on any failure. */
  completeJson(system: string, user: string): Promise<unknown | null>;
}

export class GroqClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model = 'llama-3.1-8b-instant',
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a)
  ) {}

  async completeJson(system: string, user: string): Promise<unknown | null> {
    if (!this.apiKey) return null;
    try {
      const res = await this.fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = data?.choices?.[0]?.message?.content || '';
      return parseJsonLoose(raw);
    } catch {
      return null;
    }
  }
}

export function parseJsonLoose(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}
