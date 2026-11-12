// Surface textures, drawn once on a canvas: lap siding, board and batten,
// brick, shingles, standing-seam metal, cedar boards, stucco, cladding panels,
// concrete with scored joints, asphalt and turf. Each is a light, near-white
// pattern: the colour of a wall or a roof comes from the geometry's own vertex
// colour, so one material serves every house on the street.
import * as THREE from 'three';
import type { Surface } from '../ui/renderModel';

export type { Surface };
type Drawn = 'siding' | 'batten' | 'brick' | 'shingle' | 'metal' | 'wood' | 'plaster' | 'panel' | 'concrete' | 'asphalt' | 'grass';

interface Tile { map: THREE.Texture; bump: THREE.Texture; bumpScale: number; roughness: number; metalness?: number }

/** A repeatable generator, so a texture is the same on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return [c, ctx];
}

function speckle(ctx: CanvasRenderingContext2D, size: number, n: number, lo: number, hi: number, r: () => number, alpha = 0.5): void {
  for (let i = 0; i < n; i++) {
    const v = Math.round(lo + r() * (hi - lo));
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }
}

/** A texture laid in metres: `w` by `h` metres to a tile. */
function finish(c: HTMLCanvasElement, w: number, h: number, colour: boolean): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / w, 1 / h);
  t.anisotropy = 8;
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DRAW: Record<Drawn, () => Tile> = {
  // lap siding: six boards to a 0.9 m tile, a shadow under each lap
  siding: () => {
    const S = 256, r = rng(11);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    x.fillStyle = '#f4f4f2'; x.fillRect(0, 0, S, S);
    y.fillStyle = '#808080'; y.fillRect(0, 0, S, S);
    const laps = 6, hgt = S / laps;
    for (let i = 0; i < laps; i++) {
      const g = x.createLinearGradient(0, i * hgt, 0, (i + 1) * hgt);
      g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(0.82, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
      x.fillStyle = g; x.fillRect(0, i * hgt, S, hgt);
      const bg = y.createLinearGradient(0, i * hgt, 0, (i + 1) * hgt);
      bg.addColorStop(0, '#a8a8a8'); bg.addColorStop(0.85, '#7a7a7a'); bg.addColorStop(1, '#2a2a2a');
      y.fillStyle = bg; y.fillRect(0, i * hgt, S, hgt);
    }
    speckle(x, S, 500, 200, 250, r, 0.18);
    return { map: finish(c, 2.4, 0.9, true), bump: finish(b, 2.4, 0.9, false), bumpScale: 1.2, roughness: 0.82 };
  },
  // board and batten: two boards to a 0.8 m tile, a raised batten over each joint
  batten: () => {
    const S = 256, r = rng(13);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    x.fillStyle = '#f2f2f0'; x.fillRect(0, 0, S, S);
    y.fillStyle = '#707070'; y.fillRect(0, 0, S, S);
    for (const cx of [64, 192]) {
      x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillRect(cx - 9, 0, 18, S);
      x.fillStyle = 'rgba(0,0,0,0.34)'; x.fillRect(cx + 9, 0, 5, S);
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(cx - 12, 0, 3, S);
      y.fillStyle = '#d8d8d8'; y.fillRect(cx - 9, 0, 18, S);
      y.fillStyle = '#303030'; y.fillRect(cx + 9, 0, 4, S);
    }
    speckle(x, S, 500, 205, 250, r, 0.16);
    return { map: finish(c, 0.8, 2.4, true), bump: finish(b, 0.8, 2.4, false), bumpScale: 1.5, roughness: 0.84 };
  },
  // standing seam: a rib every 0.42 m, running with the fall of the roof
  metal: () => {
    const S = 128, r = rng(17);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    x.fillStyle = '#eeeeee'; x.fillRect(0, 0, S, S);
    y.fillStyle = '#606060'; y.fillRect(0, 0, S, S);
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(58, 0, 6, S);
    x.fillStyle = 'rgba(0,0,0,0.42)'; x.fillRect(64, 0, 7, S);
    y.fillStyle = '#f0f0f0'; y.fillRect(57, 0, 8, S);
    y.fillStyle = '#202020'; y.fillRect(65, 0, 4, S);
    speckle(x, S, 160, 215, 250, r, 0.12);
    return { map: finish(c, 0.42, 2, true), bump: finish(b, 0.42, 2, false), bumpScale: 1.4, roughness: 0.5, metalness: 0.22 };
  },
  // cedar boards laid flat: six to a 0.84 m tile, each its own tone, a dark joint between
  wood: () => {
    const S = 256, r = rng(19);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    y.fillStyle = '#9a9a9a'; y.fillRect(0, 0, S, S);
    const rows = 6, hgt = S / rows;
    for (let i = 0; i < rows; i++) {
      // two boards to a row, the joint staggered
      const cut = Math.round(S * (0.2 + r() * 0.6));
      for (const [x0, x1] of [[0, cut], [cut, S]] as Array<[number, number]>) {
        const v = 196 + Math.round(r() * 58);
        x.fillStyle = `rgb(${v},${v - 5},${v - 12})`;
        x.fillRect(x0, i * hgt, x1 - x0, hgt);
      }
      for (let g = 0; g < 26; g++) {
        x.fillStyle = `rgba(90,70,50,${0.05 + r() * 0.09})`;
        x.fillRect(r() * S, i * hgt + r() * hgt, 20 + r() * 90, 1);
      }
      x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, (i + 1) * hgt - 2, S, 2); x.fillRect(cut, i * hgt, 2, hgt);
      y.fillStyle = '#1c1c1c'; y.fillRect(0, (i + 1) * hgt - 2, S, 2);
    }
    return { map: finish(c, 2.4, 0.84, true), bump: finish(b, 2.4, 0.84, false), bumpScale: 0.9, roughness: 0.78 };
  },
  // cladding panels, 1.2 m square, an open joint between them
  panel: () => {
    const S = 256, r = rng(29);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    x.fillStyle = '#f1f1ef'; x.fillRect(0, 0, S, S);
    y.fillStyle = '#909090'; y.fillRect(0, 0, S, S);
    speckle(x, S, 1400, 222, 252, r, 0.2);
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, 0, 3, S); x.fillRect(0, 0, S, 3);
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(3, 3, 2, S); x.fillRect(3, 3, S, 2);
    y.fillStyle = '#181818'; y.fillRect(0, 0, 3, S); y.fillRect(0, 0, S, 3);
    return { map: finish(c, 1.2, 1.2, true), bump: finish(b, 1.2, 1.2, false), bumpScale: 0.8, roughness: 0.7 };
  },
  // running bond: eight courses and four bricks to a tile
  brick: () => {
    const S = 256, r = rng(23);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    x.fillStyle = '#cfc8c0'; x.fillRect(0, 0, S, S);
    y.fillStyle = '#303030'; y.fillRect(0, 0, S, S);
    const rows = 8, cols = 4, bh = S / rows, bw = S / cols, m = 3;
    for (let i = 0; i < rows; i++) {
      for (let j = -1; j <= cols; j++) {
        const ox = (i % 2 ? bw / 2 : 0) + j * bw;
        const v = 205 + Math.round(r() * 45);
        x.fillStyle = `rgb(${v},${v - 6},${v - 10})`;
        x.fillRect(ox + m / 2, i * bh + m / 2, bw - m, bh - m);
        y.fillStyle = '#b0b0b0'; y.fillRect(ox + m / 2, i * bh + m / 2, bw - m, bh - m);
      }
    }
    speckle(x, S, 900, 170, 240, r, 0.2);
    return { map: finish(c, 0.92, 0.6, true), bump: finish(b, 0.92, 0.6, false), bumpScale: 1.6, roughness: 0.9 };
  },
  // three-tab shingles: courses with staggered tabs and a butt shadow
  shingle: () => {
    const S = 256, r = rng(37);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    x.fillStyle = '#e4e4e4'; x.fillRect(0, 0, S, S);
    y.fillStyle = '#808080'; y.fillRect(0, 0, S, S);
    const rows = 6, cols = 5, sh = S / rows, sw = S / cols;
    for (let i = 0; i < rows; i++) {
      for (let j = -1; j <= cols; j++) {
        const ox = (i % 2 ? sw / 2 : 0) + j * sw;
        const v = 196 + Math.round(r() * 56);
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(ox + 1, i * sh, sw - 2, sh);
      }
      x.fillStyle = 'rgba(0,0,0,0.24)'; x.fillRect(0, (i + 1) * sh - 3, S, 3);
      const bg = y.createLinearGradient(0, i * sh, 0, (i + 1) * sh);
      bg.addColorStop(0, '#6a6a6a'); bg.addColorStop(0.9, '#b4b4b4'); bg.addColorStop(1, '#202020');
      y.fillStyle = bg; y.fillRect(0, i * sh, S, sh);
    }
    speckle(x, S, 2600, 170, 255, r, 0.22);
    return { map: finish(c, 1.5, 0.9, true), bump: finish(b, 1.5, 0.9, false), bumpScale: 1.4, roughness: 0.95 };
  },
  plaster: () => {
    const S = 256, r = rng(41);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    x.fillStyle = '#f3f3f1'; x.fillRect(0, 0, S, S);
    y.fillStyle = '#808080'; y.fillRect(0, 0, S, S);
    speckle(x, S, 3200, 215, 255, r, 0.3);
    speckle(y, S, 3200, 90, 170, r, 0.6);
    return { map: finish(c, 2, 2, true), bump: finish(b, 2, 2, false), bumpScale: 0.35, roughness: 0.88 };
  },
  // broom-finished concrete, scored every 1.5 m
  concrete: () => {
    const S = 256, r = rng(53);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    x.fillStyle = '#efefec'; x.fillRect(0, 0, S, S);
    y.fillStyle = '#909090'; y.fillRect(0, 0, S, S);
    speckle(x, S, 4200, 195, 250, r, 0.35);
    speckle(y, S, 2600, 110, 170, r, 0.5);
    for (const [cx, cy] of [[x, y]] as Array<[CanvasRenderingContext2D, CanvasRenderingContext2D]>) {
      cx.fillStyle = 'rgba(70,70,70,0.5)'; cx.fillRect(0, 0, 3, S); cx.fillRect(0, 0, S, 3);
      cy.fillStyle = '#1c1c1c'; cy.fillRect(0, 0, 3, S); cy.fillRect(0, 0, S, 3);
    }
    return { map: finish(c, 1.5, 1.5, true), bump: finish(b, 1.5, 1.5, false), bumpScale: 0.5, roughness: 0.92 };
  },
  asphalt: () => {
    const S = 256, r = rng(67);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    x.fillStyle = '#e2e2e2'; x.fillRect(0, 0, S, S);
    y.fillStyle = '#808080'; y.fillRect(0, 0, S, S);
    speckle(x, S, 9000, 195, 255, r, 0.3);
    speckle(y, S, 7000, 90, 170, r, 0.5);
    return { map: finish(c, 3, 3, true), bump: finish(b, 3, 3, false), bumpScale: 0.4, roughness: 0.96 };
  },
  // turf: soft blotches and a fine blade grain
  grass: () => {
    const S = 512, r = rng(79);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    x.fillStyle = '#e9ece2'; x.fillRect(0, 0, S, S);
    y.fillStyle = '#808080'; y.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const px = r() * S, py = r() * S, rad = 14 + r() * 46, dark = r() < 0.5;
      // drawn again across each edge so the tile repeats without a seam
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        const g = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, rad);
        g.addColorStop(0, dark ? 'rgba(150,164,134,0.075)' : 'rgba(255,255,240,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(px + dx - rad, py + dy - rad, rad * 2, rad * 2);
      }
    }
    speckle(x, S, 16000, 205, 255, r, 0.16);
    speckle(y, S, 16000, 100, 160, r, 0.4);
    return { map: finish(c, 23, 23, true), bump: finish(b, 23, 23, false), bumpScale: 0.12, roughness: 1 };
  },
};

// Surfaces that have a photograph (public/textures/site, from Poly Haven, CC0), and the metres one tile covers.
const PHOTOS: Record<string, number> = { brick: 1.7, asphalt: 3.2, grass: 5.5, plaster: 2.6, shingle: 2.2, concrete: 2.8, wood: 2.2 };

/** The materials of one render. Made once, shared by every mesh, disposed together. */
export class Surfaces {
  private made = new Map<string, THREE.Material>();
  private tiles = new Map<string, Tile>();
  private photos: THREE.Texture[] = [];
  /** Settles as each photographed surface arrives and replaces the drawn one: a still waits for all of them. */
  pending: Array<Promise<void>> = [];

  /** Put the photograph of a surface, and its normal map, in place of the drawn pattern once they have loaded. */
  private photograph(kind: string, m: THREE.MeshStandardMaterial): void {
    const size = PHOTOS[kind];
    if (!size || typeof document === 'undefined') return;
    const loader = new THREE.TextureLoader();
    const one = (file: string, colour: boolean) => new Promise<THREE.Texture | null>(resolve => {
      loader.load(`/textures/site/${file}`, t => {
        t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1 / size, 1 / size);
        t.anisotropy = 8;
        if (colour) t.colorSpace = THREE.SRGBColorSpace;
        this.photos.push(t);
        resolve(t);
      }, undefined, () => resolve(null));
    });
    this.pending.push(Promise.all([one(`${kind}.jpg`, true), one(`${kind}_n.jpg`, false)]).then(([map, normal]) => {
      if (!map || !normal) return;       // the drawn pattern stays
      m.map = map;
      m.bumpMap = null;
      m.normalMap = normal;
      m.normalScale = new THREE.Vector2(0.9, 0.9);
      m.needsUpdate = true;
    }));
  }

  /** A matte, textured surface whose colour comes from the mesh's vertex colours. */
  get(kind: Surface): THREE.Material {
    const hit = this.made.get(kind);
    if (hit) return hit;
    let m: THREE.Material;
    if (kind === 'railing') {
      // thin bars with air between them: one bar to a 0.11 m tile
      const [c, x] = canvas(32);
      x.clearRect(0, 0, 32, 32);
      x.fillStyle = '#ffffff'; x.fillRect(13, 0, 6, 32);
      const map = finish(c, 0.11, 1, true);
      this.tiles.set(kind, { map, bump: map, bumpScale: 0, roughness: 0.6 });
      m = new THREE.MeshStandardMaterial({ vertexColors: true, map, transparent: true, depthWrite: false, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide });
    } else if (kind === 'glassrail') {
      m = new THREE.MeshPhysicalMaterial({ color: 0xcfe2e0, transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.04, metalness: 0, envMapIntensity: 1.3, side: THREE.DoubleSide });
    } else if (kind === 'water') {
      m = new THREE.MeshPhysicalMaterial({ color: 0x3f8fa8, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.2, clearcoat: 1, clearcoatRoughness: 0.05 });
    } else if (kind === 'plain') {
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
    } else {
      const t = DRAW[kind]();
      this.tiles.set(kind, t);
      const drawn = new THREE.MeshStandardMaterial({ vertexColors: true, map: t.map, bumpMap: t.bump, bumpScale: t.bumpScale, roughness: t.roughness, metalness: t.metalness ?? 0 });
      this.photograph(kind, drawn);
      m = drawn;
    }
    this.made.set(kind, m);
    return m;
  }

  /** Window glass: dark, smooth, reflecting the sky. A pane's own tint shows through: a room with its blinds down is paler. */
  glass(): THREE.Material {
    const hit = this.made.get('glass');
    if (hit) return hit;
    const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.07, metalness: 0.82, envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.05 });
    this.made.set('glass', m);
    return m;
  }

  /** Car paint: the vertex colour under a clear coat. */
  paint(): THREE.Material {
    const hit = this.made.get('paint');
    if (hit) return hit;
    const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 1.1 });
    this.made.set('paint', m);
    return m;
  }

  /** A tree's crown seen from the air: clumps of leaf, light and dark, over the instance's own green. */
  canopy(): THREE.Material {
    const hit = this.made.get('canopy');
    if (hit) return hit;
    const S = 256, r = rng(97);
    const [c, x] = canvas(S), [b, y] = canvas(S);
    x.fillStyle = '#c9c9c9'; x.fillRect(0, 0, S, S);
    y.fillStyle = '#707070'; y.fillRect(0, 0, S, S);
    for (let i = 0; i < 520; i++) {
      const px = r() * S, py = r() * S, rad = 5 + r() * 13, light = r() < 0.55;
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        const g = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, rad);
        g.addColorStop(0, light ? 'rgba(255,255,244,0.5)' : 'rgba(40,52,36,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(px + dx - rad, py + dy - rad, rad * 2, rad * 2);
        const h = y.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, rad);
        h.addColorStop(0, light ? 'rgba(235,235,235,0.7)' : 'rgba(20,20,20,0.7)'); h.addColorStop(1, 'rgba(0,0,0,0)');
        y.fillStyle = h; y.fillRect(px + dx - rad, py + dy - rad, rad * 2, rad * 2);
      }
    }
    const map = new THREE.CanvasTexture(c), bump = new THREE.CanvasTexture(b);
    for (const t of [map, bump]) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); }
    map.colorSpace = THREE.SRGBColorSpace;
    this.tiles.set('canopy', { map, bump, bumpScale: 2.2, roughness: 1 });
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, bumpMap: bump, bumpScale: 2.2, roughness: 1, metalness: 0 });
    this.made.set('canopy', m);
    return m;
  }

  /** Leaves: soft and matte, lit a little from behind. */
  foliage(opacity = 1): THREE.Material {
    const key = `foliage:${opacity}`;
    const hit = this.made.get(key);
    if (hit) return hit;
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: opacity < 1, opacity });
    this.made.set(key, m);
    return m;
  }

  dispose(): void {
    for (const m of this.made.values()) m.dispose();
    for (const t of this.tiles.values()) { t.map.dispose(); if (t.bump !== t.map) t.bump.dispose(); }
    for (const t of this.photos) t.dispose();
    this.photos = [];
    this.made.clear();
    this.tiles.clear();
  }
}
