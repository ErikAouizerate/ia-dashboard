import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { sessionDetailReducer, SessionProfile } from "../store/sessionDetail";
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
