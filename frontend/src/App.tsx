import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Header } from "./components/Header";
import { MissionLauncher } from "./components/MissionLauncher";
import { ReasoningFeed } from "./components/ReasoningFeed";
import { Viewport } from "./components/Viewport";
import { useAgentStream } from "./hooks/useAgentStream";
import { api } from "./lib/api";
import type { HealthResponse, Provider, RunMissionRequest } from "./lib/types";

export default function App() {
  const { state, socketState, launch, stop, reset } = useAgentStream();
  const [provider, setProvider] = useState<Provider>("gemini");
  const [maxSteps, setMaxSteps] = useState(25);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await api.health();
        if (!cancelled) {
          setHealth(result);
          setHealthError(null);
        }
      } catch (error) {
        if (!cancelled) setHealthError(error instanceof Error ? error.message : String(error));
      }
    };
    void poll();
    const id = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const onLaunch = useCallback(
    (request: Omit<RunMissionRequest, "model_provider">) => void launch({ ...request, model_provider: provider }),
    [launch, provider],
  );

  const providerReady = health?.providers[provider].configured ?? false;

  return (
    <div className="mx-auto flex min-h-full max-w-[1800px] flex-col gap-3 p-3 lg:h-full lg:p-4">
      <Header
        status={state.status}
        socketState={socketState}
        provider={provider}
        onProviderChange={setProvider}
        health={health}
        steps={state.stepCount}
        maxSteps={maxSteps}
        tokens={state.tokens}
        latencies={state.latencies}
        simulated={state.simulated}
      />

      {healthError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <AlertTriangle className="h-4 w-4" /> Backend unreachable ({healthError}). Start it with start.bat / run.ps1 / start.sh.
        </div>
      )}
      {health && !providerReady && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          No API key for {provider === "gemini" ? "Gemini (GEMINI_API_KEY)" : "Anthropic (ANTHROPIC_API_KEY)"} — missions run in demo mode with simulated data. Add the key to .env and restart the backend for live execution.
        </div>
      )}
      {state.error && state.status === "failed" && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span className="break-words">{state.error}</span>
        </div>
      )}

      <main className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-3 lg:min-h-0 lg:grid-cols-[minmax(380px,0.85fr)_1.15fr]">
        <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
          <MissionLauncher status={state.status} onLaunch={onLaunch} onStop={() => void stop()} onReset={reset} maxSteps={maxSteps} onMaxStepsChange={setMaxSteps} />
          <ReasoningFeed steps={state.steps} logs={state.logs} status={state.status} />
        </div>
        <div className="flex min-h-[520px] min-w-0 flex-col">
          <Viewport
            frame={state.frame}
            status={state.status}
            simulated={state.simulated}
            missionId={state.missionId}
            record={state.record}
            records={state.records}
            finalResult={state.finalResult}
          />
        </div>
      </main>
    </div>
  );
}
