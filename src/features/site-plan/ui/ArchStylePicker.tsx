// The style switch: one control for the 3D view and the sheets.
import React from 'react';
import { ARCH_STYLES, isArchStyle } from './architecture';
import { setArchStyle, useArchStyle } from './archStyle';

/** The style switch. */
export const ArchStylePicker: React.FC<{ className?: string | undefined }> = ({ className }) => {
  const style = useArchStyle();
  const blurb = ARCH_STYLES.find(s => s.key === style)?.blurb ?? '';
  return (
    <label className={className ?? 'inline-flex items-center gap-1'} title={`${blurb} Changes illustrative massing only. Homes with an assigned authored plan keep their modeled architecture.`}>
      <span className="text-gray-500">Context style</span>
      <select
        value={style}
        onChange={e => { if (isArchStyle(e.target.value)) setArchStyle(e.target.value); }}
        className="border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-800"
        data-testid="arch-style"
        aria-label="Illustrative context style"
      >
        {ARCH_STYLES.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
      </select>
    </label>
  );
};
