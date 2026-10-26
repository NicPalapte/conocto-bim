import { describe, expect, it } from 'vitest';
import { coreBounds, type Bounds } from '../src/model/bounds';

function cube(x: number, y = 0, z = 0, size = 1): Bounds {
  return { min: [x, y, z], max: [x + size, y + size, z + size] };
}

describe('coreBounds', () => {
  it('lässt einen weit entfernten Georeferenz-Marker weg', () => {
    const bridge = Array.from({ length: 40 }, (_, i) => cube(i, 0, i % 5));
    const marker = cube(32496, -7, -5565);
    expect(coreBounds([...bridge, marker])).toEqual({ min: [0, 0, 0], max: [40, 1, 5] });
  });

  it('behält eine lange Strecke mit gleichmäßig verteilten Bauteilen ganz', () => {
    const road = Array.from({ length: 50 }, (_, i) => cube(i * 200));
    expect(coreBounds(road)?.max[0]).toBe(49 * 200 + 1);
  });

  it('behält eine Strecke, deren Bauteile sich an einem Ende ballen', () => {
    const knot = Array.from({ length: 90 }, (_, i) => cube(i % 10, 0, Math.floor(i / 10)));
    const road = Array.from({ length: 10 }, (_, i) => cube(100 + i * 500));
    expect(coreBounds([...knot, ...road])?.max[0]).toBe(100 + 9 * 500 + 1);
  });

  it('schneidet nie mehr als die Hälfte weg', () => {
    const a = [cube(0), cube(1)];
    const b = [cube(50000), cube(50001)];
    expect(coreBounds([...a, ...b])).toEqual({ min: [0, 0, 0], max: [50002, 1, 1] });
  });

  it('ignoriert leere und ungültige Hüllen', () => {
    const empty: Bounds = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    expect(coreBounds([empty, cube(2)])).toEqual(cube(2));
    expect(coreBounds([empty])).toBeNull();
  });
});
