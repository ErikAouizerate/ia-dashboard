import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/store";
import { SessionRow } from "../store/sessions";
import { api } from "../api/client";
import { SessionActions } from "./SessionActions";
import { BulkLinkModal } from "./BulkLinkModal";
import { AnalysisBadge } from "../components/ui/AnalysisBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Field";
import { Spinner } from "../components/ui/Spinner";
import {
  allVisibleSelected,
  computeBulkEligibility,
  setSelection,
  someVisibleSelected,
  toggleVisibleSelection,
} from "../lib/selection";

function Filters({
  meta,
}: {
  meta: { projects: { id: string; name: string }[]; models: string[] };
}) {
  const dispatch = useDispatch();
  const [project, setProject] = useState("");
  const [model, setModel] = useState("");
  const [analysed, setAnalysed] = useState("");
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
    setAnalysed("");
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
        <Select
          className="w-44"
          value={analysed}
          onChange={(e) => setAnalysed(e.target.value)}
        >
          <option value="">Any analysis</option>
          <option value="yes">Analysée</option>
          <option value="no">Non analysée</option>
          <option value="pending">En attente</option>
          <option value="error">Erreur</option>
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
                analysed,
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

const badgeFor = (s: SessionRow) =>
  s.annotated ? <Badge tone="green">annotated</Badge> : <Badge tone="gray">not annotated</Badge>;

export function SessionsView() {
  const dispatch = useDispatch();
  const { items, total, page, filters, meta, loading, error } = useSelector(
    (s: RootState) => s.sessions,
  );
  const [selected, setSelected] = useState<Map<string, boolean>>(new Map());
  const [single, setSingle] = useState<SessionRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

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
  const { eligible, skipped } = computeBulkEligibility(selected);
  const suggestedName = useMemo(() => {
    const first = items.find((s) => selected.has(s.id));
    return first ? first.title : "";
  }, [items, selected]);

  const reload = () =>
    dispatch({
      type: "SESSIONS_LOAD_REQUESTED",
      payload: {
        path: `/api/sessions?${new URLSearchParams({ page: String(page), ...filters }).toString()}`,
        filters,
      },
    });

  const runAnalysis = async (s: SessionRow) => {
    await api.runAnalysis(s.id);
    reload();
  };

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
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <AnalysisBadge status={s.analysedStatus} />
                    {s.annotated && badgeFor(s)}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {s.analysedStatus !== "done" && !s.isSubagent && (
                      <Button variant="ghost" onClick={() => runAnalysis(s)}>
                        analyser
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => setSingle(s)}>
                      annotate / link
                    </Button>
                  </div>
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

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
            <span className="text-sm text-gray-700">
              <b>{eligible.length}</b> session(s) selected
              {skipped > 0 ? ` · ${skipped} already linked (skipped)` : ""}
            </span>
            <div className="flex gap-2">
              <Button onClick={() => setSelected(new Map())}>Clear</Button>
              <Button variant="primary" onClick={() => setBulkOpen(true)} disabled={eligible.length === 0}>
                Annotate / Link
              </Button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <BulkLinkModal
          sessionIds={eligible}
          alreadyLinked={skipped}
          suggestedName={suggestedName}
          meta={meta}
          onClose={() => setBulkOpen(false)}
          onLinked={() => {
            setBulkOpen(false);
            setSelected(new Map());
            reload();
          }}
        />
      )}
    </div>
  );
}