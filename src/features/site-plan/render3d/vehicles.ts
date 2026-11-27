import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarSpot } from './cars';

interface VehiclePart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  paint: boolean;
}

export interface Vehicle {
  parts: VehiclePart[];
  width: number;
  length: number;
}

const sources = { sedan: 'sedan-v2.glb', suv: 'suv-v2.glb' };
type Style = keyof typeof sources;
const models = new Map<Style, Promise<Vehicle>>();
// The fleet assets point −X in glTF, Y up. Rotate to site +X nose, Z up.
const toModel = new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

function vehicle(style: Style): Promise<Vehicle> {
  const cached = models.get(style);
  if (cached) return cached;
  const download = new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/site/${sources[style]}`).then(({ scene }) => {
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    const buckets = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
    const imported = new Set<THREE.BufferGeometry>();
    scene.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || !(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
      imported.add(mesh.geometry);
      const shape = mesh.geometry.clone();
      shape.applyMatrix4(mesh.matrixWorld).applyMatrix4(toModel);
      for (const attribute of Object.keys(shape.attributes)) {
        if (attribute !== 'position' && attribute !== 'normal') shape.deleteAttribute(attribute);
      }
      shape.computeBoundingBox();
      if (shape.boundingBox) bounds.union(shape.boundingBox);
      const material = mesh.material as THREE.MeshStandardMaterial;
      const parts = buckets.get(material) ?? [];
      parts.push(shape);
      buckets.set(material, parts);
    });
    imported.forEach(geometry => geometry.dispose());
    const centre = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const parts = [...buckets].flatMap(([material, shapes]) => {
      const geometry = mergeGeometries(shapes);
      shapes.forEach(shape => shape.dispose());
      if (!geometry) return [];
      geometry.translate(-centre.x, -centre.y, -bounds.min.z);
      const paint = material.name === 'paint';
      if (paint) {
        material.color.set(0xffffff);
        material.roughness = 0.32;
        material.metalness = 0.22;
      } else if (material.name.startsWith('glass')) {
        // A dark automotive reflection, not a solid black roof or a chrome mirror.
        material.color.set(0x34414e);
        material.roughness = 0.22;
        material.metalness = 0.1;
      } else if (material.name.startsWith('rubber')) {
        material.color.set(0x242527);
        material.roughness = 0.91;
        material.metalness = 0;
      }
      return [{ geometry, material, paint }];
    });
    if (!parts.length || size.x <= 0 || size.y <= 0) throw new Error(`Invalid ${style} model`);
    return { parts, length: size.x, width: size.y };
  }).catch(err => { models.delete(style); throw err; });
  models.set(style, download);
  return download;
}

export function vehicleFits(spot: CarSpot, model: Pick<Vehicle, 'width' | 'length'>): boolean {
  return model.length <= spot.length + 0.001 && model.width <= spot.width + 0.001;
}

export function vehicleTransform(spot: CarSpot): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(spot.x, spot.y, spot.z)
    .multiply(new THREE.Matrix4().makeRotationZ(spot.heading))
    .multiply(new THREE.Matrix4().makeRotationY(-Math.atan(spot.pitch ?? 0)))
    .multiply(new THREE.Matrix4().makeRotationX(Math.atan(spot.roll ?? 0)));
}

/** Keep the assets at native scale. A narrow space or a failed asset gets no placeholder. */
export async function parkedVehicles(spots: CarSpot[]): Promise<THREE.Group> {
  const group = new THREE.Group();
  const styles: Style[] = ['sedan', 'suv'];
  const loaded = await Promise.allSettled(styles.map(vehicle));
  const bins = styles.flatMap((style, i) => {
    const result = loaded[i];
    return result?.status === 'fulfilled' ? [{ style, model: result.value, places: [] as CarSpot[] }] : [];
  });
  for (const spot of spots) {
    const preferred = spot.seed % 5 < 3 ? 'sedan' : 'suv';
    const bin = bins.find(b => b.style === preferred && vehicleFits(spot, b.model))
      ?? bins.find(b => vehicleFits(spot, b.model));
    bin?.places.push(spot);
  }
  for (const { style, model, places } of bins) {
    if (!places.length) continue;
    const transforms = places.map(vehicleTransform);
    for (const [partIndex, part] of model.parts.entries()) {
      const mesh = new THREE.InstancedMesh(part.geometry.clone(), part.material, places.length);
      mesh.userData = { partId: `${style}-${partIndex}`, spots: places.map(spot => spot.seed) };
      transforms.forEach((transform, i) => mesh.setMatrixAt(i, transform));
      if (part.paint) places.forEach((spot, i) => mesh.setColorAt(i, new THREE.Color().setRGB(
        (spot.color[0] ?? 128) / 255, (spot.color[1] ?? 128) / 255, (spot.color[2] ?? 128) / 255, THREE.SRGBColorSpace,
      )));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  group.userData.occupancy = new Set(bins.flatMap(bin => bin.places.map(spot => spot.seed)));
  group.name = 'parked-vehicles';
  return group;
}
