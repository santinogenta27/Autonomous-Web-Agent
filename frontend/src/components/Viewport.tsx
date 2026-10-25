import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Film, Lock, MonitorPlay, RotateCw, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { AgentStatus, Frame } from "../hooks/useAgentStream";
import { assetUrl } from "../lib/api";
import type { DataRow, MissionRecord } from "../lib/types";
import { DataGrid } from "./DataGrid";
import { SimulatedPage } from "./SimulatedPage";

type Tab = "live" | "recording" | "data";

interface ViewportProps {
  frame: Frame;
  status: AgentStatus;
  simulated: boolean;
  missionId: string | null;
  record: MissionRecord | null;
  records: DataRow[];
  finalResult: string | null;
}

function IdleScreen({ status }: { status: AgentStatus }) {
  return (
    <div className="grid-bg relative grid h-full place-items-center overflow-hidden bg-slate-950">
      <div className="text-center">
        <motion.div
          className="mx-auto mb-4 h-16 w-16 rounded-2xl border border-emerald-400/30 bg-emerald-400/5"
          animate={{ rotate: status === "launching" ? 360 : 0, boxShadow: ["0 0 0px rgb(52 211 153 / 0)", "0 0 40px rgb(52 211 153 / 0.25)", "0 0 0px rgb(52 211 153 / 0)"] }}
          transition={{ duration: status === "launching" ? 1.4 : 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-500">
          {status === "launching" || status === "running" ? "Spawning Chromium session" : "Viewport standby"}
        </p>
        <p className="mt-2 text-xs text-zinc-600">Live frames stream here while the agent operates the browser.</p>
      </div>
    </div>
  );
}

export function Viewport({ frame, status, simulated, missionId, record, records, finalResult }: ViewportProps) {
  const [tab, setTab] = useState<Tab>("live");
  const hasRecording = Boolean(record?.has_recording && missionId);

  useEffect(() => {
    if (status === "complete" && records.length > 0) setTab("data");
    if (status === "launching") setTab("live");
  }, [status, records.length]);

  const tabs: { id: Tab; label: string; icon: typeof Film; disabled?: boolean; badge?: number }[] = [
    { id: "live", label: "Live Browser", icon: MonitorPlay },
    { id: "recording", label: "Recording", icon: Film, disabled: !hasRecording },
    { id: "data", label: "Structured Output", icon: Table2, badge: records.length || undefined },
  ];

  return (
    <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-3 py-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              disabled={t.disabled}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-30 ${
                tab === t.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
              {t.badge !== undefined && <span className="rounded bg-emerald-400/15 px-1 font-mono text-[10px] text-emerald-300">{t.badge}</span>}
            </button>
          );
        })}
        {status === "running" && tab === "live" && (
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-rose-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> {simulated ? "sim" : "live"}
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {tab === "live" && (
          <div className="flex h-full flex-col p-3">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-950">
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-zinc-900 px-3 py-1.5">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                </div>
                <ArrowLeft className="h-3.5 w-3.5 text-zinc-600" />
                <ArrowRight className="h-3.5 w-3.5 text-zinc-600" />
                <RotateCw className={`h-3.5 w-3.5 text-zinc-600 ${status === "running" ? "animate-spin [animation-duration:2.5s]" : ""}`} />
                <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-zinc-950/80 px-2.5 py-1">
                  <Lock className="h-3 w-3 shrink-0 text-emerald-500" />
                  <span className="truncate font-mono text-[11px] text-zinc-400">{frame.url ?? "about:blank"}</span>
                </div>
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden">
                {frame.screenshot ? (
                  <img src={`data:image/${frame.screenshot.startsWith("/9j/") ? "jpeg" : "png"};base64,${frame.screenshot}`} alt="Live browser frame" className="h-full w-full object-contain object-top" />
                ) : frame.scene ? (
                  <SimulatedPage scene={frame.scene} url={frame.url} title={frame.title} />
                ) : (
                  <IdleScreen status={status} />
                )}
                {status === "running" && <div className="scanline pointer-events-none absolute inset-0" />}
                <AnimatePresence>
                  {frame.actionLabel && status !== "idle" && (
                    <motion.div
                      key={frame.actionLabel}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute bottom-3 left-3 rounded-md border border-emerald-400/30 bg-slate-950/85 px-2.5 py-1 font-mono text-[11px] text-emerald-300 backdrop-blur"
                    >
                      ▸ {frame.actionLabel}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}

        {tab === "recording" && hasRecording && missionId && (
          <div className="grid h-full place-items-center bg-black p-3">
            <video key={missionId} src={assetUrl(`/api/missions/${missionId}/recording`)} controls autoPlay muted className="max-h-full max-w-full rounded-lg" />
          </div>
        )}

        {tab === "data" && <DataGrid rows={records} missionId={missionId} finalResult={finalResult} simulated={simulated} />}
      </div>
    </section>
  );
}
