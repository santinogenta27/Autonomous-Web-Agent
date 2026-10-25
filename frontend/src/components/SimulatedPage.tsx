import { motion } from "framer-motion";
import { MousePointer2 } from "lucide-react";
import { useEffect, useState } from "react";
import { columnsOf, hostOf } from "../lib/format";
import type { SceneData } from "../lib/types";

const CURSOR_TARGETS: Record<string, { x: string; y: string }> = {
  origin: { x: "22%", y: "38%" },
  destination: { x: "52%", y: "38%" },
  search: { x: "40%", y: "38%" },
  sort: { x: "78%", y: "24%" },
  results: { x: "48%", y: "58%" },
};

function Typewriter({ text }: { text: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    const id = setInterval(() => setCount((c) => (c >= text.length ? c : c + 1)), 90);
    return () => clearInterval(id);
  }, [text]);
  return (
    <span>
      {text.slice(0, count)}
      <span className="ml-px inline-block h-3 w-px animate-pulse bg-zinc-900 align-middle" />
    </span>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200 ${className}`} />;
}

export function SimulatedPage({ scene, url, title }: { scene: SceneData; url?: string; title?: string }) {
  const host = hostOf(url);
  const target = CURSOR_TARGETS[scene.highlight ?? ""] ?? { x: "50%", y: "70%" };
  const rows = scene.rows ?? [];
  const columns = columnsOf(rows).filter((c) => c !== "source");

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-50 text-zinc-900">
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3">
        <div className="h-6 w-6 rounded-md bg-gradient-to-br from-zinc-800 to-zinc-600" />
        <span className="text-sm font-semibold tracking-tight">{title?.split(/[|.]/)[0]?.trim() || host}</span>
        <div className="ml-auto flex gap-4 text-[11px] text-zinc-500">
          <span>Explore</span>
          <span>Deals</span>
          <span>Help</span>
        </div>
      </div>

      <div className="px-5 py-5">
        <div className={`relative grid grid-cols-3 gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ${scene.highlight && ["origin", "destination", "search"].includes(scene.highlight) ? "ring-emerald-500/60" : "ring-zinc-200"}`}>
          {["origin", "destination", "search"].map((slot, i) => (
            <div key={slot} className={`rounded-lg border px-3 py-2 text-xs ${scene.highlight === slot ? "border-emerald-500 bg-emerald-50" : "border-zinc-200"}`}>
              <div className="text-[9px] uppercase tracking-wider text-zinc-400">{i === 0 ? "From / Query" : i === 1 ? "To / Filter" : "Action"}</div>
              <div className="mt-0.5 h-4 font-medium">
                {scene.highlight === slot && scene.typed ? <Typewriter text={scene.typed} /> : i === 2 ? "Search" : <Skeleton className="mt-1 h-2.5 w-16" />}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Skeleton className="h-3 w-40" />
          <div className={`rounded-md border px-2 py-1 text-[10px] ${scene.highlight === "sort" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-zinc-200 text-zinc-500"}`}>
            Sort: Best ▾
          </div>
        </div>

        <div className={`mt-3 space-y-2 rounded-xl p-1 ${scene.highlight === "results" ? "ring-2 ring-emerald-500/50" : ""}`}>
          {scene.scene === "loading" &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-zinc-200">
                <Skeleton className="h-8 w-8" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-1/2" />
                  <Skeleton className="h-2 w-1/3" />
                </div>
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          {(scene.scene === "results" || scene.scene === "search") &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-zinc-200">
                <div className="h-8 w-8 rounded bg-zinc-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-1/2 rounded bg-zinc-300" />
                  <div className="h-2 w-1/3 rounded bg-zinc-200" />
                </div>
                <div className="h-5 w-12 rounded bg-zinc-800/80" />
              </div>
            ))}
          {(scene.scene === "extract" || scene.scene === "done") &&
            rows.map((row, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.12 }}
                className="relative flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-zinc-200"
              >
                <div className="grid h-8 w-8 place-items-center rounded bg-zinc-900 text-[10px] font-semibold text-white">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{String(row[columns[1] ?? columns[0]] ?? "")}</div>
                  <div className="truncate text-[10px] text-zinc-500">
                    {columns.slice(2, 5).map((c) => String(row[c] ?? "")).join(" · ")}
                  </div>
                </div>
                {scene.scene === "extract" && (
                  <motion.div
                    className="absolute inset-0 rounded-lg ring-2 ring-emerald-500"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ delay: i * 0.12, duration: 0.8 }}
                  />
                )}
              </motion.div>
            ))}
        </div>
      </div>

      <motion.div
        className="pointer-events-none absolute z-20"
        animate={{ left: target.x, top: target.y }}
        transition={{ type: "spring", stiffness: 80, damping: 16 }}
        style={{ left: "50%", top: "70%" }}
      >
        <MousePointer2 className="h-5 w-5 fill-emerald-400 text-emerald-700 drop-shadow" />
        <motion.span
          key={`${scene.scene}-${scene.highlight}`}
          className="absolute -left-2 -top-2 h-9 w-9 rounded-full border-2 border-emerald-400"
          initial={{ scale: 0.2, opacity: 1 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.6 }}
        />
      </motion.div>
    </div>
  );
}
