import { useEffect, useMemo, useRef, useState } from 'react';
import type { Element } from '../../../engine/types';
import { HOME_DESIGNS, type Face, type HomeDesign } from './originalDesigns';
import { designBounds, program, roofHeight } from './drawings';
import { HomePlan, Elevation } from './PlanIllustrations';
import { placeHome, residentialHomes, type FitResult, type HomePlacement } from './placement';
import { buildableStockPlans } from './catalogue';
import type { HousingDesignRecord } from './types';
import './homeStudio.css';

type StudioMode = 'stock' | 'concept';

interface Props {
  siteBoundary?: Element['geometry'] | null;
  elements: Element[];
  selected?: string | null;
  /** Buildable publisher stock plans (defaults to the ABHP citation catalogue). */
  stockPlans?: readonly HousingDesignRecord[];
  /** Stamp a stock plan onto the scheme pads / lots. */
  onApplyStock?: (designId: string) => void;
  /** Eligible concept studies for this scheme — defaults to the full catalogue. */
  designs?: readonly HomeDesign[];
  onClose: () => void;
  onPreview: (placement: HomePlacement) => void;
}

function bathsLabel(baths: number | null): string {
  return baths == null ? 'baths unknown' : `${baths} ba`;
}

function parkingLabel(p: HousingDesignRecord['parking']): string {
  switch (p) {
    case 'attached-garage':
      return 'attached garage';
    case 'detached-garage':
      return 'detached garage';
    case 'pad':
      return 'parking pad (no garage)';
    case 'street':
      return 'street parking';
    case 'alley':
      return 'alley parking';
    case 'none':
      return 'no on-lot parking';
    default:
      return 'parking unknown';
  }
}

function verificationLabel(v: HousingDesignRecord['verification']): string {
  switch (v) {
    case 'trial-cleared':
      return 'Trial-cleared on Delk';
    case 'verified':
      return 'Verified';
    case 'provisional':
      return 'Listing facts · provisional fit';
    default:
      return 'Unverified';
  }
}

export default function HomeStudio({
  elements,
  selected,
  onClose,
  onPreview,
  siteBoundary,
  stockPlans,
  onApplyStock,
  designs = HOME_DESIGNS,
}: Props) {
  // Explicit empty list means “no SF stock for this session” (MF/CS / none fit) —
  // do not fall back to the full catalogue and offer Apply on apartment land.
  const stock = useMemo(
    () => (stockPlans !== undefined ? [...stockPlans] : buildableStockPlans()),
    [stockPlans],
  );
  const catalogue = designs;
  const emptyConcepts = catalogue.length === 0;
  const houses = useMemo(() => residentialHomes(elements), [elements]);
  const [mode, setMode] = useState<StudioMode>(() => (stock.length ? 'stock' : 'concept'));
  const [stockIndex, setStockIndex] = useState(0);
  const [index, setIndex] = useState(0),
    [level, setLevel] = useState(0),
    [view, setView] = useState<'Exterior' | 'Plans' | 'Elevations'>('Exterior');
  const [side, setSide] = useState<Face>('front'),
    [houseId, setHouseId] = useState(() => houses.find((e) => e.id === selected)?.id ?? houses[0]?.id ?? '');
  const [fit, setFit] = useState<{ key: string; result: FitResult } | null>(null),
    root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (stockIndex >= stock.length) setStockIndex(0);
  }, [stock, stockIndex]);

  useEffect(() => {
    if (catalogue.length && index >= catalogue.length) setIndex(0);
  }, [catalogue, index]);

  useEffect(() => {
    if (mode === 'stock' && stock.length === 0 && catalogue.length > 0) setMode('concept');
    if (mode === 'concept' && catalogue.length === 0 && stock.length > 0) setMode('stock');
  }, [mode, stock.length, catalogue.length]);

  const plan = stock[Math.min(stockIndex, Math.max(stock.length - 1, 0))];
  const home = catalogue[Math.min(index, Math.max(catalogue.length - 1, 0))],
    selectedHouse = houses.find((e) => e.id === houseId),
    key = (home?.id ?? '') + '|' + houseId;
  const current = fit?.key === key ? fit.result : null;
  const info = home ? program(home) : null;
  const [, , width, depth] = home ? designBounds(home) : [0, 0, 0, 0];

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
        aria-label={mode === 'stock' ? 'Buildable stock plans' : 'Concept home studies'}
        className="home-studio"
        ref={root}
      >
        <header>
          <div>
            <small>Parcel Proforma</small>
            <h2>{mode === 'stock' ? 'Buildable stock plans' : 'Concept studies'}</h2>
          </div>
          <button type="button" className="home-close" onClick={onClose} aria-label="Close home designs">
            Close ×
          </button>
        </header>
        <div className="home-mode-tabs" role="tablist" aria-label="Home design source">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'stock'}
            onClick={() => setMode('stock')}
          >
            Buildable stock
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'concept'}
            onClick={() => setMode('concept')}
          >
            Concept studies
          </button>
        </div>
        <div className="home-body">
          {mode === 'stock' ? (
            <>
              <nav aria-label="Buildable stock plans">
                {stock.map((h, i) => (
                  <button
                    type="button"
                    key={h.id}
                    aria-current={i === stockIndex ? 'true' : undefined}
                    onClick={() => setStockIndex(i)}
                  >
                    <strong>{h.planNumber}</strong>
                    <span>
                      {h.beds} bed · {bathsLabel(h.baths)} · {h.heatedSf.toLocaleString()} sf
                    </span>
                  </button>
                ))}
              </nav>
              <main>
                {plan ? (
                  <>
                    <div className="home-title">
                      <div>
                        <small>{plan.source.publisher}</small>
                        <h3>{plan.name}</h3>
                      </div>
                      <span>
                        {plan.beds} beds · {bathsLabel(plan.baths)}
                        <br />
                        {plan.heatedSf.toLocaleString()} sf heated
                      </span>
                    </div>
                    <div className="home-stock-card">
                      <p className="home-stock-kicker">{verificationLabel(plan.verification)}</p>
                      <dl className="home-stock-facts">
                        <div>
                          <dt>Listing overall</dt>
                          <dd>
                            {plan.footprint.widthFt}′ × {Number(plan.footprint.depthFt.toFixed(2))}′
                            <span className="home-stock-dim-note"> (may include porch)</span>
                          </dd>
                        </div>
                        <div>
                          <dt>Stories</dt>
                          <dd>{plan.stories}</dd>
                        </div>
                        <div>
                          <dt>Parking</dt>
                          <dd>{parkingLabel(plan.parking)}</dd>
                        </div>
                        <div>
                          <dt>Porch face</dt>
                          <dd>{plan.porchFace}</dd>
                        </div>
                      </dl>
                      <p>{plan.source.citation}</p>
                      {plan.source.url && (
                        <p>
                          <a href={plan.source.url} target="_blank" rel="noreferrer">
                            View publisher listing →
                          </a>
                        </p>
                      )}
                      {plan.notes[0] && <p className="home-stock-note">{plan.notes[0]}</p>}
                    </div>
                    <section className="home-placement">
                      <h4>Apply on this site</h4>
                      {houses.length && onApplyStock ? (
                        <>
                          <div>
                            <button
                              type="button"
                              className="home-primary"
                              onClick={() => {
                                onApplyStock(plan.id);
                                onClose();
                              }}
                            >
                              Apply to house lots
                            </button>
                          </div>
                          <p>
                            Stamps this stock plan’s listing-overall footprint, parking, and citation
                            onto the drawn house pads that clear setbacks. Construction drawings are
                            licensed from the publisher separately.
                          </p>
                        </>
                      ) : houses.length ? (
                        <p>
                          Open this parcel’s by-right house design picker to apply the plan, or return
                          after house lots are drawn.
                        </p>
                      ) : (
                        <p>This scheme has no detached or attached house footprint to check.</p>
                      )}
                    </section>
                    <footer>
                      Citation-only catalogue facts from America’s Best House Plans. This app does not
                      ship copyrighted elevations or construction PDFs.
                    </footer>
                  </>
                ) : (
                  <p role="status">
                    {stockPlans !== undefined && stockPlans.length === 0
                      ? 'No SF stock fits these lots — apply is limited to single-family / by-right detached sessions (or a labeled rezone) with footprints that clear the drawn lots.'
                      : 'No buildable stock plans are loaded.'}
                  </p>
                )}
              </main>
            </>
          ) : (
            <>
              <nav aria-label="Concept home studies">
                {emptyConcepts ? (
                  <p className="home-empty-eligible">No concept studies fit this scheme’s house lots.</p>
                ) : (
                  catalogue.map((h, i) => (
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
                  ))
                )}
              </nav>
              <main>
                {emptyConcepts ? (
                  <p role="status">
                    This layout has detached or attached house footprints, but none of the concept
                    studies clear the drawn lots, setbacks, and mapped approaches.
                  </p>
                ) : home && info ? (
                  <>
                    <div className="home-title">
                      <div>
                        <small>{home.setting} · concept study</small>
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
                          alt={home.name + ', illustrative character exterior (not generated from this plan)'}
                        />
                        <figcaption className="home-exterior-note">
                          Illustrative character image — not generated from this plan’s drawings, and not a photo of a built home.
                        </figcaption>
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
                                if (selectedHouse && home)
                                  setFit({ key, result: placeHome(home, selectedHouse, elements, siteBoundary) });
                              }}
                            >
                              Check lot fit
                            </button>
                            {current?.placement && (
                              <button type="button" className="home-primary" onClick={() => onPreview(current.placement!)}>
                                Preview in 3D massing
                              </button>
                            )}
                          </div>
                          <p aria-live="polite">
                            {current?.placement?.basis ??
                              current?.reason ??
                              'Check the drawn lot and its vehicle and pedestrian approaches at full size. A fit opens the live 3D massing with this design.'}
                          </p>
                        </>
                      ) : (
                        <p>This scheme has no detached or attached house footprint to check.</p>
                      )}
                    </section>
                    <footer>
                      * Approximate conditioned area from schematic room zones. Dimensions include wall allowances.
                      These are concept studies for site fit — not publisher construction sets.
                    </footer>
                  </>
                ) : null}
              </main>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
