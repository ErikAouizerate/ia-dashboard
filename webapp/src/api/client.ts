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
};