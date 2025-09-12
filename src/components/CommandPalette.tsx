import React, { useState, useEffect, useRef } from 'react';
import { Dialog, Transition, Combobox } from '@headlessui/react';
import { 
  Search, MapPin, Building2, Users, Calculator, 
  TrendingUp, FileText, Settings, ArrowRight,
  Clock, Star, Zap
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'parcel' | 'project' | 'user' | 'action' | 'navigation';
  icon: React.ReactNode;
  action: () => void;
  keyboard?: string;
  priority?: number;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CommandItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentItems, setRecentItems] = useState<CommandItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent/popular items on mount
  useEffect(() => {
    loadDefaultItems();
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Search with debouncing
  useEffect(() => {
    if (query.length < 2) {
      setItems(getDefaultItems());
      return;
    }

    const timeoutId = setTimeout(() => {
      searchItems(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const loadDefaultItems = () => {
    const defaultItems = getDefaultItems();
    setItems(defaultItems);
    
    // Load recent items from localStorage
    try {
      const stored = localStorage.getItem('command-palette-recent');
      if (stored) {
        const recent = JSON.parse(stored);
        setRecentItems(recent.slice(0, 5));
      }
    } catch (error) {
      console.warn('Failed to load recent items:', error);
    }
  };

  const getDefaultItems = (): CommandItem[] => [
    // Navigation
    {
      id: 'nav-map',
      title: 'Go to Map View',
      category: 'navigation',
      icon: <MapPin className="w-4 h-4" />,
      action: () => { /* Navigate to map */ onClose(); },
      keyboard: '⌘1'
    },
    {
      id: 'nav-projects',
      title: 'Go to Projects',
      category: 'navigation', 
      icon: <Building2 className="w-4 h-4" />,
      action: () => { /* Navigate to projects */ onClose(); },
      keyboard: '⌘2'
    },
    {
      id: 'nav-analysis',
      title: 'Go to Analysis',
      category: 'navigation',
      icon: <Calculator className="w-4 h-4" />,
      action: () => { /* Navigate to analysis */ onClose(); },
      keyboard: '⌘3'
    },
    
    // Actions
    {
      id: 'action-create-project',
      title: 'Create New Project',
      category: 'action',
      icon: <Building2 className="w-4 h-4" />,
      action: () => { /* Create project */ onClose(); }
    },
    {
      id: 'action-export-pdf',
      title: 'Export Current Project as PDF',
      category: 'action',
      icon: <FileText className="w-4 h-4" />,
      action: () => { /* Export PDF */ onClose(); }
    },
    {
      id: 'action-optimize-massing',
      title: 'Optimize Building Massing',
      category: 'action',
      icon: <Zap className="w-4 h-4" />,
      action: () => { /* Optimize massing */ onClose(); }
    }
  ];

  const searchItems = async (searchQuery: string) => {
    setLoading(true);
    
    try {
      const results: CommandItem[] = [];
      
      // Search parcels using pg_trgm similarity
      if (supabase) {
        const { data: parcels } = await supabase
          .from('parcels')
          .select('ogc_fid, parcelnumb, address, zoning, landval')
          .or(`address.ilike.%${searchQuery}%,parcelnumb.ilike.%${searchQuery}%`)
          .limit(10);

        if (parcels) {
          parcels.forEach(parcel => {
            results.push({
              id: `parcel-${parcel.ogc_fid}`,
              title: parcel.address || 'Unknown Address',
              subtitle: `${parcel.parcelnumb} • ${parcel.zoning}`,
              category: 'parcel',
              icon: <MapPin className="w-4 h-4" />,
              action: () => {
                // Navigate to parcel and select it
                onClose();
                // TODO: Implement parcel selection
              }
            });
          });
        }

        // Search projects
        const { data: projects } = await supabase
          .from('project_parcels')
          .select('project_id')
          .limit(5);

        // Mock project search results
        if (searchQuery.toLowerCase().includes('demo')) {
          results.push({
            id: 'project-demo',
            title: 'Demo Project',
            subtitle: '5 parcels • Nashville',
            category: 'project',
            icon: <Building2 className="w-4 h-4" />,
            action: () => {
              // Switch to demo project
              onClose();
            }
          });
        }
      }

      // Add action items that match search
      const actionItems = getDefaultItems().filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category === 'action'
      );
      
      results.push(...actionItems);

      setItems(results);
    } catch (error) {
      console.error('Search error:', error);
      setItems(getDefaultItems());
    } finally {
      setLoading(false);
    }
  };

  const executeItem = (item: CommandItem) => {
    // Add to recent items
    const newRecent = [item, ...recentItems.filter(r => r.id !== item.id)].slice(0, 5);
    setRecentItems(newRecent);
    
    try {
      localStorage.setItem('command-palette-recent', JSON.stringify(newRecent));
    } catch (error) {
      console.warn('Failed to save recent items:', error);
    }

    // Execute action
    item.action();
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'parcel': return <MapPin className="w-4 h-4 text-blue-600" />;
      case 'project': return <Building2 className="w-4 h-4 text-green-600" />;
      case 'user': return <Users className="w-4 h-4 text-purple-600" />;
      case 'action': return <Zap className="w-4 h-4 text-orange-600" />;
      case 'navigation': return <ArrowRight className="w-4 h-4 text-gray-600" />;
      default: return <Search className="w-4 h-4 text-gray-600" />;
    }
  };

  const groupedItems = items.reduce((groups, item) => {
    if (!groups[item.category]) {
      groups[item.category] = [];
    }
    groups[item.category].push(item);
    return groups;
  }, {} as Record<string, CommandItem[]>);

  return (
    <Transition show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center p-4 pt-[10vh]">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
                <Combobox value={null} onChange={executeItem}>
                  {/* Search Input */}
                  <div className="relative">
                    <div className="flex items-center px-4 py-4 border-b border-gray-200">
                      <Search className="w-5 h-5 text-gray-400 mr-3" />
                      <Combobox.Input
                        ref={inputRef}
                        className="flex-1 bg-transparent outline-none text-lg placeholder-gray-500"
                        placeholder="Search parcels, projects, or run commands..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      {loading && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      )}
                    </div>
                  </div>

                  {/* Results */}
                  <Combobox.Options className="max-h-96 overflow-y-auto py-2" static>
                    {/* Recent Items (when no query) */}
                    {query.length === 0 && recentItems.length > 0 && (
                      <div className="px-4 pb-2">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>Recent</span>
                        </h3>
                        {recentItems.map((item) => (
                          <CommandItem key={`recent-${item.id}`} item={item} />
                        ))}
                      </div>
                    )}

                    {/* Grouped Results */}
                    {Object.entries(groupedItems).map(([category, categoryItems]) => (
                      <div key={category} className="px-4 pb-2">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                          {getCategoryIcon(category)}
                          <span>{category}</span>
                          <span className="ml-1 bg-gray-200 text-gray-700 px-1 rounded text-xs">
                            {categoryItems.length}
                          </span>
                        </h3>
                        {categoryItems.map((item) => (
                          <CommandItem key={item.id} item={item} />
                        ))}
                      </div>
                    ))}

                    {/* Empty State */}
                    {items.length === 0 && query.length > 0 && !loading && (
                      <div className="px-4 py-8 text-center text-gray-500">
                        <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No results found for "{query}"</p>
                        <p className="text-xs mt-1">
                          Try searching for addresses, parcel numbers, or project names
                        </p>
                      </div>
                    )}
                  </Combobox.Options>
                </Combobox>

                {/* Footer */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="flex items-center space-x-1">
                        <kbd className="px-1 py-0.5 bg-gray-200 rounded">↑↓</kbd>
                        <span>Navigate</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <kbd className="px-1 py-0.5 bg-gray-200 rounded">⏎</kbd>
                        <span>Select</span>
                      </span>
                    </div>
                    <span className="flex items-center space-x-1">
                      <kbd className="px-1 py-0.5 bg-gray-200 rounded">Esc</kbd>
                      <span>Close</span>
                    </span>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

// Command Item Component
function CommandItem({ item }: { item: CommandItem }) {
  return (
    <Combobox.Option
      key={item.id}
      value={item}
      className={({ active }) =>
        `flex items-center px-3 py-2 rounded-lg cursor-pointer transition-colors ${
          active ? 'bg-blue-50 text-blue-900' : 'text-gray-900'
        }`
      }
    >
      {({ active }) => (
        <>
          <div className={`flex-shrink-0 mr-3 ${active ? 'text-blue-600' : 'text-gray-400'}`}>
            {item.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{item.title}</p>
            {item.subtitle && (
              <p className="text-sm text-gray-500 truncate">{item.subtitle}</p>
            )}
          </div>
          {item.keyboard && (
            <div className="flex-shrink-0 ml-3">
              <kbd className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                {item.keyboard}
              </kbd>
            </div>
          )}
          {active && (
            <ArrowRight className="w-4 h-4 text-blue-600 ml-2" />
          )}
        </>
      )}
    </Combobox.Option>
  );
}