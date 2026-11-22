import { ControlBar } from './components/ControlBar';
import { EntryList } from './components/EntryList';
import { Simulator } from './components/Simulator';
import { StateDiagram } from './components/StateDiagram';
import { TransitionLog } from './components/TransitionLog';
import { useJournal } from './hooks/useJournal';

export default function App() {
  const { state, live, idleHeard, stageRaw, stageEntry, error, engineMode, speechSupported } = useJournal();

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Hands-Free Voice Journal</h1>
          <p className="text-sm text-slate-400">
            Say <span className="text-slate-200">"Hey Journal, start note"</span> to begin and{' '}
            <span className="text-slate-200">"Save note"</span> or pause for 5 seconds to finish.
          </p>
        </div>
      </header>

      {engineMode === 'browser' && !speechSupported && (
        <div className="rounded-lg border border-amber-700 bg-amber-950/50 p-3 text-sm text-amber-200">
          This browser does not support the Web Speech API. Switch to Local AI (Whisper), use Google Chrome or
          Microsoft Edge on desktop, or use the simulator below.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-200">{error}</div>
      )}

      <ControlBar />
      <StateDiagram current={state} />

      {state === 'IDLE_MONITORING' && idleHeard && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
          Heard in idle (ignored until wake phrase): <span className="text-slate-200">"{idleHeard}"</span>
        </section>
      )}

      {state === 'ACTIVE_RECORDING' && (
        <section className="panel border-rose-800">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-300">Recording</h2>
          <p className="min-h-6 text-slate-100">{live || <span className="text-slate-500">Listening…</span>}</p>
        </section>
      )}

      {state === 'PROCESSING_TEXT' && (
        <section className="panel border-violet-700">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-violet-300">
            Processing Text (Regex Extraction)
          </h2>
          <p className="text-sm text-slate-200">{stageRaw || <span className="text-slate-500">(empty)</span>}</p>
        </section>
      )}

      {state === 'CONFIRMATION' && stageEntry && (
        <section className="panel border-amber-700">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
            Confirmation (Validating Entry)
          </h2>
          <p className="mb-2 text-sm text-slate-100">
            {stageEntry.body || <span className="text-amber-300">(empty body — will reject)</span>}
          </p>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {stageEntry.priority && (
              <span className="rounded bg-amber-900/70 px-1.5 py-0.5 text-amber-200">
                priority: {stageEntry.priority}
              </span>
            )}
            {stageEntry.tags.map((t) => (
              <span key={t} className="rounded bg-sky-900/60 px-1.5 py-0.5 text-sky-200">
                #{t}
              </span>
            ))}
            {[...stageEntry.dates, ...stageEntry.times].map((d) => (
              <span key={d} className="rounded bg-violet-900/60 px-1.5 py-0.5 text-violet-200">
                {d}
              </span>
            ))}
          </div>
        </section>
      )}

      {state === 'SAVED' && (
        <section className="panel border-emerald-700">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Saved to Database
          </h2>
          <p className="text-sm text-emerald-100">
            {stageEntry?.body ? `"${stageEntry.body}" — ` : ''}Persisted to IndexedDB, returning to idle…
          </p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EntryList />
        </div>
        <div className="flex flex-col gap-4">
          <Simulator />
          <TransitionLog />
        </div>
      </div>
    </div>
  );
}
