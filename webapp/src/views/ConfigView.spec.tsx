import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { configsReducer, ConfigRow, Stat } from "../store/configs";
import { apiMiddleware } from "../store/apiMiddleware";
import { ConfigView } from "./ConfigView";

const stat = (median: number): Stat => ({
  count: 3,
  median,
  p25: median,
  p75: median,
  min: median,
  max: median,
  mean: median,
});

const configRow = (over: Partial<ConfigRow> = {}): ConfigRow => ({
  configId: "cid1",
  configIds: ["cid1"],
  profile: "muse-spark",
  config: null,
  plugins: [],
  skills: [],
  sessions: 3,
  totalCost: 1.5,
  tokensInput: 100,
  tokensOutput: 200,
  bySource: [],
  models: [],
  stats: { cost: stat(0.5), tokensOutput: stat(1000), durationMs: stat(120000) },
  ...over,
});

const json = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
  text: async () => "",
});

function stubConfigs(payload: { items?: ConfigRow[]; fail?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (payload.fail) return { ok: false, status: 500, text: async () => payload.fail };
      return json(payload.items ?? [configRow()]);
    }),
  );
}

function renderView() {
  const actions: any[] = [];
  const store = configureStore({
    reducer: { configs: configsReducer },
    middleware: (gDM) =>
      gDM({ thunk: false, serializableCheck: false })
        .concat(() => (next: any) => (action: any) => {
          actions.push(action);
          return next(action);
        })
        .concat(apiMiddleware),
    preloadedState: {
      configs: { items: [], current: null, loading: false, error: null },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/configs"]}>
        <Routes>
          <Route path="/configs" element={<ConfigView />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store, actions };
}

afterEach(() => vi.unstubAllGlobals());

describe("ConfigView", () => {
  it("loads /api/configs and renders one row per config", async () => {
    stubConfigs({
      items: [configRow(), configRow({ configId: "cid2", configIds: ["cid2"], profile: "default" })],
    });
    const { actions } = renderView();
    expect(await screen.findByText("muse-spark")).toBeTruthy();
    expect(screen.getByText("default")).toBeTruthy();
    const requested = actions.find((a) => a.type === "CONFIGS_LOAD_REQUESTED");
    expect(requested.payload.path).toBe("/api/configs");
  });

  it("labels a config by profile, else by the truncated configId, else 'sans config'", async () => {
    stubConfigs({
      items: [
        configRow({ profile: "muse-spark" }),
        configRow({ configId: "abcdefghijklmnop", configIds: ["abcdefghijklmnop"], profile: null }),
        configRow({ configId: null, configIds: [], profile: null }),
      ],
    });
    renderView();
    expect(
      (await screen.findByRole("link", { name: "muse-spark" })).getAttribute("href"),
    ).toBe("/configs/cid1");
    expect(
      screen.getByRole("link", { name: "abcdefghij" }).getAttribute("href"),
    ).toBe("/configs/abcdefghijklmnop");
    expect(
      screen.getByRole("link", { name: "sans config" }).getAttribute("href"),
    ).toBe("/configs/none");
  });

  it("shows the number of merged ids when a config has more than one", async () => {
    stubConfigs({ items: [configRow({ configIds: ["cid1", "cid1b"] })] });
    renderView();
    expect(await screen.findByText("2 ids")).toBeTruthy();
  });

  it("renders plugins and skills as badges", async () => {
    stubConfigs({ items: [configRow({ plugins: ["guardrails"], skills: ["brainstorming"] })] });
    renderView();
    expect(await screen.findByText("guardrails")).toBeTruthy();
    expect(screen.getByText("brainstorming")).toBeTruthy();
  });

  it("shows the empty state when nothing is captured", async () => {
    stubConfigs({ items: [] });
    renderView();
    expect(await screen.findByText("Aucune config capturée.")).toBeTruthy();
  });

  it("shows the error banner when the request fails", async () => {
    stubConfigs({ fail: "boom" });
    renderView();
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });
});
