// Drawings for a stock plan, from the facts its listing gives and nothing more.
//
// The catalogue's stock plans are cited, not licensed: the publisher's elevations and floor plans
// stay on the publisher's site (the listing link). What the record does hold is the footprint, the
// porch face, the stories, the parking and where the entry is. From those this draws a dimensioned
// footprint and the massing of the front and side, each labelled for what it is. No rooms, windows
// or facade detail are drawn: the record does not say where they are.
import type { HousingDesignRecord } from './types';

const FLOOR_FT = 9; // plate height a storey is drawn at
const FRAME_FT = 1; // floor framing between storeys
const PITCH = 6 / 12; // roof pitch assumed for the massing
const PORCH_MAX_FT = 8;
const ink = '#344339';
const soft = '#8a968c';
const text = { fontFamily: 'Arial, sans-serif', fill: ink } as const;

type Pt = [number, number];

function ringOf(plan: HousingDesignRecord): Pt[] {
  const floor = plan.footprintsByFloor.find(f => f.floor === 0) ?? plan.footprintsByFloor[0];
  const ring = floor?.ringFt?.length ? floor.ringFt : [[0, 0], [plan.footprint.widthFt, 0], [plan.footprint.widthFt, plan.footprint.depthFt], [0, plan.footprint.depthFt]] as Pt[];
  return ring.map(([x, y]) => [x, y] as Pt);
}

const ft = (v: number) => {
  const whole = Math.floor(v + 1e-6);
  const inches = Math.round((v - whole) * 12);
  return inches === 12 ? `${whole + 1}′` : inches ? `${whole}′-${inches}″` : `${whole}′`;
};

/** The front is the face the porch and entry stand on: the width face, or the depth face. */
function frontSpan(plan: HousingDesignRecord): { front: number; side: number } {
  const { widthFt: w, depthFt: d } = plan.footprint;
  return plan.porchFace === 'depth' ? { front: d, side: w } : { front: w, side: d };
}

export function StockFootprint({ plan }: { plan: HousingDesignRecord }) {
  const ring = ringOf(plan);
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, d = maxY - minY;
  const porchDepth = plan.porchSf && plan.porchSf > 0 ? Math.min(PORCH_MAX_FT, plan.porchSf / Math.max(1, plan.porchFace === 'depth' ? d : w)) : 0;
  const pad = 9;
  // plan north up the page; the front (y = minY) at the bottom, as a site plan reads from the street
  const vbW = w + pad * 2, vbH = d + pad * 2 + porchDepth;
  const X = (x: number) => x - minX + pad;
  const Y = (y: number) => maxY - y + pad;
  const path = ring.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(2)},${Y(p[1]).toFixed(2)}`).join(' ') + ' Z';
  const entry = plan.entry;
  const door = entry.wall === 'front' ? { x: X(minX + entry.alongFt), y: Y(minY) } : entry.wall === 'rear' ? { x: X(maxX - entry.alongFt), y: Y(maxY) } : entry.wall === 'left' ? { x: X(minX), y: Y(minY + entry.alongFt) } : { x: X(maxX), y: Y(maxY - entry.alongFt) };
  return (
    <figure className="home-stock-drawing" data-testid="stock-footprint">
      <svg viewBox={`0 0 ${vbW} ${vbH}`} role="img" aria-label={`Footprint ${ft(w)} by ${ft(d)}`}>
        {porchDepth > 0 && plan.porchFace === 'width' && (
          <rect x={X(minX)} y={Y(minY)} width={w} height={porchDepth} fill="#f5f1e6" stroke={soft} strokeWidth={0.25} strokeDasharray="1 0.6" />
        )}
        {porchDepth > 0 && plan.porchFace === 'depth' && (
          <rect x={X(minX) - porchDepth} y={Y(maxY)} width={porchDepth} height={d} fill="#f5f1e6" stroke={soft} strokeWidth={0.25} strokeDasharray="1 0.6" />
        )}
        <path d={path} fill="#eef0ea" stroke={ink} strokeWidth={0.6} />
        <circle cx={door.x} cy={door.y} r={1.1} fill="#b5502f" />
        <text {...text} x={door.x} y={door.y + (entry.wall === 'front' ? 3.4 + porchDepth : -2)} fontSize={1.9} textAnchor="middle">Entry</text>
        {/* dimensions */}
        <line x1={X(minX)} y1={pad - 4} x2={X(maxX)} y2={pad - 4} stroke={ink} strokeWidth={0.2} />
        <text {...text} x={X(minX) + w / 2} y={pad - 5} fontSize={2.2} textAnchor="middle">{ft(w)}</text>
        <line x1={X(maxX) + 4} y1={Y(maxY)} x2={X(maxX) + 4} y2={Y(minY)} stroke={ink} strokeWidth={0.2} />
        <text {...text} x={X(maxX) + 5.2} y={Y(minY) - d / 2} fontSize={2.2} transform={`rotate(90 ${X(maxX) + 5.2} ${Y(minY) - d / 2})`} textAnchor="middle">{ft(d)}</text>
        <text {...text} x={X(minX) + w / 2} y={vbH - 1.5} fontSize={1.8} textAnchor="middle" style={{ ...text, fill: soft }}>front · street side</text>
      </svg>
      <figcaption>Footprint from the listing{porchDepth > 0 ? ', porch dashed' : ''}. The room layout is in the publisher&rsquo;s plan.</figcaption>
    </figure>
  );
}

/** Front or side massing: walls from the storeys, a gable roof at an assumed 6:12, the entry where the listing puts it. */
export function StockMassing({ plan, view }: { plan: HousingDesignRecord; view: 'front' | 'side' }) {
  const { front, side } = frontSpan(plan);
  const span = view === 'front' ? front : side;
  const stories = Math.max(1, Math.round(plan.stories));
  const wallH = stories * FLOOR_FT + (stories - 1) * FRAME_FT;
  // the ridge runs along the longer side: that side shows the roof as a band, the shorter shows the gable
  const ridgeAlongFront = front >= side;
  const rise = (Math.min(front, side) / 2) * PITCH;
  const gable = view === 'front' ? !ridgeAlongFront : ridgeAlongFront;
  const pad = 6, ground = 1.2;
  const vbW = span + pad * 2, vbH = wallH + rise + pad * 2;
  const X = (x: number) => x + pad;
  const Y = (z: number) => pad + rise + wallH - z;
  const doorAt = view === 'front' && plan.entry.wall === 'front' ? Math.min(span - 2, Math.max(2, plan.entry.alongFt)) : null;
  return (
    <figure className="home-stock-drawing" data-testid={`stock-massing-${view}`}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} role="img" aria-label={`${view === 'front' ? 'Front' : 'Side'} massing, ${ft(span)} wide, ${stories} storey${stories === 1 ? '' : 's'}`}>
        <rect x={X(0)} y={Y(wallH)} width={span} height={wallH} fill="#eef0ea" stroke={ink} strokeWidth={0.4} />
        {gable ? (
          <path d={`M${X(-0.8)},${Y(wallH)} L${X(span / 2)},${Y(wallH + rise)} L${X(span + 0.8)},${Y(wallH)} Z`} fill="#d9dccf" stroke={ink} strokeWidth={0.4} />
        ) : (
          <rect x={X(-0.8)} y={Y(wallH + rise)} width={span + 1.6} height={rise} fill="#d9dccf" stroke={ink} strokeWidth={0.4} />
        )}
        {Array.from({ length: stories - 1 }, (_, i) => (
          <line key={i} x1={X(0)} x2={X(span)} y1={Y((i + 1) * (FLOOR_FT + FRAME_FT))} y2={Y((i + 1) * (FLOOR_FT + FRAME_FT))} stroke={soft} strokeWidth={0.2} strokeDasharray="1 0.8" />
        ))}
        {doorAt != null && <rect x={X(doorAt - 1.5)} y={Y(7)} width={3} height={7} fill="#fff" stroke={ink} strokeWidth={0.3} />}
        <line x1={X(-3)} x2={X(span + 3)} y1={Y(0)} y2={Y(0)} stroke={ink} strokeWidth={0.5} />
        <line x1={X(0)} y1={Y(0) + ground + 1.5} x2={X(span)} y2={Y(0) + ground + 1.5} stroke={ink} strokeWidth={0.2} />
        <text {...text} x={X(span / 2)} y={Y(0) + ground + 3.6} fontSize={2} textAnchor="middle">{ft(span)}</text>
        <text {...text} x={X(span) + 1.5} y={Y(wallH / 2)} fontSize={1.8}>{ft(wallH)}</text>
      </svg>
      <figcaption>{view === 'front' ? 'Front' : 'Side'} massing: {stories} storey{stories === 1 ? '' : 's'} at {FLOOR_FT}′ plates, roof pitch assumed 6:12{doorAt != null ? ', entry from the listing' : ''}.</figcaption>
    </figure>
  );
}

/** The stock card's drawings: footprint, front and side, and where the publisher's own drawings are. */
export function StockDrawings({ plan }: { plan: HousingDesignRecord }) {
  return (
    <section className="home-stock-drawings" data-testid="stock-drawings" aria-label="Drawings from the listing">
      <h4>Footprint and massing</h4>
      <div className="home-stock-drawings-row">
        <StockFootprint plan={plan} />
        <StockMassing plan={plan} view="front" />
        <StockMassing plan={plan} view="side" />
      </div>
      <p className="home-stock-dim-note">
        Drawn from the listing&rsquo;s width, depth, storeys, porch and entry. The publisher&rsquo;s elevations and floor plans
        are licensed separately{plan.source.url ? <>: <a href={plan.source.url} target="_blank" rel="noreferrer">see them on the listing</a></> : ''}.
      </p>
    </section>
  );
}
