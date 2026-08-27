import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiMiddleware } from "./apiMiddleware";
import { configureStore } from "@reduxjs/toolkit";

function makeStore() {
  return configureStore({
    reducer: (s: string[] = [], a: any) => [...s, a.type],
    middleware: (gDM) => gDM({ thunk: false }).concat(apiMiddleware),
  });
}

describe("apiMiddleware", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ n: 1 }) }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("dispatches START then SUCCESS for a REQUESTED action", async () => {
    const store = makeStore();
    store.dispatch({ type: "X_REQUESTED", payload: { path: "/api/x" } });
    await new Promise((r) => setTimeout(r, 10));
    const log = store.getState() as string[];
    expect(log).toContain("X_START");
    expect(log).toContain("X_SUCCESS");
  });

  it("dispatches ERROR when the request fails", async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const store = makeStore();
    store.dispatch({ type: "Y_REQUESTED", payload: { path: "/api/y" } });
    await new Promise((r) => setTimeout(r, 10));
    const log = store.getState() as string[];
    expect(log).toContain("Y_START");
    expect(log).toContain("Y_ERROR");
  });

  it("passes non-REQUESTED actions through unchanged", () => {
    const store = makeStore();
    store.dispatch({ type: "PLAIN" });
    const log = (store.getState() as string[]).filter((t) => !t.startsWith("@@"));
    expect(log).toEqual(["PLAIN"]);
  });
});