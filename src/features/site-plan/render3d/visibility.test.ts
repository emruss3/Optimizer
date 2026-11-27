import { describe, expect, it } from 'vitest';
import { choosePlace, CLOSE_BARS, countSeen, mainBlocker, seenWords, unseenReason, type Seen } from './visibility';

// an 8 × 8 probe: the picture is the middle 4 × 4 (x and y 2..5)
const W = 8, H = 8;
function frames(paint: (x: number, y: number) => { only: boolean; full: [number, number, number] }) {
  const full = new Uint8Array(W * H * 4), only = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, p = paint(x, y);
    if (p.only) only.set([255, 255, 255, 255], i);
    full.set([...p.full, 255], i);
  }
  return { full, only };
}
const WHITE: [number, number, number] = [255, 255, 255], GREEN: [number, number, number] = [0, 255, 0], RED: [number, number, number] = [255, 0, 0], BLUE: [number, number, number] = [0, 0, 255], SKY: [number, number, number] = [0, 0, 0];

describe('countSeen', () => {
  it('counts what of the building is in the picture, in view, and what hides the rest', () => {
    // the building fills the picture; a tree hides its left column, a wall its bottom-right pixel
    const { full, only } = frames((x, y) => {
      const mine = x >= 2 && x <= 5 && y >= 2 && y <= 5;
      return { only: mine, full: !mine ? SKY : x === 2 ? GREEN : x === 5 && y === 5 ? RED : WHITE };
    });
    const seen = countSeen(full, only, W, H, 'b1')!;
    expect(seen.framed).toBe(1);
    expect(seen.coverage).toBe(1);
    expect(seen.hiddenBy.vegetation).toBeCloseTo(4 / 16);
    expect(seen.hiddenBy.structures).toBeCloseTo(1 / 16);
    expect(seen.visible).toBeCloseTo(11 / 16);
    expect(mainBlocker(seen)).toBe('vegetation');
  });
  it('counts the part of the building outside the picture against the framing', () => {
    // the building runs off the right of the picture: columns 4..7, rows 2..5
    const { full, only } = frames((x, y) => ({ only: x >= 4 && y >= 2 && y <= 5, full: x >= 4 && y >= 2 && y <= 5 ? WHITE : SKY }));
    const seen = countSeen(full, only, W, H, 'b1')!;
    expect(seen.framed).toBeCloseTo(8 / 16);
    expect(seen.visible).toBe(1);
  });
  it('sees parked cars apart from planting and walls, and nothing when the building is not drawn', () => {
    const { full, only } = frames((x, y) => ({ only: x >= 2 && x <= 5 && y >= 2 && y <= 5, full: y === 5 ? BLUE : WHITE }));
    expect(countSeen(full, only, W, H, 'b1')!.hiddenBy.vehicles).toBeCloseTo(4 / 16);
    const empty = frames(() => ({ only: false, full: WHITE }));
    expect(countSeen(empty.full, empty.only, W, H, 'b1')).toBeNull();
  });
});

const seen = (visible: number, framed = 1, coverage = 0.2, veg = 0): Seen => ({ subject: 'b1', visible, framed, coverage, hiddenBy: { vegetation: veg, structures: 1 - visible - veg, vehicles: 0 } });

describe('choosePlace', () => {
  it('takes the first place that shows the building well, not the first found', () => {
    const r = choosePlace([{ shot: 'a', seen: seen(0.2, 1, 0.2, 0.7) }, { shot: 'b', seen: seen(0.8) }, { shot: 'c', seen: seen(0.95) }]);
    expect(r.pick?.shot).toBe('b');
    expect(r.quality).toBe('good');
  });
  it('falls back to the best partial view, then to none with the best measurement for the reason', () => {
    const partial = choosePlace([{ shot: 'a', seen: seen(0.35) }, { shot: 'b', seen: seen(0.5) }]);
    expect(partial.pick?.shot).toBe('b');
    expect(partial.quality).toBe('partial');
    const none = choosePlace([{ shot: 'a', seen: seen(0.1, 1, 0.2, 0.85) }, { shot: 'b', seen: null }]);
    expect(none.pick).toBeNull();
    expect(none.best?.visible).toBe(0.1);
    expect(unseenReason(none.best, 2, 'House 3')).toBe('from the 2 eye-level places checked, at most 10% of House 3 is visible: trees and planting hide the rest');
  });
  it('rejects a place where the building is a speck in the picture', () => {
    expect(choosePlace([{ shot: 'a', seen: seen(1, 1, 0.002) }]).pick).toBeNull();
  });
});

describe('seenWords', () => {
  it('names the building, how much is seen and in frame, and what hides it', () => {
    expect(seenWords(seen(0.7, 0.95, 0.2, 0.25), 'House 1')).toBe('House 1: 70% visible, 95% in frame; trees and planting hide 25%, buildings, walls or ground hide 5%');
    expect(seenWords(seen(1), 'House 1')).toBe('House 1: 100% visible, 100% in frame');
  });
});

describe('close views', () => {
  it('judge an entrance view by what is in the picture, not by holding the whole building', () => {
    const door = seen(0.95, 0.35, 0.6);
    expect(choosePlace([{ shot: 'a', seen: door }]).pick).toBeNull();
    expect(choosePlace([{ shot: 'a', seen: door }], CLOSE_BARS).pick?.shot).toBe('a');
    expect(choosePlace([{ shot: 'a', seen: seen(0.2, 0.3, 0.6, 0.7) }], CLOSE_BARS).pick).toBeNull();
  });
});
