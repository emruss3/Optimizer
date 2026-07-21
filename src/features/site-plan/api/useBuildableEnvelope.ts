import { useEffect, useRef, useState } from 'react';
import type { SelectedParcel } from '../../../types/parcel';
import type { Polygon } from 'geojson';
import { normalizeToPolygon } from '../../../engine/geometry';
import { feature4326To3857 } from '../../../utils/reproject';
import { feetToMeters } from '../../../engine/units';
import { compilePlannerContext } from './plannerContext';
import { defaultUseFromZoningBase } from './designContext';
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

export const useBuildableEnvelope = (parcel?: SelectedParcel | null, frontageBearingDeg?: number | null) => {
  const [status, setStatus] = useState<EnvelopeStatus>('loading');
  const [envelope, setEnvelope] = useState<any>(null);
  const [rpcMetrics, setRpcMetrics] = useState<RpcMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edgeClassifications, setEdgeClassifications] = useState<EdgeClassification[]>([]);
  const ogcFidRef = useRef<number | null>(null);

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

    // NOTE: no run-once guard. StrictMode mounts run the effect twice; the
    // old didRunRef guard made the SECOND run bail while the FIRST run's
    // cleanup had already cancelled its setState — leaving status stuck on
    // 'loading' forever in dev. The cancelled flag alone is correct.
    ogcFidRef.current = parcelId;

    let cancelled = false;
    setStatus('loading');

    // Envelope basis: the COMPILED CONTEXT (planner_context_v2). The legacy
    // get_parcel_buildable_envelope RPC carried projection-bugged 3857 math
    // and cost 2.3–5s per call; the compiled brief already has ordinance
    // setbacks, FAR, and a buildable envelope — and the promise cache means
    // this shares the exact compile the workspace makes (density-first use),
    // so this is effectively free.
    const compileUse = defaultUseFromZoningBase(parcel.zoning) ?? 'multi_family';
    compilePlannerContext(parcelId, compileUse)
      .then((resp) => {
        if (cancelled) return;

        const brief = resp?.solver_brief;
        if (!brief) {
          setStatus('invalid');
          setError('Planner context compile failed — no solver brief for the buildable envelope.');
          return;
        }

        const hc = brief.hard_constraints ?? {};
        // Ordinance setbacks from the brief (typology defaults as last resort)
        const setbacksFt = {
          front: hc.front_setback_ft ?? 20,
          side: hc.side_setback_ft ?? 10,
          rear: hc.rear_setback_ft ?? 20,
        };

        // Brief envelope is WGS84 GeoJSON → the canvas frame is 3857 metres.
        let briefEnvelope3857: Polygon | null = null;
        try {
          const raw = brief.geometry?.buildable_envelope as Polygon | undefined;
          if (raw?.coordinates?.[0]?.length >= 4) {
            briefEnvelope3857 = normalizeToPolygon(feature4326To3857(raw) as Polygon);
          }
        } catch {
          briefEnvelope3857 = null;
        }

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
        // (longest-edge = street frontage heuristic until real road data)
        let improvedEnvelope: Polygon | null = null;
        let edgeClasses: EdgeClassification[] = [];

        if (parcelPoly3857) {
          edgeClasses = classifyParcelEdges(parcelPoly3857, [], frontageBearingDeg ?? null);

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

        // The variable-setback envelope (built from the brief's ordinance
        // values) is authoritative; the brief's own envelope is the fallback.
        const finalEnvelope = improvedEnvelope ?? briefEnvelope3857;
        if (!finalEnvelope) {
          setStatus('invalid');
          setError('No buildable envelope could be derived from the compiled context.');
          return;
        }

        setEdgeClassifications(edgeClasses);
        setEnvelope(finalEnvelope);
        setRpcMetrics({
          setbacks: {
            front: setbacksFt.front,
            side: setbacksFt.side,
            rear: setbacksFt.rear,
          },
          edges: edgeClasses,
          hasZoning: hc.max_far != null && hc.max_far > 0,
        });
        setStatus('ready');
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('invalid');
          const errorMsg = err instanceof Error ? err.message : String(err);
          setError(errorMsg);
          console.error('❌ [useBuildableEnvelope] Failed to derive envelope from context:', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [parcel?.ogc_fid, frontageBearingDeg]);

  return {
    status,
    envelope,
    rpcMetrics,
    edgeClassifications,
    error,
  };
};
