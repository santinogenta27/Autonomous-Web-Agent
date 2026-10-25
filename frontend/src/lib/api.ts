import type { HealthResponse, MissionRecord, RunMissionRequest, RunMissionResponse } from "./types";

const configured = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const useProxy = import.meta.env.DEV && (configured === "" || /localhost:8000|127\.0\.0\.1:8000/.test(configured));

export const API_BASE = useProxy ? "" : configured;

export function wsUrl(path: string): string {
  if (API_BASE) return API_BASE.replace(/^http/, "ws") + path;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

export function assetUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (body.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body: keep the status text */
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  runMission: (body: RunMissionRequest) =>
    request<RunMissionResponse>("/api/run-mission", { method: "POST", body: JSON.stringify(body) }),
  stopMission: (id: string) => request<{ stopping: boolean }>(`/api/missions/${id}/stop`, { method: "POST" }),
  mission: (id: string) => request<MissionRecord>(`/api/missions/${id}`),
  missions: () => request<MissionRecord[]>("/api/missions"),
};
