import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { dashboardReducer } from "../store/dashboard";
import { DashboardView } from "./DashboardView";

function makeStore(summary: any, loading = false) {
  return configureStore({
    reducer: { dashboard: dashboardReducer },
    middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }),
    preloadedState: {
      dashboard: {
        periodDays: 7,
        loading,
        error: null,
        summary,
      },
    },
  });
}

const summary = {
  periodDays: 7,
  totalCost: 12.34,
  tokensInput: 1000,
  tokensOutput: 2000,
  sessionCount: 42,
  analysedCount: 10,
  featureCount: 3,
  byProject: [
    {
      id: "p1",
      name: "gateway",
      totalCost: 5,
      sessions: 2,
      tokensInput: 100,
      tokensOutput: 200,
      models: [
        {
          model: "deepseek-v4-flash",
          totalCost: 3,
          tokensInput: 80,
          tokensOutput: 120,
          sessions: 1,
          share: 0.5,
        },
        {
          model: "claude-sonnet",
          totalCost: 2,
          tokensInput: 20,
          tokensOutput: 80,
          sessions: 1,
          share: 0.5,
        },
      ],
    },
  ],
  byModel: [
    {
      model: "deepseek-v4-flash",
      totalCost: 12.34,
      sessions: 42,
      tokensInput: 1000,
      tokensOutput: 2000,
    },
  ],
  byDay: [{ day: "2026-08-27", totalCost: 12.34, sessions: 42 }],
  timeByProject: [
    { directory: "/p/gateway", name: "gateway", durationMs: 5400000, id: "p1" },
  ],
};

describe("DashboardView", () => {
  it("renders KPIs and project list", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore(summary)}>
        <MemoryRouter initialEntries={["/"]}>
          <DashboardView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("12.34 €");
    expect(html).toContain("gateway");
    expect(html).toContain("10 / 3");
  });

  it("renders loading state when no summary yet", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore(null, true)}>
        <MemoryRouter initialEntries={["/"]}>
          <DashboardView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("Chargement");
  });

  it("renders tokens per model with input/output breakdown", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore(summary)}>
        <MemoryRouter initialEntries={["/"]}>
          <DashboardView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("Tokens par modèle");
    expect(html).toContain("deepseek-v4-flash");
    expect(html).toContain("3,000");
  });

  it("renders cost per project stacked by model, tokens per project and time per project", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore(summary)}>
        <MemoryRouter initialEntries={["/"]}>
          <DashboardView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("Coût par projet");
    expect(html).toContain("claude-sonnet"); // segment de modèle dans la barre coût
    expect(html).toContain("Tokens par projet");
    expect(html).toContain("Temps passé par projet");
    expect(html).toContain("1h 30m");
    // Tokens par projet en 2e position, juste après Coût par projet
    expect(html.indexOf("Coût par projet")).toBeLessThan(html.indexOf("Tokens par projet"));
    expect(html.indexOf("Tokens par projet")).toBeLessThan(html.indexOf("Coût par modèle"));
  });
});