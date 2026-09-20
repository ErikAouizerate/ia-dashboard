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
  dashboard: (periodDays: number) =>
    apiFetch<any>(`/api/dashboard/summary?periodDays=${periodDays}`),
  projects: () => apiFetch<any>(`/api/projects`),
  project: (id: string) => apiFetch<any>(`/api/projects/${id}`),
  configs: () => apiFetch<any>(`/api/configs`),
  config: (id: string) => apiFetch<any>(`/api/configs/${encodeURIComponent(id)}`),
};