import type { DashboardSummary } from "../store/dashboard";

export interface FilteredSummary {
  totalCost: number;
  tokensInput: number;
  tokensOutput: number;
  byModel: DashboardSummary["byModel"];
  byProject: DashboardSummary["byProject"];
  byConfig: DashboardSummary["byConfig"];
}

export function filterModels(
  summary: DashboardSummary,
  hidden: Set<string>,
): FilteredSummary {
  const visible = (model: string) => !hidden.has(model);

  const byModel = summary.byModel.filter((m) => visible(m.model));

  const byProject = summary.byProject
    .map((p) => {
      const models = p.models.filter((m) => visible(m.model));
      const totalCost = models.reduce((s, m) => s + m.totalCost, 0);
      return {
        ...p,
        models: models.map((m) => ({
          ...m,
          share: totalCost > 0 ? m.totalCost / totalCost : 0,
        })),
        totalCost,
        tokensInput: models.reduce((s, m) => s + m.tokensInput, 0),
        tokensOutput: models.reduce((s, m) => s + m.tokensOutput, 0),
      };
    })
    .filter((p) => p.models.length > 0);

  const byConfig = summary.byConfig
    .map((c) => {
      const models = c.models.filter((m) => visible(m.model));
      return {
        ...c,
        models,
        totalCost: models.reduce((s, m) => s + m.totalCost, 0),
        tokensInput: models.reduce((s, m) => s + m.tokensInput, 0),
        tokensOutput: models.reduce((s, m) => s + m.tokensOutput, 0),
      };
    })
    .filter((c) => c.models.length > 0);

  const totals = byModel.reduce(
    (a, m) => ({
      totalCost: a.totalCost + m.totalCost,
      tokensInput: a.tokensInput + m.tokensInput,
      tokensOutput: a.tokensOutput + m.tokensOutput,
    }),
    { totalCost: 0, tokensInput: 0, tokensOutput: 0 },
  );

  return { ...totals, byModel, byProject, byConfig };
}
