import { useMemo } from 'react';
import { Kit } from '../ui/architecture/kit';
import { drawHome } from './architecture';
import type { HomeDesign, Point, Face, Room } from './originalDesigns';
import { bounds, normal, pointOn, wallsFor, wallSegments } from './drawings';

function zone(name: string) {
  if (/garage/i.test(name)) return '#dedfd7';
  if (/bath|laundry|powder/i.test(name)) return '#dce9e5';
  if (/bedroom|guest/i.test(name)) return '#f1e4d8';
  if (/closet|storage|pantry|linen|coats|dressing/i.test(name)) return '#eae6de';
  return '#f5f1e6';
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
      {rooms.map((r, i) => {
        const [a, b, w, d] = r.rect,
          cx = a + w / 2,
          cy = sy(b + d / 2),
          font = Math.min(1.45, w / (r.name.length * 0.52 + 1), d * 0.28);
        const numbered = font < 0.89 || w < 5.5 || d < 3.5;
        return (
          <text
            key={r.name}
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={numbered ? 1.1 : font}
            {...textStyle}
            stroke={zone(r.name)}
            strokeWidth=".28"
            paintOrder="stroke"
          >
            {numbered ? String(i + 1) : r.name}
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
