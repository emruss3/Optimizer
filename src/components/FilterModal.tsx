import React from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X, Filter, Search, MapPin, DollarSign, Calendar, Building } from 'lucide-react';
import { useUIStore } from '../store/ui';

interface FilterState {
  priceRange: { min: string; max: string };
  sizeRange: { min: string; max: string };
  zoning: string[];
  forSale: boolean;
  yearBuilt: { min: string; max: string };
  address: string;
}

export default function FilterModal() {
  const { filterModalOpen, setFilterModal, zoningFilters, setZoningFilters } = useUIStore();
  
  const [filters, setFilters] = React.useState<FilterState>({
    priceRange: { min: '', max: '' },
    sizeRange: { min: '', max: '' },
    zoning: zoningFilters.activeZones,
    forSale: false,
    yearBuilt: { min: '', max: '' },
    address: '',
  });
  
  const zoningOptions = [
    'RS5', 'RS7.5', 'RS10', 'RS15', 'RS20', 'RS30', 'RS40',
    'R6', 'R8', 'R10', 'R15', 'R20', 'R30',
    'RM2', 'RM4', 'RM6', 'RM9', 'RM15', 'RM20', 'RM40', 'RM60', 'RM80',
    'CN', 'CR', 'CS', 'CA', 'CL', 'CC',
    'MUN', 'MUL', 'MUG'
  ];

  const handleZoningToggle = (zoning: string) => {
    setFilters(prev => ({
      ...prev,
      zoning: prev.zoning.includes(zoning)
        ? prev.zoning.filter(z => z !== zoning)
        : [...prev.zoning, zoning]
    }));
  };

  const resetFilters = () => {
    setFilters({
      priceRange: { min: '', max: '' },
      sizeRange: { min: '', max: '' },
      zoning: [],
      forSale: false,
      yearBuilt: { min: '', max: '' },
      address: '',
    });
  };

  const applyFilters = () => {
    // Apply zoning filters to map
    setZoningFilters({ activeZones: filters.zoning });
    
    // Force immediate map reload with new filters (no debounce)
    setTimeout(() => {
      const mapReloadEvent = new CustomEvent('forceMapReload', { 
      detail: { zoningFilters: filters.zoning } 
      });
      document.dispatchEvent(mapReloadEvent);
    }, 50);
    
    console.log('Applying filters:', filters);
    setFilterModal(false);
  };

  return (
    <Transition show={filterModalOpen} as={React.Fragment}>
      <Dialog
        as="div"
        className="relative z-30"
        onClose={() => setFilterModal(false)}
      >
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
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all" data-testid="filter-modal">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2">
                    <Filter className="w-5 h-5" />
                    <span>Advanced Filters</span>
                  </div>
                  <button
                    onClick={() => setFilterModal(false)}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors focus-ring"
                    data-testid="filter-modal-close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </Dialog.Title>

                <div className="mt-6 space-y-6">
                  {/* Address Search */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <MapPin className="w-4 h-4 inline mr-1" />
                      Address or Location
                    </label>
                    <input
                      type="text"
                      value={filters.address}
                      onChange={(e) => setFilters(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="Search by address, neighborhood, or parcel ID..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-ring"
                      data-testid="address-search"
                    />
                  </div>

                  {/* Price Range */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <DollarSign className="w-4 h-4 inline mr-1" />
                      Price Range
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="number"
                        value={filters.priceRange.min}
                        onChange={(e) => setFilters(prev => ({
                          ...prev,
                          priceRange: { ...prev.priceRange, min: e.target.value }
                        }))}
                        placeholder="Min price"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus-ring"
                        data-testid="min-price"
                      />
                      <input
                        type="number"
                        value={filters.priceRange.max}
                        onChange={(e) => setFilters(prev => ({
                          ...prev,  
                          priceRange: { ...prev.priceRange, max: e.target.value }
                        }))}
                        placeholder="Max price"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus-ring"
                        data-testid="max-price"
                      />
                    </div>
                  </div>

                  {/* Size Range */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Lot Size (sq ft)
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="number"
                        value={filters.sizeRange.min}
                        onChange={(e) => setFilters(prev => ({
                          ...prev,
                          sizeRange: { ...prev.sizeRange, min: e.target.value }
                        }))}
                        placeholder="Min sq ft"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus-ring"
                      />
                      <input
                        type="number"
                        value={filters.sizeRange.max}
                        onChange={(e) => setFilters(prev => ({
                          ...prev,
                          sizeRange: { ...prev.sizeRange, max: e.target.value }
                        }))}
                        placeholder="Max sq ft"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus-ring"
                      />
                    </div>
                  </div>

                  {/* Year Built */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Calendar className="w-4 h-4 inline mr-1" />
                      Year Built
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="number"
                        value={filters.yearBuilt.min}
                        onChange={(e) => setFilters(prev => ({
                          ...prev,
                          yearBuilt: { ...prev.yearBuilt, min: e.target.value }
                        }))}
                        placeholder="From year"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus-ring"
                      />
                      <input
                        type="number"
                        value={filters.yearBuilt.max}
                        onChange={(e) => setFilters(prev => ({
                          ...prev,
                          yearBuilt: { ...prev.yearBuilt, max: e.target.value }
                        }))}
                        placeholder="To year"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus-ring"
                      />
                    </div>
                  </div>

                  {/* Zoning Types */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Building className="w-4 h-4 inline mr-1" />
                      Zoning Types
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {zoningOptions.map((zoning) => (
                        <button
                          key={zoning}
                          onClick={() => handleZoningToggle(zoning)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-colors focus-ring ${
                            filters.zoning.includes(zoning)
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                          data-testid={`zoning-${zoning}`}
                        >
                          {zoning}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* For Sale Toggle */}
                  <div>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={filters.forSale}
                        onChange={(e) => setFilters(prev => ({ ...prev, forSale: e.target.checked }))}
                        className="rounded focus-ring"
                        data-testid="for-sale-toggle"
                      />
                      <span className="text-sm font-medium text-gray-700">For Sale Only</span>
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex justify-between">
                  <button
                    onClick={resetFilters}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus-ring"
                    data-testid="reset-filters"
                  >
                    Reset Filters
                  </button>
                  <div className="space-x-3">
                    <button
                      onClick={() => setFilterModal(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus-ring"
                      data-testid="cancel-filters"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={applyFilters}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus-ring"
                      data-testid="apply-filters"
                    >
                      Apply Filters
                    </button>
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