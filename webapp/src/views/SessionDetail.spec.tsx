import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { sessionDetailReducer, SessionProfile } from "../store/sessionDetail";
import { apiMiddleware } from "../store/apiMiddleware";
import { SessionDetail } from "./SessionDetail";

const profile: SessionProfile = {
  session: {
    id: "s1",
    title: "Refonte du dashboard",
    source: "host",
    projectName: "gateway",
    directory: "/home/user/gateway",
    model: "deepseek-v4-flash",
    agent: "build",
    cost: 12.5,
    tokensInput: 1000,
    tokensOutput: 200,
    tokensReasoning: 50,
    timeCreated: 1700000000000,
  },
  source: "host",
  profile: "muse-spark",
  configId: "cid1",
  config: { model: "deepseek-v4-flash", agents: { build: {}, plan: {} } },
  offeredTools: ["bash"],
  totals: {
    cost: 12.5,
    tokensInput: 1000,
    tokensOutput: 200,
    tokensReasoning: 50,
    cacheRead: 300,
    cacheWrite: 40,
    llmCalls: 2,
    toolCalls: 3,
    treeSize: 2,
  },
  byModel: [
    {
      model: "deepseek-v4-flash",
      cost: 12.5,
      tokensInput: 1000,
      tokensOutput: 200,
      llmCalls: 2,
    },
  ],
  tools: [{ tool: "bash", count: 3, completed: 2, error: 1 }],
  calls: [
    {
      sessionId: "s1",
      timeCreated: 1700000000000,
      cost: 8,
      tokensInput: 600,
      tokensOutput: 120,
      tokensReasoning: 30,
      cacheRead: 200,
      cacheWrite: 20,
      model: "deepseek-v4-flash",
      agent: "build",
      mode: null,
    },
  ],
  tree: [
    { sessionId: "s1", parentId: null, agent: "build", model: "deepseek-v4-flash", cost: 12.5 },
    { sessionId: "s1-sub", parentId: "s1", agent: "general", model: "m", cost: 0.5 },
  ],
};

function makeStore() {
  return configureStore({
    reducer: { sessionDetail: sessionDetailReducer },
    middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }),
    preloadedState: { sessionDetail: { data: profile, loading: false, error: null } },
  });
}

describe("SessionDetail", () => {
  it("renders totals, tools, models, config, subagents and calls", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore()}>
        <MemoryRouter initialEntries={["/sessions/s1"]}>
          <SessionDetail />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("Refonte du dashboard");
    expect(html).toContain("muse-spark");
    expect(html).toContain("Par modèle");
    expect(html).toContain("Outils utilisés");
    expect(html).toContain("bash");
    expect(html).toContain("Arbre subagents (2)");
    expect(html).toContain("Appels LLM (1)");
    expect(html).toContain("Agents");
    expect(html).toContain("deepseek-v4-flash");
  });
});

afterEach(() => vi.unstubAllGlobals());

function stubProfile(data: unknown, fail?: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (): Promise<any> => {
      if (fail) return { ok: false, status: 500, text: async () => fail };
      return {
        ok: true,
        status: 200,
        json: async () => data,
        text: async () => "",
      };
    }),
  );
}

function renderDetail(id = "s1") {
  const actions: any[] = [];
  const store = configureStore({
    reducer: { sessionDetail: sessionDetailReducer },
    middleware: (gDM) =>
      gDM({ thunk: false, serializableCheck: false })
        .concat(() => (next: any) => (action: any) => {
          actions.push(action);
          return next(action);
        })
        .concat(apiMiddleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/sessions/${id}`]}>
        <Routes>
          <Route path="/sessions/:id" element={<SessionDetail />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store, actions };
}

const kpiValue = (label: string) =>
  screen.getAllByText(label)[0].parentElement?.lastElementChild?.textContent;

describe("SessionDetail — comportement", () => {
  it("déclenche SESSION_DETAIL_LOAD_REQUESTED sur /api/sessions/<id>/profile (F1)", async () => {
    stubProfile(profile);
    const { actions } = renderDetail("s1");
    const req = actions.find((a) => a.type === "SESSION_DETAIL_LOAD_REQUESTED");
    expect(req.payload.path).toBe("/api/sessions/s1/profile");
    expect(await screen.findByText("Refonte du dashboard")).toBeTruthy();
  });

  it("affiche les KPI calculés depuis `totals` (F2)", async () => {
    stubProfile(profile);
    renderDetail();
    await screen.findByText("Refonte du dashboard");
    expect(kpiValue("Coût")).toBe("12.50 €");
    expect(kpiValue("Tokens in")).toBe("1,000");
    expect(kpiValue("Tokens out")).toBe("200");
    expect(kpiValue("Reasoning")).toBe("50");
    expect(kpiValue("Cache read")).toBe("300");
    expect(kpiValue("Cache write")).toBe("40");
    expect(kpiValue("Appels LLM")).toBe("2");
    expect(kpiValue("Appels outils")).toBe("3");
  });

  it("affiche la table par modèle et la table outils (F2)", async () => {
    stubProfile(profile);
    renderDetail();
    await screen.findByText("Refonte du dashboard");
    expect(screen.getByText("Par modèle")).toBeTruthy();
    expect(screen.getAllByText("deepseek-v4-flash").length).toBeGreaterThan(0);
    expect(screen.getByText("Outils utilisés")).toBeTruthy();
    expect(screen.getByText("bash")).toBeTruthy();
  });

  it("affiche l'arbre subagents, les appels LLM et le lien config (D2, F2)", async () => {
    stubProfile(profile);
    renderDetail();
    await screen.findByText("Refonte du dashboard");
    expect(screen.getByRole("link", { name: "muse-spark" }).getAttribute("href")).toBe(
      "/configs/cid1",
    );
    expect(screen.getByText("Arbre subagents (2)")).toBeTruthy();
    expect(screen.getByRole("link", { name: "s1-sub" }).getAttribute("href")).toBe(
      "/sessions/s1-sub",
    );
    expect(screen.getByText("Appels LLM (1)")).toBeTruthy();
    expect(screen.getByText("8.0000 €")).toBeTruthy();
    expect(screen.getByText("200 / 20")).toBeTruthy();
  });

  it("affiche le résumé de config et le JSON repliable (F4)", async () => {
    stubProfile(profile);
    renderDetail();
    await screen.findByText("Refonte du dashboard");
    expect(screen.getByText("JSON")).toBeTruthy();
    expect(document.querySelector("details")).toBeTruthy();
    expect(document.querySelector("pre")?.textContent).toContain('"model"');
  });

  it("affiche le bandeau d'erreur quand la requête échoue", async () => {
    stubProfile(null, "boom");
    renderDetail();
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });
});
