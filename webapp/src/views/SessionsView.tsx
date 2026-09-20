import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/store";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Field";
import { Spinner } from "../components/ui/Spinner";

function Filters({
  meta,
}: {
  meta: { projects: { id: string; name: string }[]; models: string[] };
}) {
  const dispatch = useDispatch();
  const [project, setProject] = useState("");
  const [model, setModel] = useState("");
  const [hideSubagents, setHideSubagents] = useState(true);

  const apply = (f: Record<string, string>) => {
    dispatch({
      type: "SESSIONS_LOAD_REQUESTED",
      payload: {
        path: `/api/sessions?${new URLSearchParams({ page: "1", ...f }).toString()}`,
        filters: f,
      },
    });
  };

  const reset = () => {
    setProject("");
    setModel("");
    setHideSubagents(true);
    apply({});
  };

  return (
    <Card className="mb-4 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          className="w-44"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All projects</option>
          {meta.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          className="w-44"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="">All models</option>
          {meta.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={hideSubagents}
            onChange={(e) => setHideSubagents(e.target.checked)}
          />
          Cacher subagents
        </label>
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() =>
              apply({
                projectId: project,
                model,
                parentOnly: hideSubagents ? "true" : "",
              })
            }
          >
            Apply
          </Button>
          <Button onClick={reset}>Reset</Button>
        </div>
      </div>
    </Card>
  );
}

export function SessionsView() {
  const dispatch = useDispatch();
  const { items, total, page, filters, meta, loading, error } = useSelector(
    (s: RootState) => s.sessions,
  );

  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page), ...filters }).toString();
    dispatch({
      type: "SESSIONS_LOAD_REQUESTED",
      payload: { path: `/api/sessions?${qs}`, filters },
    });
  }, [dispatch, page, filters]);

  useEffect(() => {
    dispatch({ type: "META_LOAD_REQUESTED", payload: { path: "/api/sessions/meta" } });
  }, [dispatch]);

  return (
    <div>
      <PageHeader title="Sessions" subtitle={`${total} sessions`} />
      <Filters meta={meta} />
      {error && (
        <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>
      )}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">In/Out</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="max-w-xs truncate px-3 py-2" title={s.title}>
                  {s.title}
                </td>
                <td className="px-3 py-2">{s.projectName}</td>
                <td className="px-3 py-2">{s.model}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {s.timeCreated ? new Date(s.timeCreated).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.cost.toFixed(2)} €</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {s.tokensInput} / {s.tokensOutput}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && (
          <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
            <Spinner /> Loading…
          </div>
        )}
        {!loading && items.length === 0 && (
          <EmptyState message="No sessions match the current filters." />
        )}
      </Card>
      <p className="mt-3 text-sm text-gray-500">Page {page}</p>
    </div>
  );
}
