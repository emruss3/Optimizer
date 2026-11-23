import { useEffect, useMemo, useRef, useState } from 'react';
import type { Element } from '../../../engine/types';
import { HOME_DESIGNS, type Face, type HomeDesign } from './originalDesigns';
import { designBounds, program, roofHeight } from './drawings';
import { hasPhotorealElevation, photorealElevationSrc } from './elevationAssets';
import { HomePlan, Elevation } from './PlanIllustrations';
import { placeHome, residentialHomes, type FitResult, type HomePlacement } from './placement';
import { designsFittingHouse, stepHomeDesignIndex } from './homeDesignsGate';
import './homeStudio.css';

interface Props {
  siteBoundary?: Element['geometry'] | null;
  elements: Element[];
  selected?: string | null;
  /** Scheme-eligible designs only — defaults to the full catalogue. */
  designs?: readonly HomeDesign[];
  onClose: () => void;
  onPreview: (placement: HomePlacement) => void;
}
export default function HomeStudio({
  elements,
  selected,
  onClose,
  onPreview,
  siteBoundary,
  designs = HOME_DESIGNS,
}: Props) {
  const houses = useMemo(() => residentialHomes(elements), [elements]);
  const [index, setIndex] = useState(0),
    [level, setLevel] = useState(0),
    [view, setView] = useState<'Exterior' | 'Plans' | 'Elevations'>('Exterior');
  const [side, setSide] = useState<Face>('front'),
    // Diagram is the plan-derived default; Photoreal is an opt-in character view.
    [elevationMode, setElevationMode] = useState<'photo' | 'diagram'>('diagram'),
    [houseId, setHouseId] = useState(() => houses.find((e) => e.id === selected)?.id ?? houses[0]?.id ?? '');
  const [fit, setFit] = useState<{ key: string; result: FitResult } | null>(null),
    root = useRef<HTMLElement>(null);

  // Keep the selected lot when the sheet refreshes; fall back to the first house.
  useEffect(() => {
    if (!houses.length) {
      setHouseId('');
      return;
    }
    if (!houses.some((h) => h.id === houseId)) {
      setHouseId(houses.find((e) => e.id === selected)?.id ?? houses[0]!.id);
    }
  }, [houses, houseId, selected]);

  const selectedHouse = houses.find((e) => e.id === houseId);

  // Fit-first: when a lot is selected, only offer designs that place on that lot.
  const catalogue = useMemo(() => {
    if (!designs.length) return [] as HomeDesign[];
    if (!selectedHouse) return [...designs];
    return designsFittingHouse(designs, selectedHouse, elements, siteBoundary);
  }, [designs, selectedHouse, elements, siteBoundary]);

  const emptyEligible = catalogue.length === 0;

  useEffect(() => {
    if (catalogue.length && index >= catalogue.length) setIndex(0);
  }, [catalogue, index]);

  const step = (delta: number) => {
    if (!catalogue.length) return;
    setIndex((i) => stepHomeDesignIndex(i, catalogue.length, delta));
    setLevel(0);
    setFit(null);
  };

  const home = catalogue[Math.min(index, Math.max(catalogue.length - 1, 0))],
    key = (home?.id ?? '') + '|' + houseId;
  const canShowPhotoreal = !!home && hasPhotorealElevation(home.id);
  const showPhotoreal = elevationMode === 'photo' && canShowPhotoreal;
  useEffect(() => {
    if (elevationMode === 'photo' && home && !hasPhotorealElevation(home.id)) setElevationMode('diagram');
  }, [elevationMode, home]);
  const current = fit?.key === key ? fit.result : null;
  const info = home ? program(home) : null;
  const [, , width, depth] = home ? designBounds(home) : [0, 0, 0, 0];

  // Auto-check fit when the design or lot changes so Preview is one click away.
  useEffect(() => {
    if (!home || !selectedHouse) {
      setFit(null);
      return;
    }
    setFit({ key, result: placeHome(home, selectedHouse, elements, siteBoundary) });
  }, [key, home, selectedHouse, elements, siteBoundary]);

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
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        step(-1);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        step(1);
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
  }, [onClose, catalogue.length]);

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
            <small>Parcel Proforma · concept studies</small>
            <h2>Middle Tennessee home designs</h2>
          </div>
          <div className="home-header-actions">
            <div className="home-browse" role="group" aria-label="Browse designs that fit this lot">
              <button type="button" onClick={() => step(-1)} disabled={catalogue.length < 2} aria-label="Previous design">
                ← Prev
              </button>
              <button type="button" onClick={() => step(1)} disabled={catalogue.length < 2} aria-label="Next design">
                Next →
              </button>
            </div>
            <button type="button" className="home-close" onClick={onClose} aria-label="Close home designs">
              Close ×
            </button>
          </div>
        </header>
        <div className="home-body">
          <nav aria-label="Home designs that fit">
            {emptyEligible ? (
              <p className="home-empty-eligible">
                {selectedHouse
                  ? 'No designs fit this selected lot. Pick another house lot, or return to the base plan.'
                  : 'No designs fit this scheme’s house lots.'}
              </p>
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
            {emptyEligible ? (
              <p role="status">
                {selectedHouse
                  ? `“${selectedHouse.name}” cannot take any of the eligible Middle Tennessee concept designs at full size with the drawn approaches. Switch lots above, or close and adjust the scheme.`
                  : 'This layout has detached or attached house footprints, but none of the concept designs clear the drawn lots, setbacks, and mapped approaches.'}
              </p>
            ) : home && info ? (
              <>
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
                      alt={home.name + ', illustrative character exterior (not generated from this plan)'}
                    />
                    <figcaption className="home-exterior-note">
                      Illustrative character image — not generated from this plan’s drawings, and not a photo of a built
                      home.
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
                        {home.levels[level]!.rooms.map((r) => (
                          <div key={r.name}>
                            <dt>{r.name}</dt>
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
                    <div className="home-options" role="group" aria-label="Elevation face">
                      {(['front', 'right', 'back', 'left'] as const).map((v) => (
                        <button type="button" key={v} aria-pressed={v === side} onClick={() => setSide(v)}>
                          {v === 'back' ? 'Rear' : v[0]!.toUpperCase() + v.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="home-options" role="group" aria-label="Elevation presentation">
                      <button
                        type="button"
                        aria-pressed={!showPhotoreal}
                        onClick={() => setElevationMode('diagram')}
                      >
                        Diagram
                      </button>
                      {canShowPhotoreal ? (
                        <button
                          type="button"
                          aria-pressed={showPhotoreal}
                          onClick={() => setElevationMode('photo')}
                          data-testid="home-elevation-photoreal"
                        >
                          Photoreal
                        </button>
                      ) : null}
                    </div>
                    {showPhotoreal ? (
                      <figure data-testid="home-elevation-photo">
                        <img
                          src={photorealElevationSrc(home.id, side)}
                          alt={
                            home.name +
                            ', illustrative character ' +
                            (side === 'back' ? 'rear' : side) +
                            ' elevation (not generated from this plan)'
                          }
                          onError={() => setElevationMode('diagram')}
                        />
                        <figcaption className="home-exterior-note">
                          Illustrative character elevation — not generated from this plan’s drawings, not a
                          licensed stock photo, and not a photo of a built home.
                        </figcaption>
                      </figure>
                    ) : (
                      <figure className="home-elevation" data-testid="home-elevation-diagram">
                        <Elevation home={home} side={side} />
                        <figcaption className="home-exterior-note">
                          Schematic diagram from plan volumes — not a construction elevation.
                        </figcaption>
                      </figure>
                    )}
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
                  <h4>Place on a house lot</h4>
                  {houses.length ? (
                    <>
                      <div>
                        <select
                          aria-label="House lot to place on"
                          value={houseId}
                          onChange={(e) => {
                            setHouseId(e.target.value);
                            setIndex(0);
                            setFit(null);
                          }}
                        >
                          {houses.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                            </option>
                          ))}
                        </select>
                        {current?.placement && (
                          <button
                            type="button"
                            className="home-primary"
                            onClick={() => onPreview(current.placement!)}
                          >
                            Preview in 3D massing
                          </button>
                        )}
                      </div>
                      <p aria-live="polite">
                        {current?.placement?.basis ??
                          current?.reason ??
                          'Selecting a lot lists only designs that fit it. Preview opens live 3D massing on that house.'}
                      </p>
                      <p className="home-fit-hint">
                        Showing {catalogue.length} design{catalogue.length === 1 ? '' : 's'} that fit
                        {selectedHouse ? ` “${selectedHouse.name}”` : ' this scheme'}. Use ← → to browse without losing
                        the lot.
                      </p>
                    </>
                  ) : (
                    <p>This scheme has no detached or attached house footprint to check.</p>
                  )}
                </section>
                <footer>
                  * Approximate conditioned area from schematic room zones (kitchen, baths, HVAC/mech, laundry — not
                  numbered placeholders). Dimensions include wall allowances. Exterior and elevation images are
                  illustrative AI character studies — not licensed stock, not construction photos, and not derived from
                  plan CAD. These are concept studies for site fit — not publisher construction sets. For cited
                  buildable stock plans (e.g. America’s Best House Plans), use the housing catalogue when available.
                </footer>
              </>
            ) : null}
          </main>
        </div>
      </section>
    </div>
  );
}
