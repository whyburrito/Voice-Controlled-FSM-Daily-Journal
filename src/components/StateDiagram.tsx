import { STATES, type State } from '../core/fsm';

const COLORS: Record<State, string> = {
  OFFLINE: 'border-slate-500 bg-slate-700/60',
  IDLE_MONITORING: 'border-sky-500 bg-sky-900/60',
  ACTIVE_RECORDING: 'border-rose-500 bg-rose-900/60',
  PROCESSING_TEXT: 'border-violet-500 bg-violet-900/60',
  CONFIRMATION: 'border-amber-500 bg-amber-900/60',
  SAVED: 'border-emerald-500 bg-emerald-900/60',
};

export function StateDiagram({ current }: { current: State }) {
  return (
    <section className="panel">
      <ol className="flex flex-wrap items-center gap-2 text-xs font-mono">
        {STATES.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`rounded-md border px-2 py-1 transition ${
                s === current ? `${COLORS[s]} text-white shadow-lg` : 'border-slate-800 text-slate-500'
              }`}
            >
              {s}
            </span>
            {i < STATES.length - 1 && <span className="text-slate-600">→</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
