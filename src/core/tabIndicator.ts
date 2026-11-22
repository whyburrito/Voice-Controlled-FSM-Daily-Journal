import type { State } from './fsm';

const META: Record<State, { color: string; ring?: boolean; title: string }> = {
  OFFLINE: { color: '#64748b', title: 'Hands-Free Voice Journal' },
  IDLE_MONITORING: { color: '#0ea5e9', title: '🔵 Idle — Voice Journal' },
  ACTIVE_RECORDING: { color: '#ef4444', ring: true, title: '🔴 RECORDING… — Voice Journal' },
  PROCESSING_TEXT: { color: '#8b5cf6', title: '🟣 Processing… — Voice Journal' },
  CONFIRMATION: { color: '#f59e0b', title: '🟠 Confirming… — Voice Journal' },
  SAVED: { color: '#10b981', title: '🟢 SAVED! — Voice Journal' },
};

function makeSvg({ color, ring }: { color: string; ring?: boolean }): string {
  const outer = ring ? `<circle cx="16" cy="16" r="14" fill="none" stroke="${color}" stroke-width="3"/>` : '';
  const r = ring ? 8 : 11;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${outer}<circle cx="16" cy="16" r="${r}" fill="${color}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function updateTabIndicator(state: State): void {
  if (typeof document === 'undefined') return;
  const meta = META[state];
  document.title = meta.title;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = makeSvg(meta);
}
