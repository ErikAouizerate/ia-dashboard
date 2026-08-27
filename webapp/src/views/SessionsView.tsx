import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/store";
import { SessionRow } from "../store/sessions";
import { SessionActions } from "./SessionActions";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Field";
import { Spinner } from "../components/ui/Spinner";
import {
  allVisibleSelected,
  setSelection,
  someVisibleSelected,
  toggleVisibleSelection,
} from "../lib/selection";

function Filters({
  meta,
}: {
  meta: { projects: string[]; models: string[] };
}) {
  const dispatch = useDispatch();
  const [project, setProject] = useState("");
  const [model, setModel] = useState("");
  const [annotated, setAnnotated] = useState("");

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
    setAnnotated("");
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
            <option key={p} value={p}>
              {p}
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
        <Select
          className="w-44"
          value={annotated}
          onChange={(e) => setAnnotated(e.target.value)}
        >
          <option value="">Any status</option>
          <option value="yes">Annotated</option>
          <option value="no">Not annotated</option>
        </Select>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => apply({ project, model, annotated })}>
            Apply
          </Button>
          <Button onClick={reset}>Reset</Button>
        </div>
      </div>
    </Card>
  );
}

const badgeFor = (s: SessionRow) =>
  s.annotated ? <Badge tone="green">annotated</Badge> : <Badge tone="gray">not annotated</Badge>;

export function SessionsView() {
  const dispatch = useDispatch();
  const { items, total, page, filters, meta, loading, error } = useSelector(
    (s: RootState) => s.sessions,
  );
  const [selected, setSelected] = useState<Map<string, boolean>>(new Map());
  const [single, setSingle] = useState<SessionRow | null>(null);

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

  const onToggle = (s: SessionRow, checked: boolean) =>
    setSelected((prev) => setSelection(prev, { id: s.id, annotated: s.annotated }, checked));

  const allSel = allVisibleSelected(selected, items);
  const someSel = someVisibleSelected(selected, items);

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
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSel}
                  aria-label="Select all on page"
                  ref={(el) => {
                    if (el) el.indeterminate = someSel && !allSel;
                  }}
                  onChange={() => setSelected((prev) => toggleVisibleSelection(prev, items))}
                />
              </th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">In/Out</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={(e) => onToggle(s, e.target.checked)}
                  />
                </td>
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
                <td className="px-3 py-2">{badgeFor(s)}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" onClick={() => setSingle(s)}>
                    annotate / link
                  </Button>
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

      {single && <SessionActions session={single} onClose={() => setSingle(null)} />}
    </div>
  );
}