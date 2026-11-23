import { useEffect, useMemo, useRef, useState } from 'react';
import type { Element } from '../../../engine/types';
import { HOME_DESIGNS, type Face } from './originalDesigns';
import { designBounds, program, roofHeight } from './drawings';
import { HomePlan, Elevation } from './PlanIllustrations';
import { placeHome, residentialHomes, type FitResult, type HomePlacement } from './placement';
import './homeStudio.css';

interface Props {
  siteBoundary?: Element['geometry'] | null;
  elements: Element[];
  selected?: string | null;
  onClose: () => void;
  onPreview: (placement: HomePlacement) => void;
}
export default function HomeStudio({ elements, selected, onClose, onPreview, siteBoundary }: Props) {
  const houses = useMemo(() => residentialHomes(elements), [elements]);
  const [index, setIndex] = useState(0),
    [level, setLevel] = useState(0),
    [view, setView] = useState<'Exterior' | 'Plans' | 'Elevations'>('Exterior');
  const [side, setSide] = useState<Face>('front'),
    [houseId, setHouseId] = useState(() => houses.find((e) => e.id === selected)?.id ?? houses[0]?.id ?? '');
  const [fit, setFit] = useState<{ key: string; result: FitResult } | null>(null),
    root = useRef<HTMLElement>(null);
  const home = HOME_DESIGNS[index]!,
    selectedHouse = houses.find((e) => e.id === houseId),
    key = home.id + '|' + houseId;
  const current = fit?.key === key ? fit.result : null;
  const info = program(home),
    [, , width, depth] = designBounds(home);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function keys(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !root.current) return;
      const list = Array.from(
        root.current.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),summary,[href]'),
      ).filter((e) => e.offsetParent !== null);
      const first = list[0],
        last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener('keydown', keys, true);
    return () => {
      window.removeEventListener('keydown', keys, true);
      before?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="home-studio-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Middle Tennessee home designs"
        className="home-studio"
        ref={root}
      >
        <header>
          <div>
            <small>Parcel Proforma</small>
            <h2>Middle Tennessee home designs</h2>
          </div>
          <button type="button" className="home-close" onClick={onClose} aria-label="Close home designs">
            Close ×
          </button>
        </header>
        <div className="home-body">
          <nav aria-label="Home designs">
            {HOME_DESIGNS.map((h, i) => (
              <button
                type="button"
                key={h.id}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => {
                  setIndex(i);
                  setLevel(0);
                  setFit(null);
                }}
              >
                <strong>{h.name}</strong>
                <span>{h.setting}</span>
              </button>
            ))}
          </nav>
          <main>
            <div className="home-title">
              <div>
                <small>{home.setting}</small>
                <h3>{home.name}</h3>
              </div>
              <span>
                {info.beds} beds · {info.baths} baths
                <br />
                {info.heated.toLocaleString()} sf conditioned*
              </span>
            </div>
            <div className="home-tabs">
              {(['Exterior', 'Plans', 'Elevations'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={v === view} onClick={() => setView(v)}>
                  {v}
                </button>
              ))}
            </div>
            {view === 'Exterior' ? (
              <figure>
                <img
                  src={'/home-designs/' + home.id + '.webp'}
                  alt={home.name + ', exterior study built from its floor plans and openings'}
                />
              </figure>
            ) : view === 'Plans' ? (
              <>
                <div className="home-options">
                  {home.levels.map((l, i) => (
                    <button key={l.name} type="button" aria-pressed={level === i} onClick={() => setLevel(i)}>
                      {l.name}
                    </button>
                  ))}
                </div>
                <figure className="home-plan">
                  <HomePlan home={home} level={level} />
                </figure>
                <details>
                  <summary>Room dimensions</summary>
                  <dl className="home-rooms">
                    {home.levels[level]!.rooms.map((r, i) => (
                      <div key={r.name}>
                        <dt>
                          {i + 1}. {r.name}
                        </dt>
                        <dd>
                          {r.rect[2]} × {r.rect[3]} ft
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </>
            ) : (
              <>
                <div className="home-options">
                  {(['front', 'right', 'back', 'left'] as const).map((v) => (
                    <button type="button" key={v} aria-pressed={v === side} onClick={() => setSide(v)}>
                      {v === 'back' ? 'Rear' : v[0]!.toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
                <figure className="home-elevation">
                  <Elevation home={home} side={side} />
                </figure>
              </>
            )}
            <p>{home.description}</p>
            <p>{home.access}</p>
            <div className="home-measures">
              <span>
                {width} × {depth} ft incl. porches
              </span>
              <span>
                {home.levels.length} {home.levels.length === 1 ? 'story' : 'stories'}
              </span>
              <span>{roofHeight(home).toFixed(1)} ft to ridge or parapet</span>
            </div>
            <section className="home-placement">
              <h4>Try on this site</h4>
              {houses.length ? (
                <>
                  <div>
                    <select
                      aria-label="House lot to check"
                      value={houseId}
                      onChange={(e) => {
                        setHouseId(e.target.value);
                        setFit(null);
                      }}
                    >
                      {houses.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedHouse}
                      onClick={() => {
                        if (selectedHouse)
                          setFit({ key, result: placeHome(home, selectedHouse, elements, siteBoundary) });
                      }}
                    >
                      Check lot fit
                    </button>
                    {current?.placement && (
                      <button type="button" className="home-primary" onClick={() => onPreview(current.placement!)}>
                        Preview on site
                      </button>
                    )}
                  </div>
                  <p aria-live="polite">
                    {current?.placement?.basis ??
                      current?.reason ??
                      'Check the drawn lot and its vehicle and pedestrian approaches at full size.'}
                  </p>
                </>
              ) : (
                <p>This scheme has no detached or attached house footprint to check.</p>
              )}
            </section>
            <footer>
              * Approximate conditioned area from schematic room zones. Dimensions include wall allowances.
              Original concept for feasibility review.
            </footer>
          </main>
        </div>
      </section>
    </div>
  );
}
