import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Activity, Cpu, Gauge, Ghost, Layers, Radio, Wifi, WifiOff } from "lucide-react";
import type { AgentStatus, SocketState } from "../hooks/useAgentStream";
import { compactNumber } from "../lib/format";
import type { HealthResponse, Provider } from "../lib/types";

interface HeaderProps {
  status: AgentStatus;
  socketState: SocketState;
  provider: Provider;
  onProviderChange: (provider: Provider) => void;
  health: HealthResponse | null;
  steps: number;
  maxSteps: number;
  tokens: number;
  latencies: number[];
  simulated: boolean;
}

const STATUS_STYLE: Record<AgentStatus, { label: string; dot: string; ring: string; text: string }> = {
  idle: { label: "Agent Idle", dot: "bg-zinc-500", ring: "border-zinc-700/60 bg-zinc-800/40", text: "text-zinc-300" },
  launching: { label: "Initializing Agent", dot: "bg-amber-400", ring: "border-amber-500/30 bg-amber-500/10", text: "text-amber-300" },
  running: { label: "Autonomous Execution Active", dot: "bg-emerald-400", ring: "border-emerald-500/30 bg-emerald-500/10", text: "text-emerald-300" },
  complete: { label: "Mission Complete", dot: "bg-cyan-400", ring: "border-cyan-500/30 bg-cyan-500/10", text: "text-cyan-300" },
  failed: { label: "Mission Failed", dot: "bg-rose-500", ring: "border-rose-500/30 bg-rose-500/10", text: "text-rose-300" },
  cancelled: { label: "Mission Aborted", dot: "bg-zinc-400", ring: "border-zinc-600/50 bg-zinc-700/30", text: "text-zinc-300" },
};

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-6 w-20 rounded bg-white/[0.03]" />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 80},${22 - ((v - min) / span) * 18}`).join(" ");
  return (
    <svg viewBox="0 0 80 24" className="h-6 w-20" aria-hidden>
      <polyline points={points} fill="none" stroke="rgb(34 211 238)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ icon: Icon, label, value, children }: { icon: typeof Cpu; label: string; value: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
      <Icon className="h-3.5 w-3.5 text-zinc-500" />
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
        <div className="font-mono text-sm text-zinc-100">{value}</div>
      </div>
      {children}
    </div>
  );
}

export function Header(props: HeaderProps) {
  const style = STATUS_STYLE[props.status];
  const lastLatency = props.latencies.at(-1);
  const providers: { id: Provider; label: string }[] = [
    { id: "gemini", label: props.health?.providers.gemini.model ?? "Gemini Flash" },
    { id: "anthropic", label: props.health?.providers.anthropic.model ?? "Claude Sonnet" },
  ];

  return (
    <header className="panel flex flex-wrap items-center gap-4 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-400/20 to-cyan-400/10 ring-1 ring-emerald-400/30">
          <Ghost className="h-5 w-5 text-emerald-300" />
          {props.status === "running" && (
            <motion.span
              className="absolute inset-0 rounded-lg ring-2 ring-emerald-400/40"
              animate={{ opacity: [0.8, 0], scale: [1, 1.35] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-50">
            GhostOperator <span className="font-mono text-[10px] font-normal text-zinc-500">AETHERBROWSER</span>
          </div>
          <div className="text-xs text-zinc-500">Autonomous browser intelligence</div>
        </div>
      </div>

      <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${style.ring} ${style.text}`}>
        <span className="relative flex h-2 w-2">
          {(props.status === "running" || props.status === "launching") && (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${style.dot}`} />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${style.dot}`} />
        </span>
        {style.label}
      </div>

      {props.simulated && (
        <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-300">
          Demo mode · simulated
        </div>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Stat icon={Layers} label="Steps" value={`${props.steps}/${props.maxSteps}`} />
        <Stat icon={Cpu} label="Tokens" value={compactNumber(props.tokens)} />
        <Stat icon={Gauge} label="Latency" value={lastLatency !== undefined ? `${Math.round(lastLatency)}ms` : "—"}>
          <Sparkline values={props.latencies} />
        </Stat>

        <div className="flex rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
          {providers.map((p) => {
            const configured = props.health?.providers[p.id].configured ?? false;
            const active = props.provider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => props.onProviderChange(p.id)}
                disabled={props.status === "running" || props.status === "launching"}
                title={configured ? `${p.label} ready` : `${p.label}: no API key, missions run in demo mode`}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition disabled:cursor-not-allowed ${
                  active ? "bg-zinc-800 text-zinc-50 shadow-inner" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${configured ? "bg-emerald-400" : "bg-amber-400"}`} />
                {p.id === "gemini" ? <Activity className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
                <span className="font-mono">{p.label}</span>
              </button>
            );
          })}
        </div>

        <div
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-mono uppercase ${
            props.socketState === "open" ? "text-emerald-400" : "text-rose-400"
          }`}
          title={`WebSocket ${props.socketState}`}
        >
          {props.socketState === "open" ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {props.socketState}
        </div>
      </div>
    </header>
  );
}
