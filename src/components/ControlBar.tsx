import { controller } from '../core/controller';
import { useJournal, useLevel } from '../hooks/useJournal';

function LevelMeter() {
  const level = useLevel();
  const pct = Math.min(100, Math.round(Math.sqrt(level) * 250));
  return (
    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-800" title="Microphone level">
      <div className="h-full bg-emerald-500 transition-[width] duration-100" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ControlBar() {
  const { state, micEnabled, engineMode, modelStatus } = useJournal();
  const offline = state === 'OFFLINE';
  const loadingModel = modelStatus !== null;

  return (
    <section className="panel flex flex-wrap items-center gap-3">
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
            <button
              className={`rounded-md px-2.5 py-1 transition ${
                engineMode === 'local' ? 'bg-sky-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => controller.setEngineMode('local')}
              disabled={loadingModel}
            >
              Local AI (Whisper)
            </button>
            <button
              className={`rounded-md px-2.5 py-1 transition ${
                engineMode === 'browser' ? 'bg-sky-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => controller.setEngineMode('browser')}
              disabled={loadingModel}
            >
              Browser Speech
            </button>
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
        {micEnabled && <LevelMeter />}
        <span>
          {offline
            ? 'Microphone off'
            : micEnabled
              ? `Microphone live (${engineMode === 'local' ? 'Local AI' : 'Browser'})`
              : 'Simulator only'}
        </span>
      </div>
    </section>
  );
}
