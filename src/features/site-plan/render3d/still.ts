// A picture of the site from straight above, for the site plan sheet: the same
// model the 3D view shows, lit from the upper left so shadows fall down and to
// the right, with no perspective. The sheet lays its linework over it.
import * as THREE from 'three';
import type { MassingData } from '../ui/massingData';
import { buildSiteModel } from './siteScene';
import { createStage } from './stage';
import { sunPosition } from '../ui/sunPosition';
import { renderQuality } from './quality';

export interface PlanImageRequest {
  data: MassingData;
  /** The part of the model to show, local metres: west, south, east, north. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Width of the picture in pixels; its height follows the bounds. */
  widthPx: number;
}

export async function renderPlanImage(req: PlanImageRequest): Promise<string> {
  const { data, bounds } = req;
  const w = Math.max(1, bounds.maxX - bounds.minX), h = Math.max(1, bounds.maxY - bounds.minY);
  const widthPx = Math.round(Math.min(4096, req.widthPx));
  const heightPx = Math.round((widthPx * h) / w);
  const light = renderQuality() === 'light';
  const model = buildSiteModel(data, { canopyOpacity: 0.9, clayContext: true, light });
  const stage = createStage(undefined, model, { width: widthPx, height: heightPx, pixelRatio: 1, preserve: true, studio: true, light });
  try {
    await model.ready;
    const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
    const camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 1, 2000);
    // above the middle, looking down, north to the top of the picture
    camera.position.set(cx, 800, -cy);
    camera.up.set(0, 0, -1);
    camera.lookAt(cx, 0, -cy);
    camera.updateProjectionMatrix();
    // light from the north-west, 52 degrees up: the drafting convention
    const alt = (52 * Math.PI) / 180, az = (315 * Math.PI) / 180;
    stage.setSun([Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)]);
    stage.render(camera);
    return stage.renderer.domElement.toDataURL('image/jpeg', 0.92);
  } finally {
    stage.dispose();
    model.dispose();
    stage.renderer.forceContextLoss();
  }
}

/**
 * A picture of the site from the air, for the rendering sheet: the view the
 * 3D panel opens on, a little lower and closer, on an equinox afternoon.
 */
export async function renderAerialImage(req: { data: MassingData; widthPx: number; heightPx: number }): Promise<string> {
  const { data } = req;
  const widthPx = Math.round(Math.min(4096, req.widthPx)), heightPx = Math.round(Math.min(4096, req.heightPx));
  const light = renderQuality() === 'light';
  const model = buildSiteModel(data, { light });
  const stage = createStage(undefined, model, { width: widthPx, height: heightPx, pixelRatio: 1, preserve: true, light });
  try {
    await model.ready;
    const E = model.extent;
    const camera = new THREE.PerspectiveCamera(30, widthPx / heightPx, 1.5, E * 40);
    // centred on the parcel, far enough back to hold all of it, with a band of sky above
    const { x, y, radius } = model.focus;
    const el = (20 * Math.PI) / 180, az = (data.aerialAzimuth * Math.PI) / 180;
    const dist = (radius * 1.25) / Math.sin((30 * Math.PI) / 360 * Math.min(1, widthPx / heightPx));
    camera.position.set(x + dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), -y + dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(x, radius * 0.3, -y);
    camera.updateProjectionMatrix();
    const [dx, dy, dz] = sunPosition(80, 16.5, data.origin.latDeg).direction;
    stage.setSun([-dx, -dy, -dz]);
    stage.render(camera);
    return stage.renderer.domElement.toDataURL('image/jpeg', 0.92);
  } finally {
    stage.dispose();
    model.dispose();
    stage.renderer.forceContextLoss();
  }
}
