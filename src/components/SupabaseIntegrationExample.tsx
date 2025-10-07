// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React, { useState } from 'react';
import { parcelAnalysisService } from '../services/parcelAnalysis';

/**
 * Example component demonstrating the exact Supabase integration workflow
 * as specified in the frontend wiring checklist
 */
export function SupabaseIntegrationExample() {
  const [parcelId, setParcelId] = useState('47037');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runExample = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      console.log('🚀 Running Supabase Integration Example...');
      
      // Step 1: Fetch the parcel + envelope + score (as per checklist)
      const { data: parcel } = await parcelAnalysisService.fetchParcelData(parcelId);
      console.log('📦 Parcel data:', parcel);

      if (!parcel) {
        throw new Error('No parcel data found');
      }

      // Step 2: Envelope RPC
      const env = await parcelAnalysisService.getBuildableEnvelope(parcel.parcel_id);
      console.log('🏗️ Envelope data:', env);

      // Step 3: Score RPC
      const score = await parcelAnalysisService.scorePad(
        parcel.parcel_id,
        env || null, // Use envelope geometry as pad
        null // No parking geometry
      );
      console.log('📊 Score data:', score);

      setResults({
        parcel,
        envelope: env,
        score
      });

    } catch (err) {
      console.error('❌ Error in example:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">
        🔗 Supabase Integration Example
      </h2>
      
      <p className="text-gray-600 mb-4">
        This demonstrates the exact workflow from your frontend wiring checklist:
      </p>
      
      <div className="bg-gray-100 p-4 rounded-md mb-4 font-mono text-sm">
        <div className="text-green-600">// Example: fetch the parcel + envelope + score</div>
        <div className="text-blue-600">const {`{ data: parcel }`} = await supabase.from("planner_join")</div>
        <div className="text-blue-600">  .select("*")</div>
        <div className="text-blue-600">  .eq("parcel_id", "47037")</div>
        <div className="text-blue-600">  .single();</div>
        <br />
        <div className="text-green-600">// Envelope RPC</div>
        <div className="text-blue-600">const {`{ data: env }`} = await supabase.rpc("get_buildable_envelope", {`{ p_parcel_id: parcel.parcel_id }`});</div>
        <br />
        <div className="text-green-600">// Score RPC</div>
        <div className="text-blue-600">const {`{ data: score }`} = await supabase.rpc("score_pad", {`{`}</div>
        <div className="text-blue-600">  p_parcel_id: parcel.parcel_id,</div>
        <div className="text-blue-600">  p_pad_3857: env,   // or any drawn polygon</div>
        <div className="text-blue-600">  p_parking_3857: null</div>
        <div className="text-blue-600">{`}`});</div>
      </div>

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          value={parcelId}
          onChange={(e) => setParcelId(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter parcel ID"
        />
        <button
          onClick={runExample}
          disabled={loading}
          className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Example'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <h3 className="text-red-800 font-medium mb-2">Error:</h3>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {results && (
        <div className="space-y-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <h3 className="text-green-800 font-medium mb-2">✅ Parcel Data</h3>
            <pre className="text-sm text-green-700 overflow-auto max-h-40">
              {JSON.stringify(results.parcel, null, 2)}
            </pre>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="text-blue-800 font-medium mb-2">🏗️ Envelope Data</h3>
            <pre className="text-sm text-blue-700 overflow-auto max-h-40">
              {JSON.stringify(results.envelope, null, 2)}
            </pre>
          </div>

          <div className="p-4 bg-purple-50 border border-purple-200 rounded-md">
            <h3 className="text-purple-800 font-medium mb-2">📊 Score Data</h3>
            <pre className="text-sm text-purple-700 overflow-auto max-h-40">
              {JSON.stringify(results.score, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
