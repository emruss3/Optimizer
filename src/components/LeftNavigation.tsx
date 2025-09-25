import React from 'react';
import { 
  Map, Settings, FileText, Users, Bookmark, Menu, X
} from 'lucide-react';
import { useUIStore } from '../store/ui';
import MapControls from './MapControls';

export default function LeftNavigation() {
  const [activeTab, setActiveTab] = React.useState('map');
  const { leftNavOpen, setLeftNavOpen, isMobile } = useUIStore();
  
  // Props for MapControls - these would come from the map component
  const [parcelStats] = React.useState(null);
  const handleReload = () => {
    // This would trigger map reload
    console.log('Reload parcels');
  };

  const navigationItems = [
    { id: 'map', label: 'Map View', icon: Map },
    { id: 'saved', label: 'Saved Parcels', icon: Bookmark },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  const bottomItems = [
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

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
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Map className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Parcel</h1>
            <p className="text-xs text-gray-600">Intelligence</p>
          </div>
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
            <MapControls onReload={handleReload} parcelStats={parcelStats} />
          </div>
        )}

        {/* Recent Activity Section */}
        <div className="mt-6">
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Recent Activity
          </h3>
          <div className="space-y-1">
            <div className="px-3 py-2 text-sm text-gray-600">
              <div className="font-medium">2312 Heiman St</div>
              <div className="text-xs text-gray-500">Viewed 2 hours ago</div>
            </div>
            <div className="px-3 py-2 text-sm text-gray-600">
              <div className="font-medium">1501 Jefferson St</div>
              <div className="text-xs text-gray-500">Analyzed yesterday</div>
            </div>
            <div className="px-3 py-2 text-sm text-gray-600">
              <div className="font-medium">890 26th Ave N</div>
              <div className="text-xs text-gray-500">Added to project</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="p-2 border-t border-gray-200">
        <div className="space-y-1">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                className="w-full flex items-center space-x-3 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors focus-ring"
                data-testid={`nav-${item.id}`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* User Info */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
            <Users className="w-4 h-4 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">User</p>
            <p className="text-xs text-gray-500">Nashville Metro</p>
          </div>
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