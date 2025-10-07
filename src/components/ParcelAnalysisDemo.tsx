// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React, { useState } from 'react';
import { useParcelAnalysis } from '../hooks/useParcelAnalysis';
import { GeoJSONGeometry } from '../types/parcel';
import { SupabaseIntegrationExample } from './SupabaseIntegrationExample';

interface ParcelAnalysisDemoProps {
  className?: string;
}

export function ParcelAnalysisDemo({ className = '' }: ParcelAnalysisDemoProps) {
  const [parcelId, setParcelId] = useState('47037'); // Default test parcel ID
  const [customPadGeometry, setCustomPadGeometry] = useState<string>('');
  const [customParkingGeometry, setCustomParkingGeometry] = useState<string>('');
  const [showIntegrationExample, setShowIntegrationExample] = useState(false);
  
  const {
    // Data
    parcel,
    envelope,
    score,
    analysisResult,
    
    // Loading states
    isLoadingParcel,
    isLoadingEnvelope,
    isLoadingScore,
    isAnalyzing,
    
    // Error states
    error,
    parcelError,
    envelopeError,
    scoreError,
    
    // Validation
    isValidParcelId,
    isValidatingParcelId,
    
    // Actions
    fetchParcel,
    calculateEnvelope,
    scorePad,
    analyzeParcel,
    validateParcelId,
    clearData,
    clearErrors,
    reset
  } = useParcelAnalysis();

  // Parse custom geometry inputs
  const parseGeometry = (geometryString: string): GeoJSONGeometry | null => {
    if (!geometryString.trim()) return null;
    
    try {
      return JSON.parse(geometryString);
    } catch (err) {
      console.error('Invalid geometry JSON:', err);
      return null;
    }
  };

  const handleAnalyzeParcel = async () => {
    const padGeometry = parseGeometry(customPadGeometry);
    const parkingGeometry = parseGeometry(customParkingGeometry);
    
    await analyzeParcel(parcelId, padGeometry || undefined, parkingGeometry);
  };

  const handleScorePad = async () => {
    if (!envelope) {
      alert('Please calculate envelope first');
      return;
    }
    
    const padGeometry = parseGeometry(customPadGeometry) || envelope.geometry;
    const parkingGeometry = parseGeometry(customParkingGeometry);
    
    await scorePad(parcelId, padGeometry, parkingGeometry);
  };

  return (
    <div className={`p-6 bg-white rounded-lg shadow-lg ${className}`}>
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        🏗️ Parcel Analysis Demo
      </h2>
      
      {/* Input Controls */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Parcel ID
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={parcelId}
              onChange={(e) => setParcelId(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter parcel ID (e.g., 47037)"
            />
            <button
              onClick={() => validateParcelId(parcelId)}
              disabled={isValidatingParcelId}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {isValidatingParcelId ? 'Validating...' : 'Validate'}
            </button>
          </div>
          {isValidParcelId && (
            <p className="text-green-600 text-sm mt-1">✅ Valid parcel ID</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Custom Pad Geometry (GeoJSON - optional)
          </label>
          <textarea
            value={customPadGeometry}
            onChange={(e) => setCustomPadGeometry(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder='{"type": "Polygon", "coordinates": [[[x1, y1], [x2, y2], ...]]}'
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Custom Parking Geometry (GeoJSON - optional)
          </label>
          <textarea
            value={customParkingGeometry}
            onChange={(e) => setCustomParkingGeometry(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder='{"type": "Polygon", "coordinates": [[[x1, y1], [x2, y2], ...]]}'
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => fetchParcel(parcelId)}
          disabled={isLoadingParcel || !parcelId}
          className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
        >
          {isLoadingParcel ? 'Loading...' : '1. Fetch Parcel'}
        </button>
        
        <button
          onClick={() => calculateEnvelope(parcelId)}
          disabled={isLoadingEnvelope || !parcelId}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoadingEnvelope ? 'Calculating...' : '2. Get Envelope'}
        </button>
        
        <button
          onClick={handleScorePad}
          disabled={isLoadingScore || !envelope}
          className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
        >
          {isLoadingScore ? 'Scoring...' : '3. Score Pad'}
        </button>
        
        <button
          onClick={handleAnalyzeParcel}
          disabled={isAnalyzing || !parcelId}
          className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50"
        >
          {isAnalyzing ? 'Analyzing...' : '🚀 Full Analysis'}
        </button>
        
        <button
          onClick={reset}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
        >
          Reset
        </button>
      </div>

      {/* Error Display */}
      {(error || parcelError || envelopeError || scoreError) && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <h3 className="text-red-800 font-medium mb-2">Errors:</h3>
          {error && <p className="text-red-700 text-sm">General: {error}</p>}
          {parcelError && <p className="text-red-700 text-sm">Parcel: {parcelError}</p>}
          {envelopeError && <p className="text-red-700 text-sm">Envelope: {envelopeError}</p>}
          {scoreError && <p className="text-red-700 text-sm">Score: {scoreError}</p>}
        </div>
      )}

      {/* Results Display */}
      <div className="space-y-6">
        {/* Parcel Data */}
        {parcel && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <h3 className="text-green-800 font-medium mb-3">📦 Parcel Data</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">ID:</span> {parcel.parcel_id}
              </div>
              <div>
                <span className="font-medium">Address:</span> {parcel.address}
              </div>
              <div>
                <span className="font-medium">Size:</span> {parcel.sqft?.toLocaleString()} sq ft
              </div>
              <div>
                <span className="font-medium">Zoning:</span> {parcel.zoning}
              </div>
              <div>
                <span className="font-medium">Max FAR:</span> {parcel.max_far || 'N/A'}
              </div>
              <div>
                <span className="font-medium">Max Density:</span> {parcel.max_density_du_per_acre || 'N/A'} DU/acre
              </div>
            </div>
          </div>
        )}

        {/* Envelope Data */}
        {envelope && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="text-blue-800 font-medium mb-3">🏗️ Buildable Envelope</h3>
            <div className="text-sm text-blue-700">
              <p><span className="font-medium">Geometry Type:</span> {envelope.type}</p>
              <p><span className="font-medium">Coordinates:</span> Available</p>
              <details className="mt-2">
                <summary className="cursor-pointer font-medium">View Geometry</summary>
                <pre className="mt-2 text-xs bg-blue-100 p-2 rounded overflow-auto max-h-32">
                  {JSON.stringify(envelope, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}

        {/* Score Data */}
        {score && (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-md">
            <h3 className="text-purple-800 font-medium mb-3">📊 Pad Score</h3>
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <span className="font-medium">Score:</span> {score.score.toFixed(3)}
              </div>
              <div>
                <span className="font-medium">Pad Area:</span> {score.pad_sf.toLocaleString()} sq ft
              </div>
              <div>
                <span className="font-medium">Envelope Area:</span> {score.env_sf.toLocaleString()} sq ft
              </div>
              <div>
                <span className="font-medium">Coverage:</span> {(score.coverage * 100).toFixed(1)}%
              </div>
            </div>
            
            <div className="mb-4">
              <h4 className="font-medium text-purple-700 mb-2">Compliance Checks:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className={score.far_ok ? 'text-green-600' : 'text-red-600'}>
                  FAR: {score.far_ok ? '✅ OK' : '❌ Violation'}
                </div>
                <div className={score.parking_ok ? 'text-green-600' : 'text-red-600'}>
                  Parking: {score.parking_ok ? '✅ OK' : '❌ Violation'}
                </div>
                <div className={score.envelope_ok ? 'text-green-600' : 'text-red-600'}>
                  Envelope: {score.envelope_ok ? '✅ OK' : '❌ Violation'}
                </div>
                <div>
                  Stalls: {score.stalls}/{score.stalls_needed}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Complete Analysis Result */}
        {analysisResult && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-md">
            <h3 className="text-orange-800 font-medium mb-3">🚀 Complete Analysis Result</h3>
            <div className="text-sm text-orange-700">
              <p><span className="font-medium">Analysis Date:</span> {analysisResult.analysis_date.toLocaleString()}</p>
              <p><span className="font-medium">Parcel ID:</span> {analysisResult.parcel.parcel_id}</p>
              <p><span className="font-medium">Final Score:</span> {analysisResult.score.score.toFixed(3)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Integration Example Toggle */}
      <div className="mt-6">
        <button
          onClick={() => setShowIntegrationExample(!showIntegrationExample)}
          className="px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600"
        >
          {showIntegrationExample ? 'Hide' : 'Show'} Integration Example
        </button>
      </div>

      {/* Integration Example */}
      {showIntegrationExample && (
        <div className="mt-6">
          <SupabaseIntegrationExample />
        </div>
      )}

      {/* Usage Instructions */}
      <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-md">
        <h3 className="text-gray-800 font-medium mb-3">📋 Usage Instructions</h3>
        <div className="text-sm text-gray-600 space-y-2">
          <p><strong>1. Fetch Parcel:</strong> Retrieves parcel data from the planner_join table</p>
          <p><strong>2. Get Envelope:</strong> Calculates buildable envelope using get_buildable_envelope RPC</p>
          <p><strong>3. Score Pad:</strong> Scores a pad/polygon using score_pad RPC</p>
          <p><strong>Full Analysis:</strong> Runs all three steps in sequence</p>
          <p><strong>Custom Geometry:</strong> Provide GeoJSON polygons to score custom pads/parking areas</p>
        </div>
      </div>
    </div>
  );
}
