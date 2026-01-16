import { useEffect, useRef, useState } from 'react';
import { getEnvelope } from '../../../api/fetchEnvelope';
import type { SelectedParcel } from '../../../types/parcel';

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

    getEnvelope(parcelId)
      .then(env => {
        if (cancelled) return;
        if (!env?.buildable_geom) {
          setStatus('invalid');
          return;
        }

        setEnvelope(env.buildable_geom);
        setRpcMetrics({
          areaSqft: env.area_sqft,
          setbacks: env.setbacks_applied,
          edges: env.edge_types,
          hasZoning: env.far_max !== null && env.far_max > 0
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('invalid');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [parcel?.ogc_fid]);

  return {
    status,
    envelope,
    rpcMetrics
  };
};
