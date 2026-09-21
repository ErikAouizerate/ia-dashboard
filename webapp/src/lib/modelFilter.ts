import type { DashboardSummary } from "../store/dashboard";

export function filterHiddenModels(
  summary: DashboardSummary,
  hidden: Set<string>,
): DashboardSummary {
  if (hidden.size === 0) return summary;
  const keep = (model: string) => !hidden.has(model);

  const byModel = summary.byModel.filter((m) => keep(m.model));

  const byProject = summary.byProject
    .map((p) => {
      const models = p.models.filter((m) => keep(m.model));
      return {
        ...p,
        models,
        totalCost: models.reduce((s, m) => s + m.totalCost, 0),
        tokensInput: models.reduce((s, m) => s + m.tokensInput, 0),
        tokensOutput: models.reduce((s, m) => s + m.tokensOutput, 0),
        sessions: models.reduce((s, m) => s + m.sessions, 0),
      };
    })
    .filter((p) => p.models.length > 0);

  const byConfig = summary.byConfig
    .map((c) => {
      const models = c.models.filter((m) => keep(m.model));
      return {
        ...c,
        models,
        totalCost: models.reduce((s, m) => s + m.totalCost, 0),
        tokensInput: models.reduce((s, m) => s + m.tokensInput, 0),
        tokensOutput: models.reduce((s, m) => s + m.tokensOutput, 0),
        sessions: models.reduce((s, m) => s + m.sessions, 0),
      };
    })
    .filter((c) => c.models.length > 0);

  return {
    ...summary,
    totalCost: byModel.reduce((s, m) => s + m.totalCost, 0),
    tokensInput: byModel.reduce((s, m) => s + m.tokensInput, 0),
    tokensOutput: byModel.reduce((s, m) => s + m.tokensOutput, 0),
    sessionCount: byModel.reduce((s, m) => s + m.sessions, 0),
    byModel,
    byProject,
    byConfig,
  };
}
