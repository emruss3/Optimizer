import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { RenderView } from '../../src/features/site-plan/render3d/RenderView';
import { boundary, elements, scene } from './fixture';
import { courtBoundary, courtElements, courtScene, courtViews, withReferenceCourt } from './court';

const courtStudy = { decorate: withReferenceCourt, views: courtViews };

function Study() {
  const [id, setId] = useState<string | null>(null);
  const [mode, setMode] = useState<'court' | 'street'>('court');
  const [failure, setFailure] = useState('');
  const activeScene = mode === 'court' ? courtScene : scene;
  if (!activeScene || failure) return <p role="alert">{failure || 'Could not build the study scene.'}</p>;
  return <main className="h-screen flex flex-col bg-slate-900 text-white">
    <header className="p-3 flex flex-wrap items-center gap-4">
      <span className="font-semibold">The Lanes · live photo-reference study</span>
      <span className="text-xs text-slate-300">Approximate photo-study geometry · not as-built</span>
      <div className="ml-auto flex gap-2" role="group" aria-label="Study area">
        <button className="rounded border px-2 py-1 text-sm" aria-pressed={mode === 'court'} onClick={() => { setMode('court'); setId(null); }}>Clubhouse court</button>
        <button className="rounded border px-2 py-1 text-sm" aria-pressed={mode === 'street'} onClick={() => { setMode('street'); setId(null); }}>Street corridor</button>
      </div>
      <label className="text-sm">Focus home{' '}
        <select className="text-slate-900" value={id ?? ''} onChange={e => setId(e.target.value || null)}>
          <option value="">None</option>
          {Array.from({length:mode === 'court' ? 3 : 6}, (_,i) => <option key={i} value={'pad-' + i}>{['B2','E2','F2'][i % 3]} · Lot {i + 1}</option>)}
        </select>
      </label>
    </header>
    <div className="flex-1 min-h-0 text-slate-900">
      <RenderView key={mode} scene={activeScene} elements={mode === 'court' ? courtElements : elements}
        parcelRing={mode === 'court' ? courtBoundary : boundary.coordinates[0]}
        {...(mode === 'court' ? {referenceStudy: courtStudy} : {})} selectedId={id} onSelect={setId} onFail={e => setFailure(e.message)} />
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Study />);
