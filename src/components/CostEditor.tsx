import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Lock, Calculator, DollarSign, Building, Zap, AlertTriangle } from 'lucide-react';
import { LineItem, Program } from '../lib/costSchema';
import { DEFAULT_LINE_ITEMS } from '../lib/defaultLineItems';
import { computeBreakdown } from '../lib/computeCosts';

interface CostEditorProps {
  program: Program;
  onChange?: (items: LineItem[]) => void;
  onTotalCostChange?: (tdc: number) => void;
}

export default function CostEditor({ program, onChange, onTotalCostChange }: CostEditorProps) {
  const [items, setItems] = useState<LineItem[]>(DEFAULT_LINE_ITEMS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const breakdown = useMemo(() => {
    const result = computeBreakdown(items, program);
    onTotalCostChange?.(result.tdc);
    return result;
  }, [items, program, onTotalCostChange]);

  const updateItem = (index: number, patch: Partial<LineItem>) => {
    const next = items.slice();
    next[index] = { ...next[index], ...patch };
    setItems(next);
    onChange?.(next);
  };

  const addItem = () => {
    const newItem: LineItem = {
      id: `custom_${Date.now()}`,
      label: 'Custom Item',
      basis: 'fixed',
      value: 0,
      category: 'SOFT'
    };
    const next = [...items, newItem];
    setItems(next);
    onChange?.(next);
  };

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    onChange?.(next);
  };

  const resetToDefaults = () => {
    setItems(DEFAULT_LINE_ITEMS);
    onChange?.(DEFAULT_LINE_ITEMS);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatValue = (item: LineItem) => {
    if (item.basis === 'percent_of_hard' || item.basis === 'percent_of_tdc') {
      return (item.value * 100).toFixed(2) + '%';
    }
    return item.value.toLocaleString();
  };

  const getCategoryColor = (category: LineItem['category']) => {
    switch (category) {
      case 'HARD': return 'bg-blue-50 border-blue-200';
      case 'SITE': return 'bg-green-50 border-green-200';
      case 'FEES': return 'bg-yellow-50 border-yellow-200';
      case 'SOFT': return 'bg-purple-50 border-purple-200';
      case 'CONT': return 'bg-red-50 border-red-200';
      case 'FIN': return 'bg-gray-50 border-gray-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getCategoryIcon = (category: LineItem['category']) => {
    switch (category) {
      case 'HARD': return <Building className="w-4 h-4" />;
      case 'SITE': return <Zap className="w-4 h-4" />;
      case 'FEES': return <DollarSign className="w-4 h-4" />;
      case 'SOFT': return <Calculator className="w-4 h-4" />;
      case 'CONT': return <AlertTriangle className="w-4 h-4" />;
      case 'FIN': return <DollarSign className="w-4 h-4" />;
      default: return <DollarSign className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
          <Calculator className="w-5 h-5" />
          <span>Development Cost Breakdown</span>
        </h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {showAdvanced ? 'Simple View' : 'Advanced'}
          </button>
          <button
            onClick={resetToDefaults}
            className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Program Summary */}
      <div className="bg-gray-50 p-3 rounded-lg">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Buildable SF:</span>
            <div className="font-semibold">{program.buildableSf.toLocaleString()}</div>
          </div>
          {program.units && (
            <div>
              <span className="text-gray-600">Units:</span>
              <div className="font-semibold">{program.units}</div>
            </div>
          )}
          <div>
            <span className="text-gray-600">Lot Size:</span>
            <div className="font-semibold">{Math.round(program.lotSqft / 43560 * 100) / 100} ac</div>
          </div>
        </div>
      </div>

      {/* Cost Items Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wider">
            <div className="col-span-4">Item</div>
            <div className="col-span-2">Basis</div>
            <div className="col-span-2">Value</div>
            <div className="col-span-3 text-right">Amount</div>
            <div className="col-span-1"></div>
          </div>
        </div>
        
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {items.map((item, index) => (
            <div key={item.id} className={`px-4 py-3 ${getCategoryColor(item.category)}`}>
              <div className="grid grid-cols-12 gap-2 items-center">
                {/* Label */}
                <div className="col-span-4 flex items-center space-x-2">
                  {getCategoryIcon(item.category)}
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{item.label}</div>
                    <div className="text-xs text-gray-500">{item.category}</div>
                  </div>
                  {item.locked && <Lock className="w-3 h-3 text-gray-400" />}
                </div>

                {/* Basis */}
                <div className="col-span-2">
                  <select
                    value={item.basis}
                    onChange={(e) => updateItem(index, { basis: e.target.value as UnitBasis })}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus-ring"
                    disabled={item.locked}
                  >
                    <option value="fixed">Fixed $</option>
                    <option value="per_sf">$ / SF</option>
                    <option value="per_unit">$ / Unit</option>
                    <option value="percent_of_hard">% of Hard</option>
                    <option value="percent_of_tdc">% of TDC</option>
                  </select>
                </div>

                {/* Value */}
                <div className="col-span-2">
                  <input
                    type="number"
                    step={item.basis.includes('percent') ? '0.001' : item.basis === 'per_sf' ? '1' : '1000'}
                    value={item.value}
                    onChange={(e) => updateItem(index, { value: Number(e.target.value) })}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus-ring tabular-nums"
                    disabled={item.locked}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {formatValue(item)}
                  </div>
                </div>

                {/* Amount */}
                <div className="col-span-3 text-right">
                  <div className="text-sm font-semibold text-gray-900 tabular-nums">
                    {formatCurrency(breakdown.items.find(bi => bi.id === item.id)?.amount || 0)}
                  </div>
                </div>

                {/* Actions */}
                <div className="col-span-1 flex justify-end">
                  {showAdvanced && !item.locked && (
                    <button
                      onClick={() => removeItem(index)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add Item Button */}
        {showAdvanced && (
          <div className="p-3 border-t border-gray-200 bg-gray-50">
            <button
              onClick={addItem}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Line Item</span>
            </button>
          </div>
        )}
      </div>

      {/* Subtotals */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Cost Summary</h4>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Hard Construction + Demo:</span>
            <span className="font-medium tabular-nums">{formatCurrency(breakdown.subtotals.HARD)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Site Work:</span>
            <span className="font-medium tabular-nums">{formatCurrency(breakdown.subtotals.SITE)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Permit & Tap Fees:</span>
            <span className="font-medium tabular-nums">{formatCurrency(breakdown.subtotals.FEES)}</span>
          </div>
          <div className="flex justify-between text-sm border-t pt-2">
            <span className="text-gray-600">Total Soft Costs:</span>
            <span className="font-medium tabular-nums">{formatCurrency(breakdown.subtotals.SOFT)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Contingency:</span>
            <span className="font-medium tabular-nums">{formatCurrency(breakdown.subtotals.CONT)}</span>
          </div>
          {breakdown.subtotals.FIN > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Interest & Financing:</span>
              <span className="font-medium tabular-nums">{formatCurrency(breakdown.subtotals.FIN)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t-2 pt-3">
            <span>Total Development Cost (TDC):</span>
            <span className="tabular-nums">{formatCurrency(breakdown.tdc)}</span>
          </div>
        </div>
      </div>

      {/* Program Details */}
      <div className="text-xs text-gray-500">
        <div className="flex items-center space-x-4">
          <span>Buildable: {program.buildableSf.toLocaleString()} SF</span>
          {program.units && <span>Units: {program.units}</span>}
          {program.keys && <span>Keys: {program.keys}</span>}
        </div>
      </div>
    </div>
  );
}