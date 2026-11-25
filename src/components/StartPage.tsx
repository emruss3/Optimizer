import React from 'react';
import { Map } from 'lucide-react';
import StartPanel from './StartPanel';

/** What a returning user opens on: search, recent work and the last plan. */
const StartPage: React.FC<{ onBrowseMap: () => void; onAbout: () => void; onSample?: () => void; onTour?: () => void }> = ({ onBrowseMap, onAbout, onSample, onTour }) => (
  <div className="min-h-screen bg-gray-50" data-testid="start-page">
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="bg-blue-600 p-1.5 rounded-md"><Map className="w-4 h-4 text-white" /></span>
          <span className="font-semibold text-gray-900">Parcel Intelligence</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {onTour && <button onClick={onTour} data-testid="start-tour" className="text-gray-600 hover:text-gray-900">Take the tour</button>}
          <button onClick={onAbout} className="text-gray-600 hover:text-gray-900">About</button>
          <button
            onClick={onBrowseMap}
            data-testid="start-browse-map"
            className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-800 hover:bg-gray-50"
          >
            Browse the map
          </button>
        </div>
      </div>
    </header>
    <main className="px-6 py-10">
      <h1 className="max-w-2xl mx-auto text-2xl font-semibold text-gray-900 mb-6">Find a site</h1>
      <StartPanel autoFocus />
      {onSample && (
        <div className="max-w-2xl mx-auto mt-6 pt-6 border-t border-gray-200 flex items-center justify-between gap-4">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">Sample.</span> 1710 Meharry Blvd, a real Nashville parcel with a finished concept plan. It is a demonstration, not your work.
          </p>
          <button onClick={onSample} data-testid="start-sample" className="flex-shrink-0 px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-800 hover:bg-gray-50">
            Open the sample
          </button>
        </div>
      )}
    </main>
  </div>
);

export default StartPage;
