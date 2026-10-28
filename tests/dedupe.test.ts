import { describe, expect, it } from 'vitest';
import { dedupe, partKeys } from '../src/model/measure';

describe('doppelt messen', () => {
  const side = { id: 'a', parts: partKeys('m#1', [0, 1, 2, 3]) };

  it('nimmt dieselbe Seite beim zweiten Antippen heraus', () => {
    expect(dedupe([side], partKeys('m#1', [1, 2, 3, 0]))).toEqual({ remove: 'a' });
  });

  it('zählt bei Überlappung nur den neuen Teil', () => {
    expect(dedupe([side], partKeys('m#1', [3, 4, 5, 6, 7, 8, 9]))).toEqual({
      fresh: partKeys('m#1', [4, 5, 6, 7, 8, 9]),
    });
  });

  it('erkennt dasselbe Bauteil beim Volumen', () => {
    const volume = { id: 'v', parts: partKeys('m#7') };
    expect(dedupe([volume], partKeys('m#7'))).toEqual({ remove: 'v' });
    expect(dedupe([volume], partKeys('m#8'))).toEqual({ fresh: ['m#8'] });
  });
});
