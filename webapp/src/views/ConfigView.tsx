import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { RootState } from "../store/store";
import { configKey, configLabel } from "../store/configs";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { formatDuration } from "../lib/format";

const cost = (n: number) => `${n.toFixed(3)} €`;

export function ConfigView() {
  const dispatch = useDispatch();
  const { items, loading, error } = useSelector((s: RootState) => s.configs);

  useEffect(() => {
    dispatch({ type: "CONFIGS_LOAD_REQUESTED", payload: { path: "/api/configs" } });
  }, [dispatch]);

  return (
    <div>
      <PageHeader title="Configs" subtitle={`${items.length} configs`} />
      {error && (
        <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</div>
      )}
      {items.length === 0 && !loading ? (
        <EmptyState message="Aucune config capturée." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Config</th>
                <th className="px-3 py-2">Plugins / skills</th>
                <th className="px-3 py-2 text-right">N</th>
                <th className="px-3 py-2 text-right">Coût médian</th>
                <th className="px-3 py-2 text-right">Coût p25–p75</th>
                <th className="px-3 py-2 text-right">Out médian</th>
                <th className="px-3 py-2 text-right">Durée médiane</th>
                <th className="px-3 py-2 text-right">Coût total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={configKey(c)} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link
                      to={`/configs/${configKey(c)}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {configLabel(c)}
                    </Link>
                    {c.configIds && c.configIds.length > 1 && (
                      <span className="ml-2 text-xs text-gray-400">{c.configIds.length} ids</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex max-w-md flex-wrap gap-1">
                      {(c.plugins ?? []).map((p) => (
                        <Badge key={p} tone="blue">
                          {p}
                        </Badge>
                      ))}
                      {(c.skills ?? []).map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.sessions}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {cost(c.stats.cost.median)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {cost(c.stats.cost.p25)}–{cost(c.stats.cost.p75)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Math.round(c.stats.tokensOutput.median).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatDuration(c.stats.durationMs.median)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {cost(c.totalCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
              <Spinner /> Chargement…
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
