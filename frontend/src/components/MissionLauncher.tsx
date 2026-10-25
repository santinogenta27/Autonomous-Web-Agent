import { motion } from "framer-motion";
import { Building2, FlaskConical, Globe, Plane, Play, RotateCcw, ShoppingBag, Square } from "lucide-react";
import { useState } from "react";
import type { AgentStatus } from "../hooks/useAgentStream";
import type { RunMissionRequest } from "../lib/types";

export const PRESETS = [
  {
    id: "flights",
    icon: Plane,
    title: "Airline Flight Intel",
    url: "https://www.kayak.com/flights",
    prompt:
      "Airline Flight Intel: Search flights from MIA to EWR on Kayak for next Friday, extract top 5 cheapest flights with airlines, stops, and prices into CSV.",
  },
  {
    id: "pricing",
    icon: ShoppingBag,
    title: "Competitive Pricing Audit",
    url: "https://www.nike.com",
    prompt:
      "Competitive Pricing Audit: Go to Nike.com, search running shoes under $150, extract top 4 models, prices, and stock status.",
  },
  {
    id: "leads",
    icon: Building2,
    title: "B2B Lead Enrichment",
    url: "https://www.ycombinator.com/companies",
    prompt:
      "B2B Lead Enrichment: Go to YCombinator companies directory, find 3 AI startups funded in W24, extract name, founders, and one-line pitch.",
  },
] as const;

interface LauncherProps {
  status: AgentStatus;
  onLaunch: (request: Omit<RunMissionRequest, "model_provider">) => void;
  onStop: () => void;
  onReset: () => void;
  maxSteps: number;
  onMaxStepsChange: (value: number) => void;
}

export function MissionLauncher({ status, onLaunch, onStop, onReset, maxSteps, onMaxStepsChange }: LauncherProps) {
  const [mission, setMission] = useState<string>(PRESETS[0].prompt);
  const [targetUrl, setTargetUrl] = useState<string>(PRESETS[0].url);
  const [demo, setDemo] = useState(false);
  const busy = status === "running" || status === "launching";
  const finished = status === "complete" || status === "failed" || status === "cancelled";

  const submit = () => {
    if (!mission.trim() || busy) return;
    onLaunch({ mission: mission.trim(), max_steps: maxSteps, target_url: targetUrl.trim() || undefined, demo_mode: demo });
  };

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Mission Launcher</h2>
        <span className="font-mono text-[10px] text-zinc-600">ctrl + enter to launch</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {PRESETS.map((preset) => {
          const Icon = preset.icon;
          const active = mission === preset.prompt;
          return (
            <motion.button
              key={preset.id}
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              disabled={busy}
              onClick={() => {
                setMission(preset.prompt);
                setTargetUrl(preset.url);
              }}
              className={`group rounded-lg border p-3 text-left transition disabled:opacity-50 ${
                active
                  ? "border-emerald-400/40 bg-emerald-400/[0.07]"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/15"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${active ? "text-emerald-300" : "text-zinc-500 group-hover:text-zinc-300"}`} />
                <span className="text-xs font-medium text-zinc-200">{preset.title}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{preset.prompt.split(": ")[1]}</p>
            </motion.button>
          );
        })}
      </div>

      <textarea
        value={mission}
        onChange={(e) => setMission(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
        }}
        disabled={busy}
        rows={3}
        placeholder="Describe the objective. The agent plans, navigates and extracts autonomously."
        className="w-full resize-none rounded-lg border border-white/[0.08] bg-slate-950/70 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-60"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-slate-950/70 px-3 py-2">
          <Globe className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            disabled={busy}
            placeholder="Target URL (optional)"
            className="w-full bg-transparent font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-slate-950/70 px-3 py-2 text-xs text-zinc-400">
          Max steps
          <input
            type="number"
            min={1}
            max={100}
            value={maxSteps}
            disabled={busy}
            onChange={(e) => onMaxStepsChange(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
            className="w-12 bg-transparent font-mono text-zinc-100 focus:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() => setDemo((d) => !d)}
          disabled={busy}
          title="Force a simulated run (no browser, no LLM calls)"
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition ${
            demo ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-white/[0.08] text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <FlaskConical className="h-3.5 w-3.5" /> Demo
        </button>

        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-2 rounded-lg bg-rose-500/90 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-500/20 hover:bg-rose-500"
          >
            <Square className="h-3.5 w-3.5" /> Abort
          </button>
        ) : (
          <>
            {finished && (
              <button
                type="button"
                onClick={onReset}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            )}
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={submit}
              disabled={!mission.trim()}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:brightness-110 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Launch Mission
            </motion.button>
          </>
        )}
      </div>
    </section>
  );
}
