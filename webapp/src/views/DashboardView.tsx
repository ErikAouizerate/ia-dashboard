import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store/store";
import { KpiCard } from "../components/ui/KpiCard";
import { BarList } from "../components/ui/BarList";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

export function DashboardView() {
  const dispatch = useDispatch();
  const { summary, periodDays, loading, error } = useSelector(
    (s: RootState) => s.dashboard,
  );
  const [days, setDays] = useState(periodDays);

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
      {summary && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiCard label="Coût total" value={`${summary.totalCost.toFixed(2)} €`} />
            <KpiCard label="Tokens in" value={summary.tokensInput.toLocaleString()} />
            <KpiCard label="Tokens out" value={summary.tokensOutput.toLocaleString()} />
            <KpiCard
              label="Sessions"
              value={String(summary.sessionCount)}
              sub={`${summary.periodDays} jours`}
            />
            <KpiCard
              label="Analysées / Features"
              value={`${summary.analysedCount} / ${summary.featureCount}`}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Coût par projet</h3>
              <BarList
                rows={summary.byProject}
                valueOf={(r) => r.totalCost}
                labelOf={(r) => r.name}
                to={(r) => (r.id ? `/projects/${r.id}` : undefined)}
              />
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Coût par modèle</h3>
              <BarList rows={summary.byModel} valueOf={(r) => r.totalCost} labelOf={(r) => r.model} />
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