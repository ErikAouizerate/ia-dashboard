import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { projectsReducer } from "../store/projects";
import { ProjectDetail } from "./ProjectDetail";

function makeStore() {
  return configureStore({
    reducer: { projects: projectsReducer },
    middleware: (gDM) => gDM({ thunk: false, serializableCheck: false }),
    preloadedState: {
      projects: {
        items: [],
        current: {
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
        },
        loading: false,
        error: null,
      },
    },
  });
}

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
});
