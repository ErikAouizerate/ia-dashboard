export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as T;
}

export const api = {
  sessions: (qs: string) => apiFetch<any>(`/api/sessions${qs}`),
  session: (id: string) => apiFetch<any>(`/api/sessions/${id}`),
  meta: () => apiFetch<any>(`/api/sessions/meta`),
  compare: (a: string, b: string) =>
    apiFetch<any>(`/api/sessions/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  features: () => apiFetch<any>(`/api/features`),
  feature: (id: string) => apiFetch<any>(`/api/features/${id}`),
  createFeature: (body: unknown) =>
    apiFetch<any>(`/api/features`, { method: "POST", body: JSON.stringify(body) }),
  updateFeature: (id: string, body: unknown) =>
    apiFetch<any>(`/api/features/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  linkSession: (id: string, sessionId: string) =>
    apiFetch<any>(`/api/features/${id}/sessions`, {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),
  unlinkSession: (id: string, sessionId: string) =>
    apiFetch<any>(`/api/features/${id}/sessions/${sessionId}`, { method: "DELETE" }),
  resyncSession: (id: string, sessionId: string) =>
    apiFetch<any>(`/api/features/${id}/sessions/${sessionId}/resync`, { method: "POST" }),
  bulkLinkSessions: (id: string, sessionIds: string[]) =>
    apiFetch<any>(`/api/features/${id}/sessions/bulk`, {
      method: "POST",
      body: JSON.stringify({ sessionIds }),
    }),
  dashboard: (periodDays: number) =>
    apiFetch<any>(`/api/dashboard/summary?periodDays=${periodDays}`),
  projects: () => apiFetch<any>(`/api/projects`),
  project: (id: string) => apiFetch<any>(`/api/projects/${id}`),
  proposals: (projectId?: string) =>
    apiFetch<any>(`/api/analysis/proposals${projectId ? `?projectId=${projectId}` : ""}`),
  acceptProposal: (id: string, body: { name?: string; purpose?: string }) =>
    apiFetch<any>(`/api/proposals/${id}/accept`, { method: "POST", body: JSON.stringify(body) }),
  dismissProposal: (id: string) =>
    apiFetch<any>(`/api/proposals/${id}/dismiss`, { method: "POST" }),
  runAnalysis: (sessionId: string) =>
    apiFetch<any>(`/api/analysis/run`, { method: "POST", body: JSON.stringify({ sessionId }) }),
  runProjectClustering: (projectId: string) =>
    apiFetch<any>(`/api/analysis/run-project`, {
      method: "POST",
      body: JSON.stringify({ projectId }),
    }),
  sessionAnalysis: (id: string) => apiFetch<any>(`/api/sessions/${id}/analysis`),
  reanalyzeFeature: (id: string) =>
    apiFetch<any>(`/api/features/${id}/reanalyze`, { method: "POST" }),
};