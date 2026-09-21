import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { projectsReducer, ProjectDetail as ProjectDetailData } from "../store/projects";
import { SessionRow } from "../store/sessions";
import { api } from "../api/client";
import { ProjectDetail } from "./ProjectDetail";

vi.mock("../api/client", () => ({ api: { sessions: vi.fn() } }));

const sessionsMock = vi.mocked(api.sessions);

const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: "s1",
  title: "Fix login",
  projectName: "gateway",
  projectId: "p1",
  directory: "/home/user/gateway",
  source: "host",
  config: { profile: "muse-spark", configId: "cid1" },
  isSubagent: false,
  model: "deepseek-v4-flash",
  agent: "build",
  cost: 1.5,
  tokensInput: 10,
  tokensOutput: 20,
  timeCreated: 1750000000000,
  ...over,
});

const project = (over: Partial<ProjectDetailData> = {}): ProjectDetailData => ({
  id: "p1",
  name: "gateway",
  directory: "/home/user/gateway",
  directories: ["/home/user/gateway"],
  stale: false,
  firstSeen: "2026-08-01T00:00:00.000Z",
  lastSeen: "2026-08-31T00:00:00.000Z",
  sessionCount: 3,
  totalCost: 8,
  tokensInput: 16,
  tokensOutput: 32,
  durationMs: 5400000,
  byModel: [{ model: "deepseek-v4-flash", totalCost: 8, sessions: 3 }],
  configs: [
    {
      configId: "cid1",
      profile: "muse-spark",
      sessions: 2,
      totalCost: 5,
      tokensInput: 10,
      tokensOutput: 20,
      models: [
        {
          model: "deepseek-v4-flash",
          sessions: 2,
          totalCost: 5,
          tokensInput: 10,
          tokensOutput: 20,
        },
      ],
    },
    {
      configId: null,
      profile: null,
      sessions: 1,
      totalCost: 3,
      tokensInput: 6,
      tokensOutput: 12,
      models: [
        {
          model: "deepseek-v4-flash",
          sessions: 1,
          totalCost: 3,
          tokensInput: 6,
          tokensOutput: 12,
        },
      ],
    },
  ],
  ...over,
});

function makeStore(over: any = {}) {
  return configureStore({
    reducer: { projects: projectsReducer },
    middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }),
    preloadedState: {
      projects: { items: [], current: project(), loading: false, error: null, ...over },
    },
  });
}

function renderProject(over: any = {}) {
  return render(
    <Provider store={makeStore(over)}>
      <MemoryRouter initialEntries={["/projects/p1"]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  sessionsMock.mockReset();
  sessionsMock.mockResolvedValue({ items: [session()], total: 1 });
});

describe("ProjectDetail", () => {
  it("renders the project KPIs and config breakdown", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore()}>
        <MemoryRouter initialEntries={["/projects/p1"]}>
          <ProjectDetail />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("gateway");
    expect(html).toContain("Configs");
    expect(html).toContain("Découpage par config");
    expect(html).toContain("Répartition des coûts par config");
    expect(html).toContain("muse-spark");
    expect(html).toContain("sans config");
    expect(html).toContain("1h 30m");
  });

  it("computes project KPIs, counting only configs with a configId (E3)", async () => {
    const { container } = renderProject();
    await screen.findByText("Fix login");
    const grid = container.querySelector(".grid") as HTMLElement;
    const kpi = (label: string) => within(grid).getByText(label).parentElement?.textContent ?? "";
    expect(kpi("Coût")).toBe("Coût8.00 €");
    expect(kpi("Sessions")).toBe("Sessions3");
    expect(kpi("Tokens")).toBe("Tokens48");
    expect(kpi("Durée")).toBe("Durée1h 30m");
    expect(kpi("Configs")).toBe("Configs1");
  });

  it("renders one breakdown row per config, joining models and linking to /configs/<key>", async () => {
    renderProject();
    await screen.findByText("Découpage par config");
    const card = screen.getByText("Découpage par config").closest("div") as HTMLElement;
    expect(within(card).getAllByRole("link", { name: "muse-spark" })[0].getAttribute("href")).toBe(
      "/configs/cid1",
    );
    expect(
      within(card).getAllByRole("link", { name: "sans config" })[0].getAttribute("href"),
    ).toBe("/configs/none");
    expect(within(card).getAllByText("deepseek-v4-flash")).toHaveLength(2);
  });

  it("joins several models with ', ' and shows an em dash when there is none (E2)", async () => {
    const base = {
      configId: "cid1",
      profile: "muse-spark",
      sessions: 1,
      totalCost: 1,
      tokensInput: 1,
      tokensOutput: 1,
    };
    renderProject({
      current: project({
        configs: [
          {
            ...base,
            models: [
              { model: "model-a", totalCost: 1, sessions: 1, tokensInput: 1, tokensOutput: 1 },
              { model: "model-b", totalCost: 1, sessions: 1, tokensInput: 1, tokensOutput: 1 },
            ],
          },
          { ...base, configId: "cid2", profile: null, models: [] },
        ],
      }),
    });
    await screen.findByText("Découpage par config");
    const card = screen.getByText("Découpage par config").closest("div") as HTMLElement;
    expect(within(card).getByText("model-a, model-b")).toBeTruthy();
    expect(within(card).getByText("—")).toBeTruthy();
  });

  it("fetches project sessions with parentOnly, pageSize 50 and shows the total", async () => {
    sessionsMock.mockResolvedValue({ items: [session()], total: 120 });
    renderProject();
    await screen.findByText("Fix login");
    const params = new URLSearchParams(sessionsMock.mock.calls[0][0] as string);
    expect(params.get("projectId")).toBe("p1");
    expect(params.get("parentOnly")).toBe("true");
    expect(params.get("pageSize")).toBe("50");
    expect(params.get("page")).toBe("1");
    expect(screen.getByText(/\(120\)/)).toBeTruthy();
  });

  it("paginates: Précédent disabled on page 1, Suivant refetches page 2 (D3)", async () => {
    sessionsMock.mockResolvedValue({ items: [session()], total: 120 });
    renderProject();
    await screen.findByText("Fix login");
    const prev = screen.getByRole("button", { name: /Précédent/ }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: /Suivant/ }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect(screen.getByText(/Page 1 \/ 3/)).toBeTruthy();
    fireEvent.click(next);
    expect(await screen.findByText(/Page 2 \/ 3/)).toBeTruthy();
    const last = sessionsMock.mock.calls.at(-1)!;
    const params = new URLSearchParams(last[0] as string);
    expect(params.get("page")).toBe("2");
  });

  it("disables Suivant when the only page is the last one", async () => {
    sessionsMock.mockResolvedValue({ items: [session()], total: 40 });
    renderProject();
    await screen.findByText("Fix login");
    const next = screen.getByRole("button", { name: /Suivant/ }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(screen.getByText(/Page 1 \/ 1/)).toBeTruthy();
  });

  it("shows 'Projet introuvable' when there is no current project", () => {
    render(
      <Provider store={makeStore({ current: null })}>
        <MemoryRouter initialEntries={["/"]}>
          <ProjectDetail />
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText("Projet introuvable")).toBeTruthy();
  });

  it("shows the error banner when the project request fails", () => {
    render(
      <Provider store={makeStore({ current: null, error: "boom" })}>
        <MemoryRouter initialEntries={["/"]}>
          <ProjectDetail />
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("shows the empty states when there is no session and no config", async () => {
    sessionsMock.mockResolvedValue({ items: [], total: 0 });
    renderProject({ current: project({ configs: [] }) });
    expect(await screen.findByText("Aucune session pour ce projet.")).toBeTruthy();
    expect(
      screen.getAllByText("Aucune config capturée pour ce projet.").length,
    ).toBeGreaterThan(0);
  });
});
