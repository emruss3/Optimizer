import React from 'react';
import type { Authority, SceneBuilding } from '../scene/types';

const AUTHORITY_WORD: Record<Authority, string> = {
  engine: 'from the plan',
  record: 'from the record',
  derived: 'footprint × stories',
  estimated: 'estimated',
  unavailable: 'not available',
};

const Row: React.FC<{ field: string; label: string; value: string; source?: string | undefined }> = ({ field, label, value, source }) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5">
    <dt className="text-gray-500">{label}</dt>
    <dd className="text-right text-gray-900 font-medium tabular-nums" data-field={field}>
      {value}
      {source && <span className="ml-1.5 font-normal text-[10px] text-gray-400">{source}</span>}
    </dd>
  </div>
);

/**
 * What is known about the selected building, read from the drawing scene. The
 * plan, the 3D view and the printed sheets read the same scene, so the values
 * here are the ones they show. Each value says where it comes from.
 */
export const SceneInspector: React.FC<{ building: SceneBuilding; onClose?: (() => void) | undefined; className?: string | undefined }> = ({ building: b, onClose, className }) => {
  const d = b.display;
  return (
    <div
      data-testid="scene-inspector"
      data-feature-id={b.id}
      className={`w-64 rounded-lg border border-gray-200 bg-white/95 shadow-sm text-[11px] ${className ?? ''}`}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 border-b border-gray-100">
        <span className="inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-full border border-gray-900 text-[11px] font-bold text-gray-900" data-field="tag">{b.tag}</span>
        <span className="text-xs font-semibold text-gray-900" data-field="title">{d.title}</span>
        <span className="text-gray-500">{d.use}</span>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Clear selection" className="ml-auto text-gray-400 hover:text-gray-700 leading-none text-sm">×</button>
        )}
      </div>
      <dl className="px-3 py-1.5">
        <Row field="id" label="ID" value={b.id} />
        <Row field="floors" label="Stories" value={d.floors} source={b.floors.authority === 'estimated' ? 'assumed' : undefined} />
        <Row field="footprint" label="Footprint" value={d.footprint} source={b.footprintSqFt ? AUTHORITY_WORD[b.footprintSqFt.authority] : undefined} />
        <Row field="gross" label="Gross area" value={d.gross} source={b.grossSqFt ? AUTHORITY_WORD[b.grossSqFt.authority] : undefined} />
        {b.units && <Row field="units" label="Units" value={d.units} source={AUTHORITY_WORD[b.units.authority]} />}
        <Row field="height" label={d.heightLabel} value={d.height} source="above grade" />
      </dl>
      <p className="px-3 pb-2 text-[10px] leading-snug text-gray-500" data-field="height-note">{b.height.note}</p>
      <p className="px-3 pb-2.5 text-[10px] leading-snug text-gray-400">Ground elevation at the building is not in this model.</p>
    </div>
  );
};

export default SceneInspector;
