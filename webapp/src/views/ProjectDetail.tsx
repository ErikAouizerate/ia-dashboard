import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import { RootState } from "../store/store";
import { SessionRow } from "../store/sessions";
import { ProjectConfigRow } from "../store/projects";
import { configKey, configLabel } from "../store/configs";
import { api } from "../api/client";
import { BarList } from "../components/ui/BarList";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { KpiCard } from "../components/ui/KpiCard";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { formatDuration } from "../lib/format";
import { buildModelColorMap } from "../lib/modelColors";

const PAGE_SIZE = 50;
const NO_CONFIG = { configId: null, profile: null };

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const { current, loading, error } = useSelector((s: RootState) => s.projects);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => {
    if (id) dispatch({ type: "PROJECT_LOAD_REQUESTED", payload: { path: `/api/projects/${id}` } });
  }, [dispatch, id]);

  useEffect(() => {
    if (!id) return;
    setPage(1);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      projectId: id,
      parentOnly: "true",
    }).toString();
    setSessionsLoading(true);
    api
      .sessions(`?${qs}`)
      .then((data) => {
        if (cancelled) return;
        setSessions(data.items);
        setTotal(data.total);
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, page]);

  if (loading && !current)
    return (
      <div className="flex items-center gap-2 p-6 text-gray-500">
        <Spinner /> Chargement…
      </div>
    );
  if (error) return <div className="p-6 text-red-700">{error}</div>;
  if (!current) return <p className="p-6">Projet introuvable</p>;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const colorOf = buildModelColorMap([{ models: current.byModel }]);
  const configs: ProjectConfigRow[] = current.configs ?? [];

  return (
    <div>
      <Link to="/projects" className="text-sm text-blue-600 hover:underline">
        ← Projets
      </Link>
      <PageHeader title={current.name} subtitle={current.directory} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Coût" value={`${current.totalCost.toFixed(2)} €`} />
        <KpiCard label="Sessions" value={String(current.sessionCount)} />
        <KpiCard
          label="Tokens"
          value={(current.tokensInput + current.tokensOutput).toLocaleString()}
        />
        <KpiCard label="Durée" value={formatDuration(current.durationMs)} />
        <KpiCard label="Configs" value={String(configs.filter((c) => c.configId).length)} />
      </div>

      <Card className="mb-4 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Répartition des coûts par config</h3>
        {configs.length === 0 ? (
          <EmptyState message="Aucune config capturée pour ce projet." />
        ) : (
          <BarList
            rows={configs}
            valueOf={(r) => r.totalCost}
            labelOf={(r) => configLabel(r)}
            to={(r) => `/configs/${configKey(r)}`}
            stackOf={(r) =>
              r.models.map((m: ProjectConfigRow["models"][number]) => ({
                value: m.totalCost,
                className: colorOf(m.model),
                title: `${m.model}: ${m.totalCost.toFixed(2)} €`,
              }))
            }
          />
        )}
      </Card>

      <Card className="mb-4 overflow-hidden">
        <h3 className="p-4 pb-2 text-sm font-semibold text-gray-900">Découpage par config</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">Config</th>
              <th className="px-3 py-2">Modèles</th>
              <th className="px-3 py-2 text-right">Sessions</th>
              <th className="px-3 py-2 text-right">Coût</th>
              <th className="px-3 py-2 text-right">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={configKey(c)} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link
                    to={`/configs/${configKey(c)}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {configLabel(c)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {c.models.map((m) => m.model).join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{c.sessions}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.totalCost.toFixed(2)} €</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {(c.tokensInput + c.tokensOutput).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {configs.length === 0 && <EmptyState message="Aucune config capturée pour ce projet." />}
      </Card>

      <Card className="overflow-hidden">
        <h3 className="p-4 pb-2 text-sm font-semibold text-gray-900">
          Sessions <span className="font-normal text-gray-400">({total})</span>
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Config</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">In/Out</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const cfg = s.config ?? NO_CONFIG;
              return (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="max-w-xs truncate px-3 py-2" title={s.title}>
                    {s.title}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{s.source}</td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/configs/${configKey(cfg)}`}
                      className="text-blue-600 hover:underline"
                    >
                      {configLabel(cfg)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{s.model}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {s.timeCreated ? new Date(s.timeCreated).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.cost.toFixed(2)} €</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.tokensInput} / {s.tokensOutput}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sessionsLoading && (
          <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
            <Spinner /> Chargement…
          </div>
        )}
        {!sessionsLoading && sessions.length === 0 && (
          <EmptyState message="Aucune session pour ce projet." />
        )}
      </Card>

      <div className="mt-3 flex items-center gap-3 text-sm text-gray-500">
        <Button onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
          ← Précédent
        </Button>
        <span>
          Page {page} / {totalPages}
        </span>
        <Button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
          Suivant →
        </Button>
      </div>
    </div>
  );
}
