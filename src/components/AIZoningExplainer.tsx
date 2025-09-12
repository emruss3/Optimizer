import React, { useState } from 'react';
import { Brain, Lightbulb, AlertTriangle, CheckCircle, Loader, Copy, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AIZoningExplainerProps {
  zoning: string;
  violations?: any[];
  compact?: boolean;
}

interface ZoningExplanation {
  summary: string;
  allowedUses: string[];
  restrictions: string[];
  recommendations: string[];
  violationFixes: string[];
  plainLanguage: string;
}

export default function AIZoningExplainer({ zoning, violations = [], compact = false }: AIZoningExplainerProps) {
  const [explanation, setExplanation] = useState<ZoningExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateExplanation = async () => {
    if (!zoning) return;
    
    setLoading(true);
    setError(null);

    try {
      // Check cache first
      const { data: cached } = await supabase
        .from('ai_explanations')
        .select('explanation')
        .eq('zoning_code', zoning)
        .single();

      if (cached) {
        setExplanation(JSON.parse(cached.explanation));
        setLoading(false);
        return;
      }

      // Call OpenAI via edge function
      const { data, error: funcError } = await supabase.functions.invoke('ai-zoning-explainer', {
        body: {
          zoning,
          violations,
          context: 'Nashville, TN development project'
        }
      });

      if (funcError) throw funcError;

      const aiExplanation: ZoningExplanation = data.explanation;
      setExplanation(aiExplanation);

      // Cache the result
      await supabase
        .from('ai_explanations')
        .upsert({
          zoning_code: zoning,
          explanation: JSON.stringify(aiExplanation)
        });

    } catch (error) {
      console.error('AI explanation error:', error);
      setError('Failed to generate explanation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!explanation) return;
    
    const text = `
Zoning Explanation: ${zoning}

${explanation.plainLanguage}

Allowed Uses:
${explanation.allowedUses.map(use => `• ${use}`).join('\n')}

Key Restrictions:
${explanation.restrictions.map(restriction => `• ${restriction}`).join('\n')}

Recommendations:
${explanation.recommendations.map(rec => `• ${rec}`).join('\n')}

${explanation.violationFixes.length > 0 ? `
Violation Fixes:
${explanation.violationFixes.map(fix => `• ${fix}`).join('\n')}
` : ''}
    `.trim();

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  if (compact) {
    return (
      <button
        onClick={generateExplanation}
        disabled={loading || !zoning}
        className="flex items-center space-x-1 px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-full text-xs font-medium transition-colors disabled:opacity-50"
      >
        {loading ? (
          <Loader className="w-3 h-3 animate-spin" />
        ) : (
          <Brain className="w-3 h-3" />
        )}
        <span>AI Explain</span>
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-gray-900">AI Zoning Explainer</h3>
          </div>
          {!loading && !explanation && (
            <button
              onClick={generateExplanation}
              disabled={!zoning}
              className="flex items-center space-x-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 transition-colors"
            >
              <Brain className="w-4 h-4" />
              <span>Explain {zoning}</span>
            </button>
          )}
          {explanation && (
            <div className="flex space-x-2">
              <button
                onClick={copyToClipboard}
                className={`flex items-center space-x-1 px-3 py-1 rounded-lg transition-colors ${
                  copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span className="text-sm">{copied ? 'Copied!' : 'Copy'}</span>
              </button>
              <button
                onClick={generateExplanation}
                disabled={loading}
                className="flex items-center space-x-1 px-3 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="text-sm">Refresh</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">AI is analyzing {zoning} zoning requirements...</p>
            <p className="text-sm text-gray-500 mt-1">This may take a few seconds</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <p className="text-red-800 font-medium">Error</p>
            </div>
            <p className="text-red-700 mt-2">{error}</p>
            <button
              onClick={generateExplanation}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {explanation && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2 flex items-center space-x-2">
                <Lightbulb className="w-4 h-4" />
                <span>Plain Language Summary</span>
              </h4>
              <p className="text-blue-800 leading-relaxed">{explanation.plainLanguage}</p>
            </div>

            {/* Allowed Uses */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>Allowed Uses</span>
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {explanation.allowedUses.map((use, index) => (
                  <div key={index} className="flex items-center space-x-2 text-sm">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>{use}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Restrictions */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Key Restrictions</span>
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {explanation.restrictions.map((restriction, index) => (
                  <div key={index} className="flex items-center space-x-2 text-sm">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span>{restriction}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                <Lightbulb className="w-4 h-4 text-yellow-600" />
                <span>Development Recommendations</span>
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {explanation.recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start space-x-2 text-sm">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-1.5"></div>
                    <span>{recommendation}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Violation Fixes */}
            {explanation.violationFixes.length > 0 && (
              <div className="bg-red-50 p-4 rounded-lg">
                <h4 className="font-semibold text-red-900 mb-3 flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>How to Fix Current Violations</span>
                </h4>
                <div className="space-y-2">
                  {explanation.violationFixes.map((fix, index) => (
                    <div key={index} className="flex items-start space-x-2 text-sm text-red-800">
                      <div className="w-2 h-2 bg-red-600 rounded-full mt-1.5"></div>
                      <span>{fix}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Getting Started */}
        {!loading && !explanation && !error && (
          <div className="text-center py-8">
            <Brain className="w-12 h-12 text-purple-400 mx-auto mb-4" />
            <h4 className="text-lg font-semibold text-gray-900 mb-2">AI Zoning Analysis</h4>
            <p className="text-gray-600 mb-4">
              Get plain-language explanations of {zoning} zoning requirements and development recommendations.
            </p>
            <button
              onClick={generateExplanation}
              disabled={!zoning}
              className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 transition-colors font-medium"
            >
              Analyze {zoning} Zoning
            </button>
          </div>
        )}
      </div>
    </div>
  );
}