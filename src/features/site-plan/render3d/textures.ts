// Surface textures, drawn once on a canvas: lap siding, brick, shingles,
// stucco, concrete with scored joints, asphalt and turf. Each is a light,
// near-white pattern: the colour of a wall or a roof comes from the geometry's
// own vertex colour, so one material serves every house on the street.
import * as THREE from 'three';

export type Surface = 'siding' | 'brick' | 'shingle' | 'plaster' | 'concrete' | 'asphalt' | 'grass' | 'plain';

interface Tile { map: THREE.Texture; bump: THREE.Texture; bumpScale: number; roughness: number }

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

const DRAW: Record<Exclude<Surface, 'plain'>, () => Tile> = {
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
        g.addColorStop(0, dark ? 'rgba(160,172,144,0.09)' : 'rgba(255,255,240,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(px + dx - rad, py + dy - rad, rad * 2, rad * 2);
      }
    }
    speckle(x, S, 16000, 205, 255, r, 0.16);
    speckle(y, S, 16000, 100, 160, r, 0.4);
    return { map: finish(c, 14, 14, true), bump: finish(b, 14, 14, false), bumpScale: 0.12, roughness: 1 };
  },
};

/** The materials of one render. Made once, shared by every mesh, disposed together. */
export class Surfaces {
  private made = new Map<string, THREE.Material>();
  private tiles = new Map<string, Tile>();

  /** A matte, textured surface whose colour comes from the mesh's vertex colours. */
  get(kind: Surface): THREE.Material {
    const hit = this.made.get(kind);
    if (hit) return hit;
    let m: THREE.MeshStandardMaterial;
    if (kind === 'plain') {
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
    } else {
      const t = DRAW[kind]();
      this.tiles.set(kind, t);
      m = new THREE.MeshStandardMaterial({ vertexColors: true, map: t.map, bumpMap: t.bump, bumpScale: t.bumpScale, roughness: t.roughness, metalness: 0 });
    }
    this.made.set(kind, m);
    return m;
  }

  /** Window glass: dark, smooth, reflecting the sky. */
  glass(): THREE.Material {
    const hit = this.made.get('glass');
    if (hit) return hit;
    const m = new THREE.MeshPhysicalMaterial({ color: 0x16222e, roughness: 0.08, metalness: 0.1, reflectivity: 0.7, envMapIntensity: 0.9, clearcoat: 1, clearcoatRoughness: 0.06 });
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
    for (const t of this.tiles.values()) { t.map.dispose(); t.bump.dispose(); }
    this.made.clear();
    this.tiles.clear();
  }
}
