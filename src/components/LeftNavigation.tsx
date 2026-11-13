import React from 'react';
import { Map, Menu, X, Clock } from 'lucide-react';
import { listRecent } from '../lib/recentWork';
import { openParcel } from '../lib/parcelSearch';
import { useUIStore } from '../store/ui';
import MapControls from './MapControls';

export default function LeftNavigation() {
  const [activeTab, setActiveTab] = React.useState('map');
  const { leftNavOpen, setLeftNavOpen, isMobile } = useUIStore();
  
  // Props for MapControls - these would come from the map component
  const [parcelStats] = React.useState(null);
  // Only destinations that exist are listed. Saved parcels, reports and
  // settings come back when each has a real view behind it.
  const navigationItems = [
    { id: 'map', label: 'Map View', icon: Map },
  ];
  // what this browser has actually opened: never sample activity
  const recent = listRecent().slice(0, 5);

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-gray-200">
        {isMobile && (
          <button
            onClick={() => setLeftNavOpen(false)}
            className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg lg:hidden"
            data-testid="nav-close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        {/* The header owns the brand — repeating it here doubled the logo
            stack (top bar + rail). The rail is navigation, labeled as such. */}
        <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Navigate
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 p-2">
        <div className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors focus-ring ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                aria-current={isActive ? 'page' : undefined}
                data-testid={`nav-${item.id}`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Map Controls Section - only show when Map View is active */}
        {activeTab === 'map' && (
          <div className="mt-6" data-testid="map-controls">
            <MapControls parcelStats={parcelStats} />
          </div>
        )}

        {/* Recent: the parcels opened on this device */}
        <div className="mt-6" data-testid="nav-recent">
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Recent
          </h3>
          {recent.length === 0 ? (
            <p className="px-3 text-xs text-gray-500">Parcels you open on this device are listed here.</p>
          ) : (
            <div className="space-y-1">
              {recent.map(r => (
                <button
                  key={r.ogcFid}
                  onClick={() => openParcel(r, r.planned)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg flex items-start gap-2 focus-ring"
                >
                  <Clock className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-medium truncate">{r.address}</span>
                    <span className="block text-xs text-gray-500">{[r.zoning, r.planned ? 'plan' : 'parcel'].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      {isMobile && (
        <button
          onClick={() => setLeftNavOpen(true)}
          className="fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md lg:hidden focus-ring"
          data-testid="mobile-hamburger"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Mobile backdrop */}
      {isMobile && leftNavOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-10 lg:hidden pointer-events-none"
          onClick={() => setLeftNavOpen(false)}
        />
      )}

      {/* Navigation */}
      <nav 
        className={`
          bg-white border-r border-gray-200 flex flex-col z-10 pointer-events-auto
          ${isMobile 
            ? `fixed left-0 top-0 h-full w-80 transform transition-transform duration-300 ${
                leftNavOpen ? 'translate-x-0' : '-translate-x-full'
              } lg:relative lg:translate-x-0 lg:w-64`
            : 'relative w-64'
          }
        `}
        data-testid="left-navigation"
      >
        <NavContent />
      </nav>
    </>
  );
}