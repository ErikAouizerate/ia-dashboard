import { describe, expect, it } from "vitest";
import { configKey, configLabel, configsReducer, NO_CONFIG_ID } from "./configs";

describe("configsReducer", () => {
  it("sets loading and clears the error on CONFIGS_LOAD_REQUESTED", () => {
    const previous = {
      ...(configsReducer(undefined as any, { type: "INIT" })),
      error: "stale",
    };
    const s = configsReducer(previous, { type: "CONFIGS_LOAD_REQUESTED" });
    expect(s.loading).toBe(true);
    expect(s.error).toBeNull();
  });

  it("sets loading and clears the error on CONFIG_LOAD_REQUESTED", () => {
    const previous = {
      ...(configsReducer(undefined as any, { type: "INIT" })),
      error: "stale",
    };
    const s = configsReducer(previous, { type: "CONFIG_LOAD_REQUESTED" });
    expect(s.loading).toBe(true);
    expect(s.error).toBeNull();
  });

  it("stores items on CONFIGS_LOAD_SUCCESS", () => {
    const s = configsReducer(undefined as any, {
      type: "CONFIGS_LOAD_SUCCESS",
      payload: { data: [{ configId: "cid1" }] },
    });
    expect(s.items).toHaveLength(1);
    expect(s.loading).toBe(false);
  });

  it("stores current on CONFIG_LOAD_SUCCESS", () => {
    const s = configsReducer(undefined as any, {
      type: "CONFIG_LOAD_SUCCESS",
      payload: { data: { configId: "cid1", sessionList: [] } },
    });
    expect(s.current?.configId).toBe("cid1");
    expect(s.loading).toBe(false);
  });

  it("stores the error on CONFIGS_LOAD_ERROR and CONFIG_LOAD_ERROR", () => {
    const list = configsReducer(undefined as any, {
      type: "CONFIGS_LOAD_ERROR",
      payload: { error: new Error("boom") },
    });
    expect(list.error).toContain("boom");
    expect(list.loading).toBe(false);

    const detail = configsReducer(undefined as any, {
      type: "CONFIG_LOAD_ERROR",
      payload: { error: new Error("bang") },
    });
    expect(detail.error).toContain("bang");
    expect(detail.loading).toBe(false);
  });
});

describe("config helpers (B1/B2)", () => {
  it("uses 'none' as the key for the no-config bucket", () => {
    expect(NO_CONFIG_ID).toBe("none");
    expect(configKey({ configId: null })).toBe("none");
    expect(configKey({ configId: "cid1" })).toBe("cid1");
  });

  it("labels a config by its profile first", () => {
    expect(configLabel({ profile: "muse-spark", configId: "cid1" })).toBe("muse-spark");
  });

  it("falls back to the truncated configId", () => {
    expect(configLabel({ profile: null, configId: "abcdefghijklmnop" })).toBe("abcdefghij");
    expect(configLabel({ profile: null, configId: "cid1" })).toBe("cid1");
  });

  it("falls back to 'sans config' when there is no config", () => {
    expect(configLabel({ profile: null, configId: null })).toBe("sans config");
  });
});
