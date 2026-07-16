import React from 'react';

type GenerateControlsProps = {
  status: 'loading' | 'ready' | 'invalid';
  isGenerating: boolean;
  onGenerate: () => void;
  onGenerateAlternatives: () => void;
  /** Brief Phase 2: market-grounded SF lot fit (fails soft if RPC is absent) */
  onGenerateLots?: () => void;
  isGeneratingLots?: boolean;
  lotFitSummary?: string | null;
};

const statusCopy: Record<GenerateControlsProps['status'], string> = {
  loading: 'Loading envelope…',
  ready: 'Ready to generate',
  invalid: 'Invalid parcel data'
};

const GenerateControls: React.FC<GenerateControlsProps> = ({
  status,
  isGenerating,
  onGenerate,
  onGenerateAlternatives,
  onGenerateLots,
  isGeneratingLots,
  lotFitSummary
}) => {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onGenerate}
          disabled={status !== 'ready' || isGenerating}
          className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isGenerating ? 'Generating…' : 'Generate'}
        </button>
        <button
          onClick={onGenerateAlternatives}
          disabled={status !== 'ready'}
          className="px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50"
        >
          Alternatives
        </button>
      </div>
      {status !== 'ready' && (
        <div className="text-xs text-gray-500">{statusCopy[status]}</div>
      )}
      {onGenerateLots && (
        <>
          <button
            onClick={onGenerateLots}
            disabled={isGeneratingLots}
            className="w-full px-3 py-2 text-sm bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 disabled:opacity-50"
          >
            {isGeneratingLots ? 'Fitting lots…' : 'Generate Lot Fit (SF)'}
          </button>
          {lotFitSummary && (
            <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">{lotFitSummary}</p>
          )}
        </>
      )}
    </div>
  );
};

export default GenerateControls;
