import * as THREE from 'three';
import { HOME_DESIGNS, findHome } from '../../src/features/site-plan/housing/originalDesigns';
import { createGroundFrame } from '../../src/features/site-plan/scene/frame';
import { designBounds, roofHeight } from '../../src/features/site-plan/housing/drawings';
import { buildMassingData } from '../../src/features/site-plan/ui/massingData';
import { buildSiteModel } from '../../src/features/site-plan/render3d/siteScene';
import { createStage } from '../../src/features/site-plan/render3d/stage';
import type { Element } from '../../src/engine/types';

// Camera and setting are illustrative. Building geometry goes through the same
// housingDesignId + homeOrigin + homeAxis path as a placed house on the live plan.
const frame = createGroundFrame(-9679825, 4334090);
const rectangle = (x: number, y: number, w: number, d: number) => ({
  type: 'Polygon' as const, coordinates: [[[x, y], [x + w, y], [x + w, y + d], [x, y + d], [x, y]].map(p => frame.fromFeet(p as [number, number]))],
});
const element = (id: string, type: Element['type'], name: string, geometry: Element['geometry'], properties: Element['properties'] = {}): Element => ({
  id, type, name, geometry, properties, metadata: { createdAt: '', updatedAt: '', source: 'ai-generated' },
});
const imageWidth = 1050, imageHeight = 700;
Object.assign(window, {
  catalogIds: HOME_DESIGNS.map(h => h.id),
  async captureHomeModel(id: string) {
    const home = findHome(id);
    if (!home) throw new Error('Unknown home: ' + id);
    const [x, y, w, d] = designBounds(home);
    const [bx, by, bw, bd] = home.volumes[0]!.rect;
    const house = element(id, 'building', home.name, rectangle(bx, by, bw, bd), {
      house: !home.attached, townhome: !!home.attached, housingDesignId: id, homeOrigin: frame.fromFeet([0, 0]),
      homeAxis: frame.fromFeet([1, 0]), heightFt: roofHeight(home), floors: home.levels.length,
    });
    const lot = rectangle(x - 8, y - 18, w + 16, d + 32);
    const data = buildMassingData([house], { parcelRing: lot.coordinates[0] });
    if (data.slabs.filter(s => s.id === id).length < 12) throw new Error('The placement model fell back to a generic house');
    const model = buildSiteModel(data, { noContext: true, light: true });
    const stage = createStage(undefined, model, { width: imageWidth, height: imageHeight, pixelRatio: 1, preserve: true, light: true });
    try {
      await Promise.all([model.ready, stage.ready]);
      const center = data.toLocal(frame.fromFeet([x + w / 2, y + d / 2]));
      const cx = center[0] ?? 0, cy = center[1] ?? 0, mz = roofHeight(home) * 0.3048;
      const modelPoints = data.slabs.filter(s => s.id === id && !s.approach).flatMap(s =>
        s.polygon.flatMap(r => r.flatMap(([x = 0, y = 0, z = 0]) => [new THREE.Vector3(x, z, -y), new THREE.Vector3(x, z + s.elevation, -y)])),
      );
      for (const face of [...data.roofs, ...data.windows]) {
        if (face.id === id) for (const [x = 0, y = 0, z = 0] of face.polygon) modelPoints.push(new THREE.Vector3(x, z, -y));
      }
      const projected = new THREE.Vector3();
      const pictures: Record<string, string> = {};
      for (const [shot, az] of [['front', 31], ['rear', 213]] as const) {
        const theta = az * Math.PI / 180, sx = Math.sin(theta), sy = Math.cos(theta);
        const camera = new THREE.PerspectiveCamera(34, imageWidth / imageHeight, 0.3, 1800);
        const radius = Math.hypot(w, d) * 0.1524;
        let distance = Math.max(16, radius * 2.33, mz * 3.05);
        for (let attempt = 0; ; attempt++) {
          camera.position.set(cx + sx * distance, Math.max(2.0, mz * 0.31), -cy + sy * distance);
          camera.lookAt(cx, mz * 0.48, -cy);
          camera.updateMatrixWorld();
          const fits = modelPoints.every(point => {
            projected.copy(point).project(camera);
            return Math.abs(projected.x) < 0.92 && Math.abs(projected.y) < 0.88 && Math.abs(projected.z) < 1;
          });
          if (fits) break;
          if (attempt > 15) throw new Error('Unable to frame the full house: ' + id);
          distance *= 1.09;
        }
        stage.setSun([sx * 0.56 - sy * 0.34, -sy * 0.56 - sx * 0.34, 0.76]);
        stage.invalidateShadows();
        stage.render(camera);
        pictures[shot] = stage.renderer.domElement.toDataURL('image/webp', 0.88);
      }
      return { pictures, assemblySlabs: data.slabs.length, floors: home.levels.length };
    } finally {
      stage.dispose();
      model.dispose();
      stage.renderer.forceContextLoss();
    }
  },
});
