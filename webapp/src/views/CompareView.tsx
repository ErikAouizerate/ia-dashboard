import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";

export function CompareView() {
  const dispatch = useDispatch();
  const { data, loading, error } = useSelector((s: any) => s.compare);
  const sessions = useSelector((s: any) => s.sessions.items);
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  useEffect(() => {
    dispatch({ type: "SESSIONS_LOAD_REQUESTED", payload: { path: "/api/sessions?pageSize=200" } });
  }, [dispatch]);

  const run = () => {
    if (a && b)
      dispatch({
        type: "COMPARE_LOAD_REQUESTED",
        payload: { path: `/api/sessions/compare?a=${a}&b=${b}` },
      });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Comparer deux sessions" />
      <div className="flex flex-wrap gap-2">
        <select
          value={a}
          onChange={(e) => setA(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="">Session A…</option>
          {sessions.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.title} ({s.source})
            </option>
          ))}
        </select>
        <select
          value={b}
          onChange={(e) => setB(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="">Session B…</option>
          {sessions.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.title} ({s.source})
            </option>
          ))}
        </select>
        <button
          onClick={run}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        >
          Comparer
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="font-semibold text-gray-900">{data.a.session.title}</h3>
            <p className="text-sm text-gray-600">
              Coût {data.a.totals.cost.toFixed(4)} · {data.a.totals.llmCalls} appels ·{" "}
              {data.a.totals.toolCalls} outils · {data.a.totals.treeSize} sessions
            </p>
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold text-gray-900">{data.b.session.title}</h3>
            <p className="text-sm text-gray-600">
              Coût {data.b.totals.cost.toFixed(4)} · {data.b.totals.llmCalls} appels ·{" "}
              {data.b.totals.toolCalls} outils · {data.b.totals.treeSize} sessions
            </p>
          </Card>
          <Card className="col-span-2 p-4">
            <h3 className="mb-2 font-semibold text-gray-900">Δ outils (B − A)</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th>Outil</th>
                  <th>A</th>
                  <th>B</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {data.delta.tools.map((t: any) => (
                  <tr key={t.name} className="border-t border-gray-100">
                    <td>{t.name}</td>
                    <td>{t.a}</td>
                    <td>{t.b}</td>
                    <td>{t.delta > 0 ? `+${t.delta}` : t.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
