import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { dashboardReducer } from "../store/dashboard";
import { apiMiddleware } from "../store/apiMiddleware";
import { DashboardView } from "./DashboardView";
import { EXCLUDED_PROJECT_NAMES } from "../lib/excludedProjects";

function makeStore(summary: any, loading = false, periodDays = 7) {
  return configureStore({
    reducer: { dashboard: dashboardReducer },
    middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }),
    preloadedState: {
      dashboard: {
        periodDays,
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
  byConfig: [
    {
      configId: "cid1",
      profile: "muse-spark",
      sessions: 2,
      totalCost: 6,
      tokensInput: 500000,
      tokensOutput: 500000,
      models: [
        {
          model: "deepseek-v4-flash",
          sessions: 2,
          totalCost: 6,
          tokensInput: 500000,
          tokensOutput: 500000,
        },
      ],
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

  it("renders a global model legend and average token cost per config and per model", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore(summary)}>
        <MemoryRouter initialEntries={["/"]}>
          <DashboardView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("Modèles");
    expect(html).toContain("Coût moyen / 1M tokens par config");
    expect(html).toContain("Coût moyen / 1M tokens par modèle");
    expect(html).toContain("muse-spark");
    expect(html).toContain("€/M");
    // C2 : légende globale unique (rendue une seule fois, pas par graphe).
    expect(html.split(">Modèles<").length - 1).toBe(1);
  });

  it("renders a Tout button for the all-time filter", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore(summary)}>
        <MemoryRouter initialEntries={["/"]}>
          <DashboardView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("Tout");
  });

  it("activates the Tout button only when the all-time period is selected", () => {
    const button = (html: string, label: string) =>
      html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0] ?? "";
    const render = (periodDays: number) =>
      renderToStaticMarkup(
        <Provider store={makeStore({ ...summary, periodDays }, false, periodDays)}>
          <MemoryRouter initialEntries={["/"]}>
            <DashboardView />
          </MemoryRouter>
        </Provider>,
      );
    const allTime = render(0);
    expect(button(allTime, "Tout")).toContain("bg-blue-600");
    expect(button(allTime, "7 jours")).toContain("border border-gray-300");
    const lastSevenDays = render(7);
    expect(button(lastSevenDays, "7 jours")).toContain("bg-blue-600");
    expect(button(lastSevenDays, "Tout")).toContain("border border-gray-300");
  });

  it("hides every excluded project from both project lists while KPI stay global", () => {
    const excludedProjects = EXCLUDED_PROJECT_NAMES.map((name) => ({
      id: `nominal:${name}`,
      name,
      totalCost: 1,
      sessions: 1,
      tokensInput: 10,
      tokensOutput: 10,
      models: [],
    }));
    const totalCost = summary.totalCost + excludedProjects.length;
    const withExcluded = {
      ...summary,
      totalCost,
      byProject: [...summary.byProject, ...excludedProjects],
      timeByProject: [
        ...summary.timeByProject,
        ...EXCLUDED_PROJECT_NAMES.map((name) => ({
          directory: `/p/${name}`,
          name,
          durationMs: 60000,
          id: `nominal:${name}`,
        })),
      ],
    };
    const html = renderToStaticMarkup(
      <Provider store={makeStore(withExcluded)}>
        <MemoryRouter initialEntries={["/"]}>
          <DashboardView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("Coût par projet");
    expect(html).toContain("Temps passé par projet");
    expect(html).toContain("gateway");
    for (const name of EXCLUDED_PROJECT_NAMES) {
      expect(html).not.toContain(name);
    }
    // KPI calculés sur tout, y compris les projets exclus (12.34 + 4 x 1).
    expect(html).toContain(`${totalCost.toFixed(2)} €`);
  });

  it("renders Tout as the sessions KPI subtitle when the all-time filter is active", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore({ ...summary, periodDays: 0 }, false, 0)}>
        <MemoryRouter initialEntries={["/"]}>
          <DashboardView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain('<div class="text-sm text-gray-500">Tout</div>');
  });
});

afterEach(() => vi.unstubAllGlobals());

const stubDashboard = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => summary,
      text: async () => "",
    })),
  );

function renderBehavior() {
  const actions: any[] = [];
  const store = configureStore({
    reducer: { dashboard: dashboardReducer },
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
      <MemoryRouter initialEntries={["/"]}>
        <DashboardView />
      </MemoryRouter>
    </Provider>,
  );
  return { store, actions };
}

describe("DashboardView — comportement du filtre de période", () => {
  const lastLoad = (actions: any[]) =>
    actions.filter((a) => a.type === "DASHBOARD_LOAD_REQUESTED").at(-1);

  it("déclenche DASHBOARD_LOAD_REQUESTED avec periodDays 7 puis 30", async () => {
    stubDashboard();
    const { actions } = renderBehavior();
    await screen.findAllByText("12.34 €");
    fireEvent.click(screen.getByRole("button", { name: "7 jours" }));
    expect(lastLoad(actions).payload).toMatchObject({
      periodDays: 7,
      path: "/api/dashboard/summary?periodDays=7",
    });
    fireEvent.click(screen.getByRole("button", { name: "30 jours" }));
    expect(lastLoad(actions).payload.periodDays).toBe(30);
    expect(lastLoad(actions).payload.path).toContain("periodDays=30");
  });

  it("déclenche DASHBOARD_LOAD_REQUESTED avec periodDays 0 pour « Tout »", async () => {
    stubDashboard();
    const { actions } = renderBehavior();
    await screen.findAllByText("12.34 €");
    fireEvent.click(screen.getByRole("button", { name: "Tout" }));
    expect(lastLoad(actions).payload.periodDays).toBe(0);
    expect(lastLoad(actions).payload.path).toContain("periodDays=0");
  });

  it("C1 : la période par défaut est « Tout » (0), non mémorisée", async () => {
    stubDashboard();
    const { store } = renderBehavior();
    await screen.findAllByText("12.34 €");
    expect(store.getState().dashboard.periodDays).toBe(0);
    expect(screen.getByRole("button", { name: "Tout" }).className).toContain("bg-blue-600");
    expect(screen.getByRole("button", { name: "7 jours" }).className).not.toContain(
      "bg-blue-600",
    );
  });
});