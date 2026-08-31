import { LlmClient } from "./llm-client";

function mockFetch(body: unknown, status = 200) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("LlmClient", () => {
  const client = new LlmClient({
    baseUrl: "https://opencode.ai/zen/v1",
    apiKey: "test-key",
    model: "deepseek-v4-flash",
  });

  afterEach(() => jest.restoreAllMocks());

  it("posts chat completions with bearer auth and json_object format", async () => {
    const fetch = mockFetch({ choices: [{ message: { content: '{"ok":1}' } }] });
    const out = await client.chatCompletion<{ ok: number }>([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
    expect(out).toEqual({ ok: 1 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://opencode.ai/zen/v1/chat/completions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer test-key",
    });
  });

  it("retries on HTTP 429 then succeeds", async () => {
    const fetch = mockFetch({ choices: [{ message: { content: '{"ok":2}' } }] }, 429);
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({}),
        text: async () => "rate limited",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"ok":2}' } }] }),
        text: async () => '{"ok":2}',
      });
    const out = await client.chatCompletion<{ ok: number }>([
      { role: "user", content: "x" },
    ]);
    expect(out).toEqual({ ok: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws when the response is not valid JSON", async () => {
    mockFetch({ choices: [{ message: { content: "not json" } }] });
    await expect(
      client.chatCompletion([{ role: "user", content: "x" }]),
    ).rejects.toThrow(/JSON/i);
  });
});