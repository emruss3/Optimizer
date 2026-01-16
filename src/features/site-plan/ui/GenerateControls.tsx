import React from 'react';

type GenerateControlsProps = {
  status: 'loading' | 'ready' | 'invalid';
  isGenerating: boolean;
  onGenerate: () => void;
  onGenerateAlternatives: () => void;
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
  onGenerateAlternatives
}) => {
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">{statusCopy[status]}</div>
      <button
        onClick={onGenerate}
        disabled={status !== 'ready' || isGenerating}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {isGenerating ? 'Generating…' : 'Generate Plan'}
      </button>
      <button
        onClick={onGenerateAlternatives}
        disabled={status !== 'ready'}
        className="w-full px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50"
      >
        Generate Alternatives
      </button>
    </div>
  );
};

export default GenerateControls;
