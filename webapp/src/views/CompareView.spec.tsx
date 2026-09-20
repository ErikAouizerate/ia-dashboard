import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { CompareView } from "./CompareView";
import { compareReducer } from "../store/compare";

function renderWith(data: any) {
  const store = configureStore({
    reducer: {
      compare: compareReducer,
      sessions: (s: any = { items: [], meta: { projects: [], models: [] } }) => s,
    },
    middleware: (g) => g({ thunk: false, serializableCheck: false }),
  });
  store.dispatch({ type: "COMPARE_LOAD_SUCCESS", payload: { data } });
  return renderToStaticMarkup(
    <Provider store={store}>
      <CompareView />
    </Provider>,
  );
}

describe("CompareView", () => {
  it("renders both session titles and the tool delta", () => {
    const html = renderWith({
      a: { session: { id: "a", title: "Session A" }, totals: { cost: 1, llmCalls: 2, toolCalls: 3, treeSize: 1 } },
      b: { session: { id: "b", title: "Session B" }, totals: { cost: 2, llmCalls: 4, toolCalls: 5, treeSize: 1 } },
      delta: {
        cost: 1,
        llmCalls: 2,
        toolCalls: 2,
        offeredOnlyA: [],
        offeredOnlyB: [],
        tools: [{ name: "bash", a: 1, b: 3, delta: 2 }],
      },
    });
    expect(html).toContain("Session A");
    expect(html).toContain("Session B");
    expect(html).toContain("bash");
  });
});
