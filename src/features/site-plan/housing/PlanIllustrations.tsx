import { useMemo } from 'react';
import { Kit } from '../ui/architecture/kit';
import { drawHome } from './architecture';
import type { HomeDesign, Point, Face, Room } from './originalDesigns';
import { bounds, normal, pointOn, wallsFor, wallSegments } from './drawings';

function zone(name: string) {
  if (/garage/i.test(name)) return '#dedfd7';
  if (/mech|hvac|utility/i.test(name)) return '#d8dde8';
  if (/bath|laundry|powder/i.test(name)) return '#dce9e5';
  if (/kitchen/i.test(name)) return '#efe6d4';
  if (/bedroom|guest/i.test(name)) return '#f1e4d8';
  if (/closet|storage|pantry|linen|coats|dressing/i.test(name)) return '#eae6de';
  return '#f5f1e6';
}

/** Prefer a readable program name over a bare index when the zone is tight. */
export function planRoomLabel(name: string, w: number, d: number): string {
  const font = Math.min(1.45, w / (name.length * 0.52 + 1), d * 0.28);
  if (font >= 0.89 && w >= 5.5 && d >= 3.5) return name;
  if (/primary bath/i.test(name)) return 'P. Bath';
  if (/shower bath/i.test(name)) return 'Bath';
  if (/\bbath\b/i.test(name)) return 'Bath';
  if (/laundry/i.test(name)) return 'Laundry';
  if (/kitchen/i.test(name)) return 'Kitchen';
  if (/powder/i.test(name)) return 'Pwd';
  if (/mech|hvac|utility/i.test(name)) return 'HVAC';
  if (/pantry/i.test(name)) return 'Pantry';
  if (/primary bedroom/i.test(name)) return 'Primary BR';
  if (/bedroom/i.test(name)) return name.replace(/bedroom/i, 'BR').trim();
  if (/closet|linen|coats|dressing|storage/i.test(name)) return name.split(/\s+/)[0]!;
  if (/garage/i.test(name)) return 'Garage';
  if (/stair|landing|entry|foyer|hall|mud/i.test(name)) return name.split(/\s+/)[0]!;
  return name.length > 9 ? name.slice(0, 8) + '…' : name;
}
const textStyle = { fontFamily: 'Arial, sans-serif', fill: '#344339' };
export function HomePlan({ home, level = 0 }: { home: HomeDesign; level?: number }) {
  const rooms = home.levels[level]!.rooms,
    walls = wallsFor(home, level);
  const porches = home.porches.filter((p) => (p.level ?? 0) === level);
  const [x, y, width, depth] = bounds([...rooms, ...porches].map((r) => r.rect));
  // Front of the house is at the bottom of the sheet.
  const sy = (v: number) => y + depth - v;
  const stroke = (p: Point, q: Point, color: string, sw: number, key?: string) => (
    <line key={key} x1={p[0]} y1={sy(p[1])} x2={q[0]} y2={sy(q[1])} stroke={color} strokeWidth={sw} />
  );
  const dimension = (a: Point, b: Point, caption: string, vertical = false) => {
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return (
      <g stroke="#697a70" strokeWidth=".10">
        {stroke(a, b, '#697a70', 0.1)}
        {[a, b].map((v, i) =>
          stroke([v[0] - 0.4, v[1] - 0.4], [v[0] + 0.4, v[1] + 0.4], '#697a70', 0.12, String(i)),
        )}
        <text
          transform={
            vertical
              ? `translate(${mid[0] - 0.57},${sy(mid[1])}) rotate(-90)`
              : `translate(${mid[0]},${sy(mid[1]) - 0.48})`
          }
          textAnchor="middle"
          fontSize="1.34"
          stroke="none"
          {...textStyle}
        >
          {caption}
        </text>
      </g>
    );
  };
  function furniture(r: Room) {
    const [rx, ry, w, d] = r.rect,
      yy = sy(ry + d);
    if (r.name === 'Stair hall')
      return (
        <g fill="none" stroke="#94a199" strokeWidth=".12">
          <rect x={rx + 0.6} y={yy + 0.65} width={w - 1.2} height={d - 1.3} />
          {Array.from({ length: 8 }, (_, i) => (
            <line
              key={i}
              x1={rx + 0.65}
              y1={yy + 2.8 + (i * (d - 3.5)) / 8}
              x2={rx + w - 0.65}
              y2={yy + 2.8 + (i * (d - 3.5)) / 8}
            />
          ))}
          <line x1={rx + w / 2} y1={yy + 2.3} x2={rx + w / 2} y2={yy + d - 0.55} />
        </g>
      );
    if (/kitchen/i.test(r.name))
      return (
        <g fill="none" stroke="#8a7a5c" strokeWidth=".11">
          <rect x={rx + 0.45} y={yy + 0.4} width={Math.min(2.2, w - 0.9)} height={d - 0.8} />
          <rect x={rx + 0.45} y={yy + d - Math.min(2.2, d - 0.8) - 0.4} width={w - 0.9} height={Math.min(2.2, d - 0.8)} />
          <circle cx={rx + Math.min(1.55, w / 2)} cy={yy + Math.min(1.4, d / 2)} r="0.35" />
        </g>
      );
    if (/bath|powder/i.test(r.name))
      return (
        <g fill="none" stroke="#6f8f88" strokeWidth=".11">
          <rect x={rx + 0.45} y={yy + 0.45} width={Math.min(2.6, w - 0.9)} height={Math.min(5, d - 0.9)} rx="0.35" />
          <circle cx={rx + w - 1.1} cy={yy + 1.15} r="0.55" />
          <rect x={rx + w - 2.1} y={yy + d - 1.55} width={1.55} height={0.95} />
        </g>
      );
    if (/laundry/i.test(r.name))
      return (
        <g fill="none" stroke="#6f8f88" strokeWidth=".11">
          <rect x={rx + 0.5} y={yy + 0.55} width={Math.min(2.4, (w - 1.2) / 2)} height={Math.min(2.4, d - 1.1)} />
          <rect
            x={rx + 0.5 + Math.min(2.4, (w - 1.2) / 2) + 0.25}
            y={yy + 0.55}
            width={Math.min(2.4, (w - 1.2) / 2)}
            height={Math.min(2.4, d - 1.1)}
          />
        </g>
      );
    if (/mech|hvac|utility/i.test(r.name))
      return (
        <g fill="none" stroke="#6a7388" strokeWidth=".11">
          <rect x={rx + 0.5} y={yy + 0.5} width={w - 1} height={d - 1} />
          {Array.from({ length: 4 }, (_, i) => (
            <line
              key={i}
              x1={rx + 0.7}
              y1={yy + 0.85 + i * ((d - 1.5) / 3)}
              x2={rx + w - 0.7}
              y2={yy + 0.85 + i * ((d - 1.5) / 3)}
            />
          ))}
        </g>
      );
    return null;
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={home.name + ' ' + home.levels[level]!.name + ' floor plan'}
      viewBox={`${x - 5} -5 ${width + 9} ${depth + 12}`}
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      {porches.map((p, i) => {
        const [a, b, w, d] = p.rect;
        return (
          <g key={i}>
            <rect x={a} y={sy(b + d)} width={w} height={d} fill="#ece8db" stroke="#9b947f" strokeWidth=".18" />
            <text
              x={a + w / 2}
              y={sy(b + d / 2)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="0.98"
              {...textStyle}
            >
              Porch
            </text>
          </g>
        );
      })}
      {rooms.map((r) => {
        const [a, b, w, d] = r.rect;
        return (
          <g key={r.name}>
            <rect x={a} y={sy(b + d)} width={w} height={d} fill={zone(r.name)} />
            {furniture(r)}
          </g>
        );
      })}
      {walls.map((w, i) => (
        <g key={i}>
          {wallSegments(w).map(([a, b], j) =>
            stroke(pointOn(w, a), pointOn(w, b), '#36483e', w.other ? 0.26 : 0.43, String(j)),
          )}
          {w.cuts.map((c, j) => {
            const p = pointOn(w, c.at - c.width / 2),
              q = pointOn(w, c.at + c.width / 2),
              n = normal[w.face];
            if (c.kind === 'passage') return null;
            if (c.kind === 'window')
              return (
                <g key={j}>
                  {[-0.12, 0.12].map((k) =>
                    stroke(
                      [p[0] + k * n[0], p[1] + k * n[1]],
                      [q[0] + k * n[0], q[1] + k * n[1]],
                      '#4d797b',
                      0.085,
                      String(k),
                    ),
                  )}
                </g>
              );
            if (c.kind === 'garage') return stroke(p, q, '#737e76', 0.24, String(j));
            const width = c.width,
              tip: Point = [p[0] - n[0] * width, p[1] - n[1] * width];
            // Quarter-circle swings follow the perpendicular jamb orientation.
            const cross = (q[0] - p[0]) * (tip[1] - p[1]) - (q[1] - p[1]) * (tip[0] - p[0]);
            return (
              <g key={j}>
                {stroke(p, tip, '#738279', 0.1)}
                <path
                  d={`M ${q[0]} ${sy(q[1])} A ${width} ${width} 0 0 ${cross < 0 ? 1 : 0} ${tip[0]} ${sy(tip[1])}`}
                  fill="none"
                  stroke="#9da69d"
                  strokeWidth=".075"
                />
              </g>
            );
          })}
        </g>
      ))}
      {rooms.map((r) => {
        const [a, b, w, d] = r.rect,
          cx = a + w / 2,
          cy = sy(b + d / 2),
          label = planRoomLabel(r.name, w, d),
          font = Math.min(1.45, w / (label.length * 0.52 + 1), d * 0.28);
        return (
          <text
            key={r.name}
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={Math.max(0.95, font)}
            {...textStyle}
            stroke={zone(r.name)}
            strokeWidth=".28"
            paintOrder="stroke"
          >
            {label}
          </text>
        );
      })}
      {dimension([x, y + depth + 2.5], [x + width, y + depth + 2.5], width + ' ft')}
      {dimension([x - 2.6, y], [x - 2.6, y + depth], depth + ' ft', true)}
      <text
        x={x + width / 2}
        y={sy(y) + 3.8}
        textAnchor="middle"
        fontSize="1.06"
        letterSpacing=".15"
        {...textStyle}
      >
        STREET FACE
      </text>
    </svg>
  );
}

type Vertex = number[];
interface Facet {
  pts: Vertex[];
  fill: number[];
  glass?: boolean;
}
const stored = new WeakMap<HomeDesign, Facet[]>();
function facets(home: HomeDesign) {
  const cached = stored.get(home);
  if (cached) return cached;
  const kit = drawHome(new Kit(home.id, home.name), home, undefined, home.attached ? ['left'] : []);
  const surfaces: Facet[] = [];
  for (const s of kit.slabs) {
    const ring = s.polygon[0]!,
      top = ring.map((p) => [p[0]!, p[1]!, p[2]! + s.elevation]);
    surfaces.push({ pts: top, fill: s.color });
    ring.forEach((p, i) => {
      const j = (i + 1) % ring.length;
      surfaces.push({ pts: [p, ring[j]!, top[j]!, top[i]!], fill: s.color });
    });
  }
  for (const p of kit.flats) surfaces.push({ pts: p.polygon, fill: p.color });
  for (const p of kit.glass) surfaces.push({ pts: p.polygon, fill: [83, 110, 112], glass: true });
  stored.set(home, surfaces);
  return surfaces;
}
export function Elevation({ home, side }: { home: HomeDesign; side: Face }) {
  const model = useMemo(() => {
    const n = normal[side],
      right: Point = [-n[1], n[0]];
    const visible = facets(home)
      .map((f) => {
        const points = f.pts.map((p) => [p[0]! * right[0] + p[1]! * right[1], -p[2]!] as Point);
        const area = Math.abs(
          points.reduce((sum, p, i) => {
            const q = points[(i + 1) % points.length]!;
            return sum + p[0] * q[1] - q[0] * p[1];
          }, 0),
        );
        // A vertical flat surface has one depth. For a sloping roof the nearest
        // eave sets visibility against the gable and the wall it shelters.
        const depth = f.pts.reduce((sum, p) => sum + (p[0]! * n[0] + p[1]! * n[1]), 0) / f.pts.length;
        return { points, area, depth, fill: f.fill };
      })
      .filter((f) => f.area > 0.00035)
      .sort((a, b) => a.depth - b.depth);
    const cloud = visible.flatMap((p) => p.points);
    const x = Math.min(...cloud.map((p) => p[0])),
      y = Math.min(...cloud.map((p) => p[1])),
      w = Math.max(...cloud.map((p) => p[0])) - x;
    return { visible, x, y, w };
  }, [home, side]);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={home.name + ' ' + side + ' elevation'}
      viewBox={`${model.x - 0.68} ${model.y - 0.48} ${model.w + 1.36} ${-model.y + 1.05}`}
      style={{ display: 'block', height: '100%', width: '100%' }}
    >
      {model.visible.map((p, i) => (
        <polygon
          key={i}
          points={p.points.map((q) => q.map((v) => v.toFixed(3)).join(',')).join(' ')}
          fill={`rgb(${p.fill.slice(0, 3).join(',')})`}
        />
      ))}
      <line
        x1={model.x - 0.5}
        x2={model.x + model.w + 0.5}
        y1=".015"
        y2=".015"
        stroke="#737a70"
        strokeWidth=".035"
      />
    </svg>
  );
}
