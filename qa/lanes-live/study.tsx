import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { RenderView } from '../../src/features/site-plan/render3d/RenderView';
import { boundary, elements, scene } from './fixture';

function Study() {
  const [id, setId] = useState<string | null>('pad-1');
  const [failure, setFailure] = useState('');
  if (!scene || failure) return <p role="alert">{failure || 'Could not build the study scene.'}</p>;
  return <main className="h-screen flex flex-col bg-slate-900 text-white">
    <header className="p-3 flex flex-wrap items-center gap-4">
      <span className="font-semibold">The Lanes · live façade study</span>
      <span className="text-xs text-slate-300">Controlled lots · flat QA ground · not as-built</span>
      <label className="ml-auto text-sm">Focus home{' '}
        <select className="text-slate-900" value={id ?? ''} onChange={e => setId(e.target.value || null)}>
          <option value="">None</option>
          {Array.from({length:6}, (_,i) => <option key={i} value={'pad-' + i}>{['B2','E2','F2'][i % 3]} · Lot {i + 1}</option>)}
        </select>
      </label>
    </header>
    <div className="flex-1 min-h-0 text-slate-900">
      <RenderView scene={scene} elements={elements} parcelRing={boundary.coordinates[0]} selectedId={id} onSelect={setId} onFail={e => setFailure(e.message)} />
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Study />);
