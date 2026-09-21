import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  configsReducer,
  ConfigDetailData,
  ConfigSession,
  Stat,
} from "../store/configs";
import { apiMiddleware } from "../store/apiMiddleware";
import { ConfigDetail } from "./ConfigDetail";
import { formatDuration } from "../lib/format";

const stat = (median: number): Stat => ({
  count: 3,
  median,
  p25: median,
  p75: median,
  min: median,
  max: median,
  mean: median,
});

const session = (over: Partial<ConfigSession> = {}): ConfigSession => ({
  id: "s1",
  title: "Fix login",
  source: "host",
  model: "deepseek-v4-flash",
  cost: 0.5,
  tokensInput: 10,
  tokensOutput: 20,
  tokensReasoning: 0,
  cacheRead: 0,
  timeCreated: 1750000000000,
  timeUpdated: 1750000060000,
  projectName: "gateway",
  ...over,
});

const detail = (over: Partial<ConfigDetailData> = {}): ConfigDetailData => ({
  configId: "cid1",
  configIds: ["cid1"],
  profile: "muse-spark",
  config: { model: "deepseek-v4-flash" },
  plugins: ["guardrails"],
  skills: ["brainstorming"],
  sessions: 42,
  totalCost: 3.5,
  tokensInput: 1000,
  tokensOutput: 2000,
  bySource: [],
  models: [
    {
      model: "deepseek-v4-flash",
      sessions: 7,
      totalCost: 3.5,
      tokensInput: 1000,
      tokensOutput: 2000,
    },
  ],
  stats: { cost: stat(0.123), tokensOutput: stat(1234), durationMs: stat(120000) },
  sessionList: [session()],
  ...over,
});

const json = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
  text: async () => "",
});

function stubConfig(payload: { data?: ConfigDetailData | null; fail?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (payload.fail) return { ok: false, status: 500, text: async () => payload.fail };
      return json(payload.data === undefined ? detail() : payload.data);
    }),
  );
}

function renderDetail(entry = "/configs/cid1") {
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
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/configs/:id" element={<ConfigDetail />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store, actions };
}

afterEach(() => vi.unstubAllGlobals());

describe("ConfigDetail", () => {
  it("requests the encoded detail URL and renders the title and subtitle", async () => {
    stubConfig({ data: detail({ configId: "a b", profile: "muse-spark" }) });
    const { actions } = renderDetail("/configs/a%20b");
    const requested = actions.find((a) => a.type === "CONFIG_LOAD_REQUESTED");
    expect(requested.payload.path).toBe("/api/configs/a%20b");
    expect(await screen.findByRole("heading", { name: "muse-spark" })).toBeTruthy();
    expect(screen.getByText("a b")).toBeTruthy();
  });

  it("falls back to 'sans config' / 'aucune config capturée pour ces sessions'", async () => {
    stubConfig({ data: detail({ configId: null, profile: null }) });
    renderDetail("/configs/none");
    expect(await screen.findByRole("heading", { name: "sans config" })).toBeTruthy();
    expect(screen.getByText("aucune config capturée pour ces sessions")).toBeTruthy();
  });

  it("renders the KPI cards from stats", async () => {
    stubConfig({ data: detail() });
    renderDetail();
    expect(await screen.findByText("Coût médian")).toBeTruthy();
    expect(screen.getByText("Out médian")).toBeTruthy();
    expect(screen.getByText("Durée médiane")).toBeTruthy();
    expect(screen.getByText("0.123 €")).toBeTruthy();
    expect(screen.getByText(Math.round(1234).toLocaleString())).toBeTruthy();
    expect(screen.getByText(formatDuration(120000))).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("renders the models table and the JSON in a details element", async () => {
    stubConfig({ data: detail() });
    renderDetail();
    expect(await screen.findByText("Modèles")).toBeTruthy();
    expect(screen.getAllByText("deepseek-v4-flash").length).toBeGreaterThan(0);
    expect(screen.getByText("JSON")).toBeTruthy();
    expect(document.querySelector("details")).not.toBeNull();
  });

  it("shows the missing-JSON message when no config was captured", async () => {
    stubConfig({ data: detail({ config: null }) });
    renderDetail();
    expect(await screen.findByText("Aucune config JSON capturée.")).toBeTruthy();
    expect(document.querySelector("details")).toBeNull();
  });

  it("lists the sessions with a link to the session detail", async () => {
    stubConfig({ data: detail() });
    renderDetail();
    expect(
      (await screen.findByRole("link", { name: "Fix login" })).getAttribute("href"),
    ).toBe("/sessions/s1");
    expect(screen.getAllByText("gateway").length).toBeGreaterThan(0);
    expect(screen.getAllByText("host").length).toBeGreaterThan(0);
  });

  it("shows 'Config introuvable' when the bucket is empty", async () => {
    stubConfig({ data: null });
    renderDetail();
    expect(await screen.findByText("Config introuvable")).toBeTruthy();
  });

  it("shows the error banner when the request fails", async () => {
    stubConfig({ fail: "boom" });
    renderDetail();
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });
});
