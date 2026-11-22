import { controller, type EngineMode } from '../core/controller';
import { useJournal, useLevel } from '../hooks/useJournal';

const ENGINE_OPTIONS: { mode: EngineMode; label: string }[] = [
  { mode: 'groq', label: 'Cloud AI (Groq)' },
  { mode: 'browser', label: 'Browser Speech' },
  { mode: 'local', label: 'Local AI (Whisper)' },
];

const ENGINE_TAG: Record<EngineMode, string> = {
  groq: 'Groq AI',
  browser: 'Browser',
  local: 'Local AI',
};

function LevelMeter({ threshold }: { threshold: number }) {
  const level = useLevel();
  const pct = Math.min(100, Math.round(Math.sqrt(level) * 250));
  const thresholdPct = Math.min(100, Math.round(Math.sqrt(threshold) * 250));
  const active = level > threshold;

  return (
    <div
      className="relative h-2.5 w-36 overflow-hidden rounded-full bg-slate-800"
      title="Microphone level (vertical marker = voice trigger threshold)"
    >
      <div
        className={`h-full transition-[width] duration-75 ${active ? 'bg-emerald-500' : 'bg-sky-600/70'}`}
        style={{ width: `${pct}%` }}
      />
      <div
        className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white/90"
        style={{ left: `${thresholdPct}%` }}
      />
    </div>
  );
}

export function ControlBar() {
  const {
    state,
    micEnabled,
    engineMode,
    groqApiKey,
    modelStatus,
    devices,
    selectedDeviceId,
    sensitivity,
    voiceThreshold,
  } = useJournal();
  const offline = state === 'OFFLINE';
  const loadingModel = modelStatus !== null;

  return (
    <section className="panel flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {offline ? (
          <>
            <button
              className="btn bg-emerald-600 hover:bg-emerald-500"
              onClick={() => void controller.start(true)}
              disabled={loadingModel}
            >
              {loadingModel ? 'Loading Model…' : 'Start Background Listener'}
            </button>
            <button
              className="btn bg-slate-800 hover:bg-slate-700"
              onClick={() => void controller.start(false)}
              disabled={loadingModel}
              title="Run the FSM without a microphone, driven only by the simulator"
            >
              Start without microphone
            </button>
            <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-xs">
              {ENGINE_OPTIONS.map((opt) => (
                <button
                  key={opt.mode}
                  className={`rounded-md px-2.5 py-1 transition ${
                    engineMode === opt.mode ? 'bg-sky-700 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => controller.setEngineMode(opt.mode)}
                  disabled={loadingModel}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button className="btn bg-slate-800 hover:bg-slate-700" onClick={() => controller.shutdown()}>
              Stop Listener
            </button>
            <button
              className="btn bg-amber-700 hover:bg-amber-600"
              onClick={() => controller.forceReset()}
              disabled={state === 'IDLE_MONITORING'}
            >
              Force Reset to Idle
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-3 text-sm text-slate-400">
          {modelStatus && <span className="text-sky-300">{modelStatus}</span>}
          {micEnabled && <LevelMeter threshold={voiceThreshold} />}
          <span>
            {offline
              ? 'Microphone off'
              : micEnabled
                ? `Microphone live (${ENGINE_TAG[engineMode]})`
                : 'Simulator only'}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-slate-800/80 pt-2.5 text-xs text-slate-400">
        <label className="flex items-center gap-2">
          <span>Microphone</span>
          <select
            className="max-w-56 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 outline-none focus:border-sky-600 disabled:opacity-40"
            value={selectedDeviceId}
            onChange={(e) => void controller.setDevice(e.target.value)}
            disabled={loadingModel}
          >
            <option value="">Default microphone</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span>Sensitivity: {sensitivity}%</span>
          <input
            type="range"
            min={1}
            max={100}
            value={sensitivity}
            onChange={(e) => controller.setSensitivity(Number(e.target.value))}
            className="h-1.5 w-28 accent-emerald-500"
            title="Higher sensitivity lowers the voice trigger line so quieter speech registers"
          />
        </label>

        {engineMode === 'groq' && (
          <label className="flex items-center gap-2">
            <span>Groq Key</span>
            <input
              type="password"
              value={groqApiKey}
              onChange={(e) => controller.setGroqApiKey(e.target.value)}
              placeholder="Paste Groq API key (gsk_…)"
              disabled={!offline}
              className="w-48 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 outline-none focus:border-sky-600 disabled:opacity-50"
            />
            {groqApiKey ? (
              <span className="text-emerald-400">Key ready</span>
            ) : (
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 underline hover:text-sky-300"
              >
                Get free key
              </a>
            )}
          </label>
        )}
      </div>
    </section>
  );
}
