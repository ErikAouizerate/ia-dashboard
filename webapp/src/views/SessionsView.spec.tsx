import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { sessionsReducer, SessionRow } from "../store/sessions";
import { apiMiddleware } from "../store/apiMiddleware";
import { SessionsView } from "./SessionsView";

const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: "s1",
  title: "Fix login",
  projectName: "gateway",
  projectId: "nominal:gateway",
  directory: "/w/gateway",
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

const meta = {
  projects: [{ id: "nominal:gateway", name: "gateway" }],
  models: ["deepseek-v4-flash"],
  sources: ["host"],
  configs: [{ configId: "cid1", profile: "muse-spark" }],
};

const json = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
  text: async () => "",
});

function stubSessions(payload: { items?: SessionRow[]; total?: number; fail?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("/api/sessions/meta")) return json(meta);
      if (payload.fail) return { ok: false, status: 500, text: async () => payload.fail };
      const page = Number(new URL(url, "http://x").searchParams.get("page") ?? 1);
      return json({
        items: payload.items ?? [session()],
        total: payload.total ?? 120,
        page,
        pageSize: 50,
      });
    }),
  );
}

function renderView() {
  const actions: any[] = [];
  const store = configureStore({
    reducer: { sessions: sessionsReducer },
    middleware: (gDM) =>
      gDM({ thunk: false, serializableCheck: false })
        .concat(() => (next: any) => (action: any) => {
          actions.push(action);
          return next(action);
        })
        .concat(apiMiddleware),
    preloadedState: {
      sessions: {
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
        filters: {},
        meta: { projects: [], models: [], sources: [], configs: [] },
        loading: false,
        error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/"]}>
        <SessionsView />
      </MemoryRouter>
    </Provider>,
  );
  return { store, actions };
}

afterEach(() => vi.unstubAllGlobals());

describe("SessionsView", () => {
  it("renders a row with source, model, cost and links title/config to their pages", async () => {
    stubSessions({});
    renderView();
    expect(await screen.findByText("Fix login")).toBeTruthy();
    expect(screen.getAllByText("gateway").length).toBeGreaterThan(0);
    expect(screen.getAllByText("host").length).toBeGreaterThan(0);
    expect(screen.getAllByText("deepseek-v4-flash").length).toBeGreaterThan(0);
    expect(screen.getByText("1.50 €")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Fix login" }).getAttribute("href")).toBe(
      "/sessions/s1",
    );
    expect(screen.getByRole("link", { name: "muse-spark" }).getAttribute("href")).toBe(
      "/configs/cid1",
    );
  });

  it("labels sessions without a config 'sans config' and links to the none bucket", async () => {
    stubSessions({ items: [session({ config: null })] });
    renderView();
    expect(await screen.findByText("sans config")).toBeTruthy();
    expect(screen.getByRole("link", { name: "sans config" }).getAttribute("href")).toBe(
      "/configs/none",
    );
  });

  it("paginates: page 1 disables Précédent, and Suivant moves to page 2 of 3", async () => {
    stubSessions({ total: 120 });
    const { store } = renderView();
    await screen.findByText("Fix login");
    const prev = screen.getByRole("button", { name: /Précédent/ }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: /Suivant/ }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect(screen.getByText(/Page 1 \/ 3/)).toBeTruthy();
    fireEvent.click(next);
    expect(store.getState().sessions.page).toBe(2);
    expect(await screen.findByText(/Page 2 \/ 3/)).toBeTruthy();
  });

  it("applies the parentOnly filter by default and resets to an empty filter", async () => {
    stubSessions({});
    const { actions } = renderView();
    await screen.findByText("Fix login");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const applied = actions.filter((a) => a.type === "SESSIONS_LOAD_REQUESTED").at(-1);
    expect(applied.payload.filters).toMatchObject({ parentOnly: "true" });
    expect(applied.payload.path).toContain("page=1");
    expect(applied.payload.path).toContain("parentOnly=true");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    const reset = actions.filter((a) => a.type === "SESSIONS_LOAD_REQUESTED").at(-1);
    expect(reset.payload.filters).toEqual({});
  });

  it("shows the empty state when nothing matches", async () => {
    stubSessions({ items: [], total: 0 });
    renderView();
    expect(await screen.findByText(/No sessions match/)).toBeTruthy();
  });

  it("shows the error banner when the request fails", async () => {
    stubSessions({ fail: "boom" });
    renderView();
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });
});
