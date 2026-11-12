// The architectural style the buildings are shown in: one choice for the 3D
// view and the sheets, kept on this device. A style changes how the buildings
// look and nothing else.
import { useSyncExternalStore } from 'react';
import { DEFAULT_STYLE, isArchStyle, type ArchStyle } from './architecture';

const KEY = 'pp.archStyle';
let current: ArchStyle | null = null;
const listeners = new Set<() => void>();

export function getArchStyle(): ArchStyle {
  if (current) return current;
  let stored: unknown = null;
  try { stored = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; } catch { /* storage can be blocked: the default stands */ }
  current = isArchStyle(stored) ? stored : DEFAULT_STYLE;
  return current;
}

export function setArchStyle(style: ArchStyle): void {
  if (style === getArchStyle()) return;
  current = style;
  try { localStorage.setItem(KEY, style); } catch { /* the choice still holds for this visit */ }
  listeners.forEach(l => l());
}

const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useArchStyle = (): ArchStyle => useSyncExternalStore(subscribe, getArchStyle, () => DEFAULT_STYLE);
