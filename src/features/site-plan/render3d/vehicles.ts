import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarSpot } from './cars';

interface VehiclePart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  paint: boolean;
}

interface Vehicle {
  parts: VehiclePart[];
  width: number;
  length: number;
}

const sources = { sedan: { body: 'blue' }, suv: { body: 'green' } };
type Style = keyof typeof sources;
const models = new Map<Style, Promise<Vehicle>>();
// glTF: +Z nose, +Y up. Site model: +X nose, +Z up.
const toModel = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);

function vehicle(style: Style): Promise<Vehicle> {
  const cached = models.get(style);
  if (cached) return cached;
  const download = new GLTFLoader().loadAsync(`/models/site/${style}.glb`).then(({ scene }) => {
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    const buckets = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
    const imported = new Set<THREE.BufferGeometry>();
    scene.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || !(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
      imported.add(mesh.geometry);
      const shape = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
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
      const paint = material.name === sources[style].body;
      if (paint) {
        material.color.set(0xffffff);
        material.roughness = 0.24;
        material.metalness = 0.35;
      }
      return [{ geometry, material, paint }];
    });
    if (!parts.length || size.x <= 0 || size.y <= 0) throw new Error(`Invalid ${style} model`);
    return { parts, length: size.x, width: size.y };
  }).catch(err => { models.delete(style); throw err; });
  models.set(style, download);
  return download;
}

/** Swap in metre-scale entourage in the already placed stalls. */
export async function parkedVehicles(spots: CarSpot[]): Promise<THREE.Group> {
  const group = new THREE.Group();
  const styles = [
    { style: 'sedan' as const, spots: spots.filter(spot => spot.seed % 5 < 3) },
    { style: 'suv' as const, spots: spots.filter(spot => spot.seed % 5 >= 3) },
  ].filter(item => item.spots.length);
  const models = await Promise.all(styles.map(async item => ({ spots: item.spots, model: await vehicle(item.style) })));
  for (const { spots: places, model } of models) {
    const transforms = places.map(spot => new THREE.Matrix4()
      .makeTranslation(spot.x, spot.y, spot.z)
      .multiply(new THREE.Matrix4().makeRotationZ(spot.heading))
      .scale(new THREE.Vector3(Math.min(1, spot.length / model.length), Math.min(1, spot.width / model.width), 1)));
    for (const part of model.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry.clone(), part.material, places.length);
      transforms.forEach((transform, i) => mesh.setMatrixAt(i, transform));
      if (part.paint) places.forEach((spot, i) => mesh.setColorAt(i, new THREE.Color().setRGB(
        (spot.color[0] ?? 128) / 255, (spot.color[1] ?? 128) / 255, (spot.color[2] ?? 128) / 255, THREE.SRGBColorSpace,
      )));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  group.name = 'parked-vehicles';
  return group;
}
