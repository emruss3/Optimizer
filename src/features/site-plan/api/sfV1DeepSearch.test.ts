import { describe, expect, it } from 'vitest';
import { deepSearchLine, deepWinnerPrecedent, type SfV1DeepProgress } from './sfV1Plan';

const base: SfV1DeepProgress = { done: false, triesDone: 3, triesTotal: 15, baselineLots: 17, bestLots: 17, onSheet: false, precedentFrom: null, stopped: false };

describe('deep search wording', () => {
  it('counts tries from the reply while it runs', () => {
    expect(deepSearchLine(base)).toBe('Trying layout 4 of 15…');
  });
  it('says when the first plan stood', () => {
    expect(deepSearchLine({ ...base, done: true, triesDone: 15 })).toBe('Checked 15 layouts. The plan on the sheet was the best.');
  });
  it('names the gain and the built subdivision behind it', () => {
    expect(deepSearchLine({ ...base, done: true, triesDone: 15, bestLots: 21, onSheet: true, precedentFrom: 'MOSSWOOD HGTS' }))
      .toBe('Checked 15 layouts. Found 21 lots, up from 17. Street layout adapted from MOSSWOOD HGTS, a built subdivision.');
  });
  it('does not claim a gain that is not on the sheet', () => {
    expect(deepSearchLine({ ...base, done: true, triesDone: 15, bestLots: 21, onSheet: false })).toBe('Checked 15 layouts. The plan on the sheet was the best.');
  });
  it('says when it stopped early', () => {
    expect(deepSearchLine({ ...base, stopped: true })).toBe('Checked 3 layouts. The search stopped early; the plan on the sheet stands.');
  });
  it('reads the winning precedent from the tries', () => {
    expect(deepWinnerPrecedent({ best_try: 5, tries: [{ try: 5, pattern: 'precedent', precedent_from: 'X PLACE' }] })).toBe('X PLACE');
    expect(deepWinnerPrecedent({ best_try: 2, tries: [{ try: 2, pattern: 'grid' }] })).toBeNull();
    expect(deepWinnerPrecedent({ best_try: 0, tries: [] })).toBeNull();
  });
});
