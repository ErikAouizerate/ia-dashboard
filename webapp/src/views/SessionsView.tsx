import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/store";
import { SessionRow } from "../store/sessions";
import { SessionActions } from "./SessionActions";

function Filters({
  meta,
}: {
  meta: { projects: string[]; models: string[] };
}) {
  const dispatch = useDispatch();
  const [project, setProject] = useState("");
  const [model, setModel] = useState("");
  const [annotated, setAnnotated] = useState("");

  const apply = () => {
    const filters: Record<string, string> = {};
    if (project) filters.project = project;
    if (model) filters.model = model;
    if (annotated) filters.annotated = annotated;
    dispatch({
      type: "SESSIONS_LOAD_REQUESTED",
      payload: {
        path: `/api/sessions?${new URLSearchParams({ page: "1", ...filters }).toString()}`,
        filters,
      },
    });
  };

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <select
        value={project}
        onChange={(e) => setProject(e.target.value)}
        className="rounded border px-2 py-1"
      >
        <option value="">All projects</option>
        {meta.projects.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="rounded border px-2 py-1"
      >
        <option value="">All models</option>
        {meta.models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={annotated}
        onChange={(e) => setAnnotated(e.target.value)}
        className="rounded border px-2 py-1"
      >
        <option value="">Any status</option>
        <option value="yes">Annotated</option>
        <option value="no">Not annotated</option>
      </select>
      <button
        onClick={apply}
        className="rounded bg-blue-600 px-3 py-1 text-white"
      >
        Apply
      </button>
    </div>
  );
}

export function SessionsView() {
  const dispatch = useDispatch();
  const { items, total, page, filters, meta, loading, error } = useSelector(
    (s: RootState) => s.sessions,
  );
  const [selected, setSelected] = useState<SessionRow | null>(null);

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

  const badge = useMemo(
    () => (s: SessionRow) =>
      s.annotated ? (
        <span className="inline-flex items-center gap-1 text-green-700">
          <span className="size-2 rounded-full bg-green-500" />
          annotated
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-gray-400">
          <span className="size-2 rounded-full bg-gray-300" />
          not annotated
        </span>
      ),
    [],
  );

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Sessions</h1>
      <Filters meta={meta} />
      {error && (
        <div className="mb-2 rounded bg-red-100 p-2 text-red-700">{error}</div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th>Title</th>
            <th>Project</th>
            <th>Model</th>
            <th>Cost</th>
            <th>In/Out</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="max-w-xs truncate" title={s.title}>
                {s.title}
              </td>
              <td>{s.projectName}</td>
              <td>{s.model}</td>
              <td>{s.cost.toFixed(2)} €</td>
              <td>
                {s.tokensInput} / {s.tokensOutput}
              </td>
              <td>{badge(s)}</td>
              <td>
                <button
                  onClick={() => setSelected(s)}
                  className="text-blue-600"
                >
                  annotate / link
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-gray-500">
        {total} sessions · page {page}
      </p>
      {loading && <p>Loading…</p>}
      {selected && (
        <SessionActions session={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}