export type Provider = "gemini" | "anthropic";
export type Phase = "PERCEIVE" | "REASON" | "ACT" | "VALIDATE";
export type MissionStatus = "queued" | "running" | "complete" | "failed" | "cancelled";
export type EventType =
  | "mission_started"
  | "phase"
  | "frame"
  | "log"
  | "metrics"
  | "mission_complete"
  | "mission_failed";

export type DataRow = Record<string, string | number | boolean | null>;

export interface ActionInfo {
  name: string;
  params: Record<string, unknown>;
}

export interface SceneData {
  scene: "search" | "loading" | "results" | "extract" | "done";
  highlight?: string | null;
  typed?: string | null;
  rows?: DataRow[] | null;
}

export interface MissionRecord {
  mission_id: string;
  mission: string;
  target_url: string | null;
  provider: Provider;
  model: string;
  mode: "live" | "demo";
  status: MissionStatus;
  max_steps: number;
  created_at: string;
  finished_at: string | null;
  steps: number;
  tokens: number;
  final_result: string | null;
  records: DataRow[];
  error: string | null;
  has_recording: boolean;
  has_csv: boolean;
}

export interface AgentEvent {
  type: EventType;
  mission_id: string;
  timestamp: string;
  step?: number;
  phase?: Phase;
  url?: string;
  title?: string;
  message?: string;
  thought?: string;
  evaluation?: string;
  memory?: string;
  next_goal?: string;
  actions?: ActionInfo[];
  dom_elements?: number;
  screenshot?: string;
  success?: boolean;
  error?: string;
  latency_ms?: number;
  tokens?: number;
  data?: unknown;
  simulated?: boolean;
}

export interface RunMissionRequest {
  mission: string;
  max_steps: number;
  target_url?: string;
  model_provider: Provider;
  demo_mode?: boolean;
}

export interface RunMissionResponse {
  mission_id: string;
  status: MissionStatus;
  mode: "live" | "demo";
  provider: Provider;
  model: string;
  reason: string | null;
}

export interface HealthResponse {
  status: string;
  headless: boolean;
  active_mission: string | null;
  providers: Record<Provider, { configured: boolean; model: string }>;
  demo_fallback: boolean;
}

export interface TimelineStep {
  step: number;
  url?: string;
  title?: string;
  phases: Partial<Record<Phase, AgentEvent>>;
  startedAt: string;
}

export interface LogLine {
  id: number;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  text: string;
}
