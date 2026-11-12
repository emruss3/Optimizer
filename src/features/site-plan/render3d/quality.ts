// How much the rendering asks of the device. A machine with graphics
// acceleration draws everything. One without it (a software renderer, as in a
// remote desktop, a virtual machine or a test runner) would take many seconds
// a frame, so it gets a lighter picture of the same plan: trees as painted
// cards, plain neighbours, a smaller shadow map and no ambient occlusion.
export type RenderQuality = 'full' | 'light';

let found: RenderQuality | null = null;

/** The quality this device is given. `window.__renderQuality` overrides it, for a capture that must be at full quality. */
export function renderQuality(): RenderQuality {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'full';
  const forced = (window as unknown as { __renderQuality?: string }).__renderQuality;
  if (forced === 'full' || forced === 'light') return forced;
  if (found) return found;
  found = 'full';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    if (isSoftwareRenderer(name)) found = 'light';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // a device that will not say what draws for it is given the full picture
  }
  return found;
}

/** Whether a renderer's name is that of one that draws on the processor. */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}
