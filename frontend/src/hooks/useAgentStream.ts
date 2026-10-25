import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, wsUrl } from "../lib/api";
import type {
  AgentEvent,
  DataRow,
  LogLine,
  MissionRecord,
  RunMissionRequest,
  RunMissionResponse,
  SceneData,
  TimelineStep,
} from "../lib/types";

export type AgentStatus = "idle" | "launching" | "running" | "complete" | "failed" | "cancelled";
export type SocketState = "connecting" | "open" | "closed";

export interface Frame {
  screenshot?: string;
  url?: string;
  title?: string;
  scene?: SceneData;
  actionLabel?: string;
}

export interface StreamState {
  missionId: string | null;
  launch: RunMissionResponse | null;
  status: AgentStatus;
  simulated: boolean;
  steps: TimelineStep[];
  logs: LogLine[];
  frame: Frame;
  tokens: number;
  stepCount: number;
  latencies: number[];
  records: DataRow[];
  finalResult: string | null;
  record: MissionRecord | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

type Action =
  | { kind: "launching" }
  | { kind: "launched"; response: RunMissionResponse }
  | { kind: "launch_failed"; error: string }
  | { kind: "event"; event: AgentEvent }
  | { kind: "reset" };

const initialState: StreamState = {
  missionId: null,
  launch: null,
  status: "idle",
  simulated: false,
  steps: [],
  logs: [],
  frame: {},
  tokens: 0,
  stepCount: 0,
  latencies: [],
  records: [],
  finalResult: null,
  record: null,
  error: null,
  startedAt: null,
  finishedAt: null,
};

let logSeq = 0;

function log(level: LogLine["level"], text: string, timestamp = new Date().toISOString()): LogLine {
  logSeq += 1;
  return { id: logSeq, level, text, timestamp };
}

function upsertStep(steps: TimelineStep[], event: AgentEvent): TimelineStep[] {
  if (event.step === undefined || !event.phase) return steps;
  const index = steps.findIndex((s) => s.step === event.step);
  if (index === -1) {
    const created: TimelineStep = {
      step: event.step,
      url: event.url,
      title: event.title,
      phases: { [event.phase]: event },
      startedAt: event.timestamp,
    };
    return [...steps, created].sort((a, b) => a.step - b.step);
  }
  const current = steps[index];
  const updated: TimelineStep = {
    ...current,
    url: event.url ?? current.url,
    title: event.title ?? current.title,
    phases: { ...current.phases, [event.phase]: event },
  };
  return steps.map((s, i) => (i === index ? updated : s));
}

function isScene(value: unknown): value is SceneData {
  return typeof value === "object" && value !== null && "scene" in value;
}

function phaseLog(event: AgentEvent): LogLine {
  const prefix = `[${event.phase}] step ${event.step}`;
  switch (event.phase) {
    case "PERCEIVE":
      return log("info", `${prefix} · ${event.message ?? event.url ?? ""}`, event.timestamp);
    case "REASON":
      return log("info", `${prefix} · ${event.next_goal ?? event.thought ?? ""}`, event.timestamp);
    case "ACT":
      return log("info", `${prefix} · ${(event.actions ?? []).map((a) => `${a.name}(${JSON.stringify(a.params)})`).join(" → ")}`, event.timestamp);
    default:
      return event.success === false
        ? log("error", `${prefix} · ${event.error ?? "validation failed"}`, event.timestamp)
        : log("success", `${prefix} · ${event.message ?? "ok"}`, event.timestamp);
  }
}

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.kind) {
    case "reset":
      return initialState;
    case "launching":
      return { ...initialState, status: "launching", startedAt: Date.now(), logs: [log("info", "Dispatching mission to GhostOperator core…")] };
    case "launched":
      return {
        ...state,
        missionId: action.response.mission_id,
        launch: action.response,
        status: "running",
        simulated: action.response.mode === "demo",
        logs: [
          ...state.logs,
          log(
            action.response.mode === "demo" ? "warn" : "info",
            action.response.mode === "demo"
              ? `Mission ${action.response.mission_id} queued in DEMO MODE (${action.response.reason ?? "simulated"})`
              : `Mission ${action.response.mission_id} queued on ${action.response.model}`,
          ),
        ],
      };
    case "launch_failed":
      return { ...state, status: "failed", error: action.error, logs: [...state.logs, log("error", action.error)] };
    case "event": {
      const event = action.event;
      if (!state.missionId || event.mission_id !== state.missionId) return state;
      const simulated = state.simulated || Boolean(event.simulated);
      switch (event.type) {
        case "mission_started":
          return { ...state, simulated, logs: [...state.logs, log(simulated ? "warn" : "info", event.message ?? "Mission started", event.timestamp)] };
        case "log":
          return { ...state, simulated, logs: [...state.logs, log("warn", event.message ?? "", event.timestamp)] };
        case "frame":
          return { ...state, frame: { ...state.frame, screenshot: event.screenshot ?? state.frame.screenshot, url: event.url ?? state.frame.url } };
        case "metrics":
          return {
            ...state,
            tokens: event.tokens ?? state.tokens,
            stepCount: Math.max(state.stepCount, event.step ?? 0),
            latencies: event.latency_ms !== undefined ? [...state.latencies, event.latency_ms].slice(-40) : state.latencies,
          };
        case "phase": {
          const frame: Frame = { ...state.frame };
          if (event.url) frame.url = event.url;
          if (event.title) frame.title = event.title;
          if (event.screenshot) frame.screenshot = event.screenshot;
          if (isScene(event.data)) frame.scene = event.data;
          if (event.phase === "ACT") frame.actionLabel = (event.actions ?? []).map((a) => a.name).join(" · ");
          if (event.phase === "PERCEIVE") frame.actionLabel = "perceiving";
          return {
            ...state,
            simulated,
            frame,
            steps: upsertStep(state.steps, event),
            stepCount: Math.max(state.stepCount, event.step ?? 0),
            tokens: event.tokens ?? state.tokens,
            logs: [...state.logs, phaseLog(event)].slice(-500),
          };
        }
        case "mission_complete":
        case "mission_failed": {
          const record = (event.data ?? null) as MissionRecord | null;
          const complete = event.type === "mission_complete";
          return {
            ...state,
            simulated,
            status: complete ? "complete" : record?.status === "cancelled" ? "cancelled" : "failed",
            record,
            records: record?.records ?? state.records,
            finalResult: record?.final_result ?? event.message ?? null,
            error: complete ? null : event.error ?? record?.error ?? "Mission failed",
            tokens: record?.tokens || state.tokens,
            finishedAt: Date.now(),
            frame: { ...state.frame, actionLabel: complete ? "mission complete" : "halted" },
            logs: [
              ...state.logs,
              complete
                ? log("success", `Mission complete · ${record?.records.length ?? 0} records extracted${simulated ? " (simulated)" : ""}`, event.timestamp)
                : log("error", `Mission ${record?.status ?? "failed"} · ${event.error ?? ""}`, event.timestamp),
            ],
          };
        }
      }
      return state;
    }
  }
}

export function useAgentStream() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const missionRef = useRef<string | null>(null);
  const pendingRef = useRef<AgentEvent[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  const deliver = useCallback((event: AgentEvent) => {
    if (event.type !== "frame") {
      const key = `${event.mission_id}|${event.type}|${event.phase ?? ""}|${event.step ?? ""}|${event.timestamp}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
    }
    dispatch({ kind: "event", event });
  }, []);

  useEffect(() => {
    missionRef.current = state.missionId;
  }, [state.missionId]);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let attempt = 0;

    const connect = () => {
      if (disposed) return;
      setSocketState("connecting");
      const socket = new WebSocket(wsUrl("/ws/agent"));
      socketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        setSocketState("open");
        if (missionRef.current) socket.send(JSON.stringify({ type: "subscribe", mission_id: missionRef.current }));
        heartbeat = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "ping" })), 20000);
      };
      socket.onmessage = (message: MessageEvent<string>) => {
        const event = JSON.parse(message.data) as AgentEvent | { type: "pong" };
        if (event.type === "pong") return;
        const agentEvent = event as AgentEvent;
        if (!missionRef.current) {
          if (agentEvent.type !== "frame") pendingRef.current = [...pendingRef.current, agentEvent].slice(-200);
          return;
        }
        deliver(agentEvent);
      };
      socket.onclose = () => {
        if (heartbeat) clearInterval(heartbeat);
        setSocketState("closed");
        if (!disposed) {
          attempt += 1;
          retry = setTimeout(connect, Math.min(8000, 500 * 2 ** attempt));
        }
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      if (heartbeat) clearInterval(heartbeat);
      socketRef.current?.close();
    };
  }, [deliver]);

  const launch = useCallback(async (request: RunMissionRequest) => {
    dispatch({ kind: "launching" });
    pendingRef.current = [];
    seenRef.current = new Set();
    try {
      const response = await api.runMission(request);
      missionRef.current = response.mission_id;
      dispatch({ kind: "launched", response });
      const buffered = pendingRef.current.filter((e) => e.mission_id === response.mission_id);
      pendingRef.current = [];
      buffered.forEach(deliver);
    } catch (error) {
      dispatch({ kind: "launch_failed", error: error instanceof Error ? error.message : String(error) });
    }
  }, [deliver]);

  const stop = useCallback(async () => {
    if (!missionRef.current) return;
    await api.stopMission(missionRef.current);
  }, []);

  const reset = useCallback(() => {
    missionRef.current = null;
    dispatch({ kind: "reset" });
  }, []);

  return { state, socketState, launch, stop, reset };
}
