import React from 'react';
import { Map } from 'lucide-react';
import StartPanel from './StartPanel';

/** What a returning user opens on: search, recent work and the last plan. */
const StartPage: React.FC<{ onBrowseMap: () => void; onAbout: () => void }> = ({ onBrowseMap, onAbout }) => (
  <div className="min-h-screen bg-gray-50" data-testid="start-page">
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="bg-blue-600 p-1.5 rounded-md"><Map className="w-4 h-4 text-white" /></span>
          <span className="font-semibold text-gray-900">Parcel Intelligence</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
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
      <h1 className="max-w-2xl mx-auto text-2xl font-semibold text-gray-900 mb-6">Welcome back</h1>
      <StartPanel autoFocus />
    </main>
  </div>
);

export default StartPage;
