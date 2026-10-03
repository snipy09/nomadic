/**
 * LLM access for open-ended questions only. One batched call per form.
 */
export interface LlmClient {
  /** Returns parsed JSON or null on any failure. */
  completeJson(system: string, user: string): Promise<unknown | null>;
}

/** Profile facts the model may use (nothing else about the candidate is sent). */
export interface FormAnswerCandidate {
  name?: string;
  current_title?: string;
  current_company?: string;
  desired_title?: string;
  years_of_experience?: number;
  skills?: string;
  summary?: string;
  education?: string;
  location?: string;
}

/** One batched request: every open-ended question on the form, answered in one call. */
export interface FormAnswerRequest {
  candidate: FormAnswerCandidate;
  job: { title?: string; company?: string; description?: string };
  questions: Array<{ id: string; question: string; type: 'cover_letter' | 'open_ended'; max_chars: number }>;
}

/**
 * Structured alternative to LlmClient for a server that owns the prompt (the Nomadic AI
 * proxy): the client sends facts and questions, never a prompt. Returns one entry per
 * question id (null = could not answer from the profile), or null when the call failed.
 */
export interface FormAnswerClient {
  answerForm(req: FormAnswerRequest): Promise<Record<string, string | null> | null>;
}

export type AnswerLlm = LlmClient | FormAnswerClient;

export function isFormAnswerClient(llm: AnswerLlm): llm is FormAnswerClient {
  return typeof (llm as FormAnswerClient).answerForm === 'function';
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
