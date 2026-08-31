export interface LlmChatMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export class LlmClient {
  constructor(private readonly opts: LlmClientOptions) {}

  async chatCompletion<T>(messages: LlmChatMessage[]): Promise<T> {
    const url = `${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const body = {
      model: this.opts.model,
      messages,
      response_format: { type: "json_object" as const },
    };
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      let transient = false;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.opts.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (RETRYABLE.has(res.status)) {
          transient = true;
          lastError = new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
        } else if (!res.ok) {
          throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
        } else {
          const data = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const content = data.choices?.[0]?.message?.content ?? "";
          return this.parseJson<T>(content);
        }
      } catch (e) {
        lastError = e;
        const name = (e as { name?: string } | null)?.name;
        transient =
          name === "AbortError" ||
          e instanceof TypeError ||
          (e instanceof Error && /fetch|network|ECONN|ENOTFOUND/i.test(e.message));
      } finally {
        clearTimeout(timer);
      }
      if (!transient) {
        throw lastError ?? new Error("LLM request failed");
      }
      await sleep(1_000 * 2 ** attempt);
    }
    throw new Error(`LLM request failed after retries: ${String(lastError)}`);
  }

  private parseJson<T>(content: string): T {
    try {
      return JSON.parse(content) as T;
    } catch {
      throw new Error(`LLM response not JSON: ${content.slice(0, 200)}`);
    }
  }
}