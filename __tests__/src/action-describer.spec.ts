import { describeAction } from '../../src/game/action-describer';

describe('describeAction', () => {
  it('returns ? for null/undefined/non-object', () => {
    expect(describeAction(null)).toBe('?');
    expect(describeAction(undefined)).toBe('?');
    expect(describeAction('string')).toBe('?');
    expect(describeAction(42)).toBe('?');
  });

  it('handles primary actions', () => {
    expect(describeAction({ type: 'DRAW' })).toBe('PIOCHE');
    expect(describeAction({ type: 'DEAL_ROW' })).toBe('DISTRIBUE');
    expect(describeAction({ type: 'AUTO_COMPLETE' })).toBe('AUTO');
    expect(describeAction({ type: 'TAP_WASTE' })).toBe('TAP défausse');
  });

  it('formats column-indexed actions (1-indexed)', () => {
    expect(describeAction({ type: 'PLAY', col: 0 })).toBe('JOUE col1');
    expect(describeAction({ type: 'PLAY', col: 6 })).toBe('JOUE col7');
    expect(describeAction({ type: 'TAP_PILE', index: 4 })).toBe('TAP pile5');
  });

  it('formats MOVE_TABLEAU and MOVE_STACK', () => {
    expect(describeAction({ type: 'MOVE_TABLEAU', fromCol: 0, toCol: 3 })).toBe('MOVE c1→c4');
    expect(describeAction({ type: 'MOVE_STACK', fromCol: 1, toCol: 5, count: 3 })).toBe('MOVE c2→c6 (×3)');
    expect(describeAction({ type: 'MOVE_STACK', fromCol: 0, toCol: 1 })).toBe('MOVE c1→c2 (×1)');
  });

  it('formats TAP_PYRAMID with row/col', () => {
    expect(describeAction({ type: 'TAP_PYRAMID', row: 0, col: 0 })).toBe('TAP r1c1');
    expect(describeAction({ type: 'TAP_PYRAMID', row: 6, col: 6 })).toBe('TAP r7c7');
  });

  it('formats foundation transitions', () => {
    expect(describeAction({ type: 'WASTE_TO_FOUNDATION' })).toBe('DÉFAUSSE→fondation');
    expect(describeAction({ type: 'TABLEAU_TO_FOUNDATION', fromCol: 2 })).toBe('c3→fondation');
    expect(describeAction({ type: 'TO_FOUNDATION', src: 'tableau', col: 0 })).toBe('tableau c1→fondation');
    expect(describeAction({ type: 'TO_FOUNDATION', src: 'waste' })).toBe('waste→fondation');
  });

  it('formats freecell actions', () => {
    expect(describeAction({ type: 'FREECELL_TO_TABLEAU', cellIdx: 0, toCol: 4 })).toBe('freecell1→c5');
    expect(describeAction({ type: 'TABLEAU_TO_FREECELL', fromCol: 2 })).toBe('c3→freecell');
  });

  it('falls back to type for unknown actions', () => {
    expect(describeAction({ type: 'UNKNOWN_ACTION' })).toBe('UNKNOWN ACTION');
    expect(describeAction({ type: 'CUSTOM' })).toBe('CUSTOM');
  });
});
