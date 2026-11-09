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
  // The scope's P0.3 (2026-11-09): a search has three terminal states, not
  // one. Loading, no match and a failed request each read differently; a
  // result that arrives after the query changed is dropped (the sequence).
  const searchSeqRef = useRef(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

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
    setOpenError(null);
    if (query.length < 2) {
      searchSeqRef.current += 1; // a result for an older query must not land
      setSearchError(null);
      setLoading(false);
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
    
    // Load recent items from localStorage. Icons and actions don't survive
    // JSON, so stored entries are rehydrated BY ID against the live command
    // list; stale/malformed entries (which crashed the option renderer with
    // null ids) are dropped.
    try {
      const stored = localStorage.getItem('command-palette-recent');
      if (stored) {
        const recent = JSON.parse(stored);
        if (Array.isArray(recent)) {
          const rehydrated = recent
            .map((r) => (r && typeof r.id === 'string' ? defaultItems.find((d) => d.id === r.id) : undefined))
            .filter((d): d is CommandItem => !!d);
          setRecentItems(rehydrated.slice(0, 5));
        }
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

  /**
   * Open a search hit the way a map click does: the full parcel row from
   * `get_parcel_by_id` (geometry included), then the same `openParcelDrawer`
   * path App.tsx validates and the map centres on. The palette closes only
   * once the drawer has what it needs; a failed fetch stays on screen.
   */
  const openParcel = async (ogcFid: number, address: string) => {
    if (!supabase) {
      setOpenError(`Could not open ${address}: the database client is not configured.`);
      return;
    }
    setOpening(address);
    setOpenError(null);
    try {
      const { data, error } = await supabase.rpc('get_parcel_by_id', { p_ogc_fid: ogcFid });
      if (error) throw new Error(error.message ?? String(error));
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
      const geometry = row?.geometry as { coordinates?: unknown[] } | undefined;
      if (!row || !geometry || !Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
        throw new Error('the parcel record has no geometry');
      }
      const id = row.ogc_fid ?? row.id ?? ogcFid;
      const parcel = {
        ogc_fid: String(id),
        parcelnumb: row.parcelnumb ?? null,
        address: row.address ?? address,
        zoning: row.zoning ?? null,
        sqft: row.sqft ?? null,
        geometry: row.geometry,
        primary_owner: row.primary_owner ?? row.owner ?? null,
        owner: row.owner ?? row.primary_owner ?? null,
        usedesc: row.usedesc ?? null,
        yearbuilt: row.yearbuilt ?? null,
        deeded_acres: row.deeded_acres ?? null,
        parval: row.parval ?? null,
        landval: row.landval ?? null,
        improvval: row.improvval ?? null,
        // the ordinance caps the Site Planner reads for a use the compiler cannot type
        max_far: row.max_far ?? null,
        min_front_setback_ft: row.min_front_setback_ft ?? null,
        min_side_setback_ft: row.min_side_setback_ft ?? null,
        min_rear_setback_ft: row.min_rear_setback_ft ?? null,
        max_impervious_coverage_pct: row.max_impervious_coverage_pct ?? null,
        max_density_du_per_acre: row.max_density_du_per_acre ?? null,
        zoning_description: row.zoning_description ?? null,
        lat: row.lat ?? null,
        lon: row.lon ?? null,
      };
      document.dispatchEvent(new CustomEvent('openParcelDrawer', { detail: parcel }));
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOpenError(`Could not open ${address}: ${msg}`);
    } finally {
      setOpening(null);
    }
  };

  const searchItems = async (searchQuery: string) => {
    const seq = ++searchSeqRef.current;
    const stale = () => seq !== searchSeqRef.current;
    setLoading(true);
    setSearchError(null);

    try {
      const results: CommandItem[] = [];
      
      // Search parcels using pg_trgm similarity
      if (supabase) {
        // PostgREST's filter grammar reads commas and parentheses as syntax
        const term = searchQuery.replace(/[,()]/g, ' ').trim();
        const { data: parcels, error } = await supabase
          .from('parcels')
          .select('ogc_fid, parcelnumb, address, zoning, landval')
          .or(`address.ilike.%${term}%,parcelnumb.ilike.%${term}%`)
          .limit(10);
        if (stale()) return;
        if (error) throw new Error(error.message ?? String(error));

        if (parcels) {
          parcels.forEach(parcel => {
            const address = parcel.address || 'Unknown Address';
            results.push({
              id: `parcel-${parcel.ogc_fid}`,
              title: address,
              subtitle: `${parcel.parcelnumb} • ${parcel.zoning}`,
              category: 'parcel',
              icon: <MapPin className="w-4 h-4" />,
              action: () => { void openParcel(Number(parcel.ogc_fid), address); },
            });
          });
        }

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

      if (stale()) return;
      setItems(results);
    } catch (error) {
      if (stale()) return;
      console.error('Search error:', error);
      // a failed request is not "no results": say so, and keep the commands
      setSearchError(error instanceof Error ? error.message : String(error));
      setItems(getDefaultItems().filter(item => item.category === 'action'));
    } finally {
      if (!stale()) setLoading(false);
    }
  };

  const executeItem = (item: CommandItem | null) => {
    // Headless UI fires onChange(null) when the selection clears — ignore.
    if (!item) return;
    // Add to recent items (persist ids only — icons/actions don't serialize)
    const newRecent = [item, ...recentItems.filter(r => r.id !== item.id)].slice(0, 5);
    setRecentItems(newRecent);
    
    try {
      localStorage.setItem(
        'command-palette-recent',
        JSON.stringify(newRecent.map(({ id, title, category }) => ({ id, title, category })))
      );
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

                    {/* The three terminal states of a search, each its own */}
                    {loading && query.length >= 2 && (
                      <div data-testid="palette-loading" className="px-4 py-3 text-xs text-gray-500">Searching parcels for "{query}"…</div>
                    )}
                    {searchError && !loading && (
                      <div data-testid="palette-search-error" className="mx-4 mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        Parcel search failed: {searchError}. The commands below still work; try the search again.
                      </div>
                    )}
                    {openError && (
                      <div data-testid="palette-open-error" className="mx-4 mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        {openError}
                      </div>
                    )}
                    {opening && (
                      <div data-testid="palette-opening" className="px-4 py-2 text-xs text-gray-500">Opening {opening}…</div>
                    )}
                    {!items.some(i => i.category === 'parcel') && query.length >= 2 && !loading && !searchError && (
                      <div data-testid="palette-no-match" className="px-4 py-8 text-center text-gray-500">
                        <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No parcel matches "{query}"</p>
                        <p className="text-xs mt-1">
                          Try an address or a parcel number, or click the parcel on the map
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
  if (!item) return null;
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