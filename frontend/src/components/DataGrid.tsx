import { ArrowDownUp, Check, Copy, Download, Search, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { columnsOf, downloadText, humanize, toCsv } from "../lib/format";
import type { DataRow } from "../lib/types";

interface DataGridProps {
  rows: DataRow[];
  missionId: string | null;
  finalResult: string | null;
  simulated: boolean;
}

export function DataGrid({ rows, missionId, finalResult, simulated }: DataGridProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [copied, setCopied] = useState(false);
  const columns = useMemo(() => columnsOf(rows), [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(needle))) : rows;
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
      return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true }) * sort.dir;
    });
  }, [rows, query, sort]);

  const stem = `ghostoperator-${missionId ?? "mission"}`;

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (rows.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-md">
          <Table2 className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
          <p className="text-sm text-zinc-400">No structured records yet.</p>
          <p className="mt-1 text-xs text-zinc-600">Extracted rows appear here when the agent finishes its mission.</p>
          {finalResult && <pre className="mt-4 max-h-60 overflow-auto rounded-lg bg-slate-950/70 p-3 text-left font-mono text-[11px] text-zinc-400 whitespace-pre-wrap">{finalResult}</pre>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] p-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-slate-950/70 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-zinc-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter records" className="w-full bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none" />
        </div>
        <span className="font-mono text-[11px] text-zinc-500">
          {visible.length}/{rows.length} rows
        </span>
        <button type="button" onClick={copyJson} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.04]">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} Copy JSON
        </button>
        <button
          type="button"
          onClick={() => downloadText(`${stem}.csv`, toCsv(rows), "text/csv;charset=utf-8")}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-400/90 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
        >
          <Download className="h-3.5 w-3.5" /> Export to CSV
        </button>
      </div>
      {simulated && (
        <div className="border-b border-amber-500/20 bg-amber-500/[0.06] px-3 py-1.5 text-[11px] text-amber-300">
          Simulated sample data from demo mode. It was not scraped from a live website.
        </div>
      )}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur">
            <tr>
              {columns.map((column) => (
                <th key={column} className="border-b border-white/[0.06] px-3 py-2 font-medium text-zinc-400">
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:text-zinc-100"
                    onClick={() => setSort((s) => (s?.key === column ? { key: column, dir: s.dir === 1 ? -1 : 1 } : { key: column, dir: 1 }))}
                  >
                    {humanize(column)}
                    <ArrowDownUp className={`h-3 w-3 ${sort?.key === column ? "text-emerald-400" : "text-zinc-600"}`} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={index} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                {columns.map((column) => {
                  const value = row[column];
                  return (
                    <td key={column} className={`px-3 py-2 align-top ${typeof value === "number" ? "font-mono text-cyan-200" : "text-zinc-300"}`}>
                      {value === null || value === undefined ? <span className="text-zinc-700">—</span> : String(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
