import { useEffect, useRef, useState } from 'react';
import { getEnvelope } from '../../../api/fetchEnvelope';
import { fetchNearbyRoads } from '../../../api/fetchNearbyRoads';
import type { SelectedParcel } from '../../../types/parcel';
import type { Polygon } from 'geojson';
import { normalizeToPolygon } from '../../../engine/geometry';
import { feature4326To3857 } from '../../../utils/reproject';
import { feetToMeters } from '../../../engine/units';
import {
  classifyParcelEdges,
  applyVariableSetbacks,
  type EdgeClassification,
  type SetbackValues,
} from '../../../engine/setbacks';

type EnvelopeStatus = 'loading' | 'ready' | 'invalid';

type RpcMetrics = {
  areaSqft?: number;
  setbacks?: {
    front?: number;
    side?: number;
    rear?: number;
  };
  edges?: unknown;
  hasZoning?: boolean;
};

export const useBuildableEnvelope = (parcel?: SelectedParcel | null) => {
  const [status, setStatus] = useState<EnvelopeStatus>('loading');
  const [envelope, setEnvelope] = useState<any>(null);
  const [rpcMetrics, setRpcMetrics] = useState<RpcMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edgeClassifications, setEdgeClassifications] = useState<EdgeClassification[]>([]);
  const ogcFidRef = useRef<number | null>(null);
  const didRunRef = useRef(false);

  useEffect(() => {
    if (!parcel?.ogc_fid) {
      setStatus('invalid');
      return;
    }

    const parcelId = Number(parcel.ogc_fid);
    if (Number.isNaN(parcelId)) {
      setStatus('invalid');
      return;
    }

    if (import.meta.env.DEV) {
      if (didRunRef.current && ogcFidRef.current === parcelId) {
        return;
      }
      didRunRef.current = true;
    }

    if (ogcFidRef.current === parcelId) {
      return;
    }
    ogcFidRef.current = parcelId;

    let cancelled = false;
    setStatus('loading');

    // Fetch envelope AND nearby roads in parallel
    Promise.all([
      getEnvelope(parcelId),
      fetchNearbyRoads(parcelId, 60), // 60m ≈ 200ft
    ])
      .then(([env, roads]) => {
        if (cancelled) return;

        if (!env?.buildable_geom) {
          setStatus('invalid');
          setError('Supabase RPC get_parcel_buildable_envelope returned null. Run SQL audit.');
          console.warn('⚠️ [useBuildableEnvelope] RPC returned null buildable_geom. Check: supabase/sql/get_parcel_buildable_envelope.sql and AUDIT_BACKEND_STATUS.sql');
          return;
        }

        // Determine setback values from the RPC response
        const setbacksFt = {
          front: env.setbacks_applied?.front ?? env.front_setback_ft ?? 20,
          side: env.setbacks_applied?.side ?? env.side_setback_ft ?? 10,
          rear: env.setbacks_applied?.rear ?? env.rear_setback_ft ?? 20,
        };

        // Convert the parcel's original geometry to 3857 for edge classification
        let parcelPoly3857: Polygon | null = null;
        try {
          const parcelGeom = parcel.geometry;
          if (parcelGeom) {
            const geom = parcelGeom as Polygon;
            const coords = geom.type === 'Polygon' ? geom.coordinates[0] : null;
            const is3857 = coords && (Math.abs(coords[0]?.[0] ?? 0) > 1000 || Math.abs(coords[0]?.[1] ?? 0) > 1000);
            const reprojected = is3857 ? geom : (feature4326To3857(geom) as Polygon);
            parcelPoly3857 = normalizeToPolygon(reprojected);
          }
        } catch (e) {
          console.warn('[useBuildableEnvelope] Could not reproject parcel geometry:', e);
        }

        // Classify edges & apply variable setbacks if we have parcel geometry
        let improvedEnvelope: Polygon | null = null;
        let edgeClasses: EdgeClassification[] = [];

        if (parcelPoly3857 && roads.length > 0) {
          const roadGeoms = roads.map((r) => ({
            geom: r.geom,
            name: r.name ?? undefined,
          }));

          edgeClasses = classifyParcelEdges(parcelPoly3857, roadGeoms);

          const setbacksM: SetbackValues = {
            front: feetToMeters(setbacksFt.front),
            side: feetToMeters(setbacksFt.side),
            rear: feetToMeters(setbacksFt.rear),
          };

          improvedEnvelope = applyVariableSetbacks(
            parcelPoly3857,
            edgeClasses,
            setbacksM
          );
        } else if (parcelPoly3857) {
          // No roads found — still classify edges using longest-edge fallback
          edgeClasses = classifyParcelEdges(parcelPoly3857, []);

          const setbacksM: SetbackValues = {
            front: feetToMeters(setbacksFt.front),
            side: feetToMeters(setbacksFt.side),
            rear: feetToMeters(setbacksFt.rear),
          };

          improvedEnvelope = applyVariableSetbacks(
            parcelPoly3857,
            edgeClasses,
            setbacksM
          );
        }

        // Use the improved envelope if valid, otherwise fall back to RPC envelope
        const finalEnvelope = improvedEnvelope ?? env.buildable_geom;

        setEdgeClassifications(edgeClasses);
        setEnvelope(finalEnvelope);
        setRpcMetrics({
          areaSqft: env.area_sqft,
          setbacks: env.setbacks_applied ?? {
            front: setbacksFt.front,
            side: setbacksFt.side,
            rear: setbacksFt.rear,
          },
          edges: edgeClasses.length > 0 ? edgeClasses : env.edge_types,
          hasZoning: env.far_max !== null && env.far_max > 0,
        });
        setStatus('ready');
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('invalid');
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError(errorMsg);
          console.error('❌ [useBuildableEnvelope] Failed to fetch envelope:', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [parcel?.ogc_fid]);

  return {
    status,
    envelope,
    rpcMetrics,
    edgeClassifications,
    error,
  };
};
