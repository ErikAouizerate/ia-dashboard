import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { projectsReducer } from "../store/projects";
import { ProjectsView } from "./ProjectsView";

function makeStore() {
  return configureStore({
    reducer: { projects: projectsReducer },
    middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }),
    preloadedState: {
      projects: {
        items: [
          {
            id: "p1",
            name: "gateway",
            directory: "/home/user/gateway",
            stale: false,
            firstSeen: "2026-08-01T00:00:00.000Z",
            lastSeen: "2026-08-31T00:00:00.000Z",
            sessionCount: 2,
            totalCost: 5,
            tokensInput: 100,
            tokensOutput: 200,
            durationMs: 5400000,
          },
        ],
        current: null,
        loading: false,
        error: null,
      },
    },
  });
}

describe("ProjectsView", () => {
  it("renders project cards with session count, cost and duration", () => {
    const html = renderToStaticMarkup(
      <Provider store={makeStore()}>
        <MemoryRouter initialEntries={["/projects"]}>
          <ProjectsView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("gateway");
    expect(html).toContain("2 sessions");
    expect(html).toContain("1h 30m");
  });

  it("renders grouped projects with their member directories", () => {
    const store = configureStore({
      reducer: { projects: projectsReducer },
      middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }),
      preloadedState: {
        projects: {
          items: [
            {
              id: "nominal:gateway",
              name: "gateway",
              directory: "/home/user/gateway",
              directories: ["/home/user/gateway", "/home/user/gateway_v2"],
              stale: false,
              firstSeen: "2026-08-01T00:00:00.000Z",
              lastSeen: "2026-08-31T00:00:00.000Z",
              sessionCount: 3,
              totalCost: 8,
              tokensInput: 160,
              tokensOutput: 320,
              durationMs: 9000000,
            },
          ],
          current: null,
          loading: false,
          error: null,
        },
      },
    });
    const html = renderToStaticMarkup(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/projects"]}>
          <ProjectsView />
        </MemoryRouter>
      </Provider>,
    );
    expect(html).toContain("/home/user/gateway");
    expect(html).toContain("/home/user/gateway_v2");
  });
});