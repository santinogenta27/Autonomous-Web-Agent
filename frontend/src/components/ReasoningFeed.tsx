import { AnimatePresence, motion } from "framer-motion";
import { Brain, CheckCircle2, ChevronRight, Eye, MousePointerClick, Terminal, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentStatus } from "../hooks/useAgentStream";
import { clock, hostOf } from "../lib/format";
import type { AgentEvent, LogLine, Phase, TimelineStep } from "../lib/types";

const PHASES: { id: Phase; icon: typeof Eye; color: string; bg: string }[] = [
  { id: "PERCEIVE", icon: Eye, color: "text-sky-300", bg: "bg-sky-400/10 border-sky-400/20" },
  { id: "REASON", icon: Brain, color: "text-violet-300", bg: "bg-violet-400/10 border-violet-400/20" },
  { id: "ACT", icon: MousePointerClick, color: "text-emerald-300", bg: "bg-emerald-400/10 border-emerald-400/20" },
  { id: "VALIDATE", icon: CheckCircle2, color: "text-cyan-300", bg: "bg-cyan-400/10 border-cyan-400/20" },
];

function PhaseBody({ phase, event }: { phase: Phase; event: AgentEvent }) {
  switch (phase) {
    case "PERCEIVE":
      return (
        <div className="space-y-1 text-zinc-400">
          <div className="truncate text-zinc-300">{event.title || hostOf(event.url)}</div>
          <div className="truncate text-zinc-500">{event.url}</div>
          {event.dom_elements !== undefined && <div>DOM: {event.dom_elements} interactive elements indexed</div>}
        </div>
      );
    case "REASON":
      return (
        <div className="space-y-1.5">
          {event.evaluation && <div className="text-zinc-500">eval › {event.evaluation}</div>}
          {event.thought && <div className="whitespace-pre-wrap text-zinc-300">{event.thought}</div>}
          {event.memory && <div className="text-zinc-500">memory › {event.memory}</div>}
          {event.next_goal && <div className="text-violet-200">goal › {event.next_goal}</div>}
        </div>
      );
    case "ACT":
      return (
        <div className="space-y-1">
          {(event.actions ?? []).map((action, index) => (
            <div key={index} className="flex flex-wrap items-baseline gap-1.5">
              <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-emerald-300">{action.name}</span>
              <span className="break-all text-zinc-500">{JSON.stringify(action.params)}</span>
            </div>
          ))}
        </div>
      );
    case "VALIDATE":
      return event.success === false ? (
        <div className="flex gap-1.5 text-rose-300">
          <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="break-words">{event.error}</span>
        </div>
      ) : (
        <div className="line-clamp-6 whitespace-pre-wrap text-zinc-400">{event.message}</div>
      );
  }
}

function StepCard({ step, defaultOpen, live }: { step: TimelineStep; defaultOpen: boolean; live: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  const failed = step.phases.VALIDATE?.success === false;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-white/[0.06] bg-white/[0.015]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <ChevronRight className={`h-3.5 w-3.5 text-zinc-500 transition ${open ? "rotate-90" : ""}`} />
        <span className="font-mono text-[11px] text-zinc-500">STEP {String(step.step).padStart(2, "0")}</span>
        <div className="flex gap-1">
          {PHASES.map((p) => (
            <span
              key={p.id}
              className={`h-1.5 w-4 rounded-full ${
                step.phases[p.id] ? (p.id === "VALIDATE" && failed ? "bg-rose-400" : p.color.replace("text", "bg")) : "bg-zinc-800"
              }`}
            />
          ))}
        </div>
        <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{step.phases.REASON?.next_goal ?? hostOf(step.url)}</span>
        {live && !step.phases.VALIDATE && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
        <span className="font-mono text-[10px] text-zinc-600">{clock(step.startedAt)}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-2 px-3 pb-3">
              {PHASES.filter((p) => step.phases[p.id]).map((p) => {
                const event = step.phases[p.id] as AgentEvent;
                const Icon = p.icon;
                return (
                  <motion.div key={p.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2.5">
                    <div className={`mt-0.5 flex h-6 shrink-0 items-center gap-1 rounded border px-1.5 font-mono text-[10px] ${p.bg} ${p.color}`}>
                      <Icon className="h-3 w-3" /> {p.id}
                    </div>
                    <div className="min-w-0 flex-1 pt-1 font-mono text-[11.5px] leading-relaxed">
                      <PhaseBody phase={p.id} event={event} />
                      {event.latency_ms !== undefined && p.id === "REASON" && (
                        <div className="mt-1 text-[10px] text-zinc-600">llm {Math.round(event.latency_ms)}ms</div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const LEVEL_COLOR: Record<LogLine["level"], string> = {
  info: "text-zinc-400",
  warn: "text-amber-300",
  error: "text-rose-300",
  success: "text-emerald-300",
};

interface FeedProps {
  steps: TimelineStep[];
  logs: LogLine[];
  status: AgentStatus;
}

export function ReasoningFeed({ steps, logs, status }: FeedProps) {
  const [tab, setTab] = useState<"timeline" | "console">("timeline");
  const scrollRef = useRef<HTMLDivElement>(null);
  const live = status === "running";

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [steps, logs, tab]);

  return (
    <section className="panel flex min-h-[420px] flex-1 flex-col lg:min-h-0">
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-3 py-2">
        <h2 className="mr-auto text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Perception &amp; Reasoning</h2>
        {(["timeline", "console"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] capitalize ${tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {t === "console" && <Terminal className="h-3 w-3" />}
            {t}
          </button>
        ))}
      </div>
      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {tab === "timeline" ? (
          steps.length === 0 ? (
            <div className="grid h-full min-h-[200px] place-items-center text-center">
              <div>
                <div className="mx-auto mb-3 flex w-fit gap-1.5">
                  {PHASES.map((p) => (
                    <span key={p.id} className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${p.bg} ${p.color}`}>
                      {p.id}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-zinc-500">
                  {status === "launching" || status === "running" ? "Booting browser and planning first step…" : "Launch a mission to stream the agent's cognition loop."}
                </p>
              </div>
            </div>
          ) : (
            steps.map((step, index) => <StepCard key={step.step} step={step} live={live} defaultOpen={index >= steps.length - 2} />)
          )
        ) : (
          <div className="font-mono text-[11.5px] leading-relaxed">
            {logs.map((line) => (
              <div key={line.id} className="flex gap-2">
                <span className="shrink-0 text-zinc-600">{clock(line.timestamp)}</span>
                <span className={`break-words ${LEVEL_COLOR[line.level]}`}>{line.text}</span>
              </div>
            ))}
            {live && <span className="inline-block h-3.5 w-2 animate-pulse bg-emerald-400/80 align-middle" />}
          </div>
        )}
      </div>
    </section>
  );
}
