import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/store";
import { KpiCard } from "../components/ui/KpiCard";
import { BarList } from "../components/ui/BarList";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { formatDuration, avgCostPerMillion } from "../lib/format";
import { buildModelColorMap } from "../lib/modelColors";
import { filterModels } from "../lib/modelFilter";
import { configKey, configLabel } from "../store/configs";
import { isExcludedProject } from "../lib/excludedProjects";

export function DashboardView() {
  const dispatch = useDispatch();
  const { summary, periodDays, loading, error } = useSelector(
    (s: RootState) => s.dashboard,
  );
  const [days, setDays] = useState(periodDays);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const colorOf = summary
    ? buildModelColorMap([{ models: summary.byModel }])
    : () => "";
  const view = summary ? filterModels(summary, hidden) : null;
  const visibleByProject = view
    ? view.byProject.filter((r) => !isExcludedProject(r.name))
    : [];
  const visibleTimeByProject = summary
    ? summary.timeByProject.filter((r) => !isExcludedProject(r.name))
    : [];

  const toggleModel = (model: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });

  const load = (d: number) => {
    setDays(d);
    dispatch({
      type: "DASHBOARD_LOAD_REQUESTED",
      payload: {
        path: `/api/dashboard/summary?periodDays=${d}`,
        periodDays: d,
      },
    });
  };

  useEffect(() => {
    load(periodDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Coûts & tokens OpenCode" />
      <div className="mb-4 flex gap-2">
        <Button
          variant={days === 0 ? "primary" : "secondary"}
          onClick={() => load(0)}
        >
          Tout
        </Button>
        <Button
          variant={days === 7 ? "primary" : "secondary"}
          onClick={() => load(7)}
        >
          7 jours
        </Button>
        <Button
          variant={days === 30 ? "primary" : "secondary"}
          onClick={() => load(30)}
        >
          30 jours
        </Button>
      </div>
      {error && (
        <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading && !summary && <p className="text-sm text-gray-500">Chargement…</p>}
      {summary && view && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Coût total" value={`${view.totalCost.toFixed(2)} €`} />
            <KpiCard label="Tokens in" value={view.tokensInput.toLocaleString()} />
            <KpiCard label="Tokens out" value={view.tokensOutput.toLocaleString()} />
            <KpiCard
              label="Sessions"
              value={String(summary.sessionCount)}
              sub={days === 0 ? "Tout" : `${summary.periodDays} jours`}
            />
          </div>
          {summary.byModel.length > 0 && (
            <Card className="mb-4 p-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
                <span className="font-semibold text-gray-900">Modèles</span>
                {summary.byModel.map((m) => {
                  const off = hidden.has(m.model);
                  return (
                    <button
                      key={m.model}
                      type="button"
                      onClick={() => toggleModel(m.model)}
                      title={off ? "Afficher ce modèle" : "Masquer ce modèle"}
                      className={`flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-gray-100 ${
                        off ? "opacity-40 line-through" : ""
                      }`}
                    >
                      <span className={`inline-block h-3 w-3 rounded-sm ${colorOf(m.model)}`} />
                      {m.model}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Coût par projet</h3>
              <BarList
                rows={visibleByProject}
                valueOf={(r) => r.totalCost}
                labelOf={(r) => r.name}
                to={(r) => (r.id ? `/projects/${r.id}` : undefined)}
                stackOf={(r) =>
                  r.models.map((m: any) => ({
                    value: m.totalCost,
                    className: colorOf(m.model),
                    title: `${m.model}: ${m.totalCost.toFixed(2)} € (${Math.round(m.share * 100)}%)`,
                  }))
                }
              />
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Tokens par projet</h3>
              <BarList
                rows={visibleByProject}
                valueOf={(r) => r.tokensInput + r.tokensOutput}
                labelOf={(r) => r.name}
                to={(r) => (r.id ? `/projects/${r.id}` : undefined)}
                valueSuffix=""
                formatValue={(n) => n.toLocaleString()}
                stackOf={(r) =>
                  r.models.map((m: any) => ({
                    value: m.tokensInput + m.tokensOutput,
                    className: colorOf(m.model),
                    title: `${m.model}: ${(m.tokensInput + m.tokensOutput).toLocaleString()} tok`,
                  }))
                }
              />
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Coût par modèle</h3>
              <BarList
                rows={view.byModel}
                valueOf={(r) => r.totalCost}
                labelOf={(r) => r.model}
                stackOf={(r) => [
                  { value: r.totalCost, className: colorOf(r.model), title: `${r.model}: ${r.totalCost.toFixed(2)} €` },
                ]}
              />
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Tokens par modèle</h3>
              <BarList
                rows={view.byModel}
                valueOf={(r) => r.tokensInput + r.tokensOutput}
                labelOf={(r) => r.model}
                valueSuffix=""
                formatValue={(n) => n.toLocaleString()}
                stackOf={(r) => [
                  {
                    value: r.tokensInput,
                    className: colorOf(r.model),
                    title: `${r.model} in: ${r.tokensInput.toLocaleString()} tok`,
                  },
                  {
                    value: r.tokensOutput,
                    className: `${colorOf(r.model)} opacity-50`,
                    title: `${r.model} out: ${r.tokensOutput.toLocaleString()} tok`,
                  },
                ]}
              />
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Coût moyen / 1M tokens par config</h3>
              <BarList
                rows={view.byConfig}
                valueOf={(r) => avgCostPerMillion(r.totalCost, r.tokensInput + r.tokensOutput)}
                labelOf={(r) => configLabel(r)}
                to={(r) => `/configs/${configKey(r)}`}
                valueSuffix="€/M"
                stackOf={(r) => {
                  const tokens = r.tokensInput + r.tokensOutput;
                  const avg = avgCostPerMillion(r.totalCost, tokens);
                  return r.models.map((m: any) => {
                    const mt = m.tokensInput + m.tokensOutput;
                    return {
                      value: tokens > 0 ? avg * (mt / tokens) : 0,
                      className: colorOf(m.model),
                      title: `${m.model}: ${avgCostPerMillion(m.totalCost, mt).toFixed(2)} €/M`,
                    };
                  });
                }}
              />
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Coût moyen / 1M tokens par modèle</h3>
              <BarList
                rows={view.byModel}
                valueOf={(r) => avgCostPerMillion(r.totalCost, r.tokensInput + r.tokensOutput)}
                labelOf={(r) => r.model}
                valueSuffix="€/M"
                stackOf={(r) => [
                  {
                    value: avgCostPerMillion(r.totalCost, r.tokensInput + r.tokensOutput),
                    className: colorOf(r.model),
                    title: `${r.model}: ${avgCostPerMillion(r.totalCost, r.tokensInput + r.tokensOutput).toFixed(2)} €/M`,
                  },
                ]}
              />
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Temps passé par projet</h3>
              <BarList
                rows={visibleTimeByProject}
                valueOf={(r) => r.durationMs}
                labelOf={(r) => r.name}
                to={(r) => (r.id ? `/projects/${r.id}` : undefined)}
                valueSuffix=""
                formatValue={(n) => formatDuration(n)}
              />
            </Card>
          </div>
          <Card className="mt-4 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Sessions par jour</h3>
            <div className="flex items-end gap-1">
              {summary.byDay.map((d) => (
                <div key={d.day} className="flex-1 text-center" title={`${d.day}: ${d.sessions}`}>
                  <div className="text-[10px] text-gray-500">{d.sessions}</div>
                  <div
                    className="mx-auto w-full rounded-t bg-blue-400"
                    style={{ height: `${Math.max(2, d.sessions * 6)}px` }}
                  />
                  <div className="mt-1 text-[10px] text-gray-400">{d.day.slice(8)}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}