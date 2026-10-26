import { describe, expect, it } from 'vitest';
import {
  buildTree,
  className,
  filterTree,
  placementOf,
  type ItemLabel,
  type RawSpatialItem,
} from '../src/model/tree';

// Ausschnitt aus der Fragments-Gliederung einer IFC-4.3-Brücke:
// Projekt → Gelände → Brücke → Unterbau → Pfeiler → Stütze/Fundament.
const raw: RawSpatialItem = {
  category: 'IFCPROJECT',
  localId: null,
  children: [
    {
      category: null,
      localId: 1,
      children: [
        {
          category: 'IFCSITE',
          localId: null,
          children: [
            {
              category: null,
              localId: 2,
              children: [
                {
                  category: 'IFCBRIDGE',
                  localId: null,
                  children: [
                    {
                      category: null,
                      localId: 3,
                      children: [
                        {
                          category: 'IFCBRIDGEPART',
                          localId: null,
                          children: [
                            {
                              category: null,
                              localId: 4,
                              children: [
                                {
                                  category: 'IFCCOLUMN',
                                  localId: null,
                                  children: [{ category: null, localId: 10 }],
                                },
                                {
                                  category: 'IFCFOOTING',
                                  localId: null,
                                  children: [
                                    { category: null, localId: 12 },
                                    { category: null, localId: 11 },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const labels = new Map<number, ItemLabel>([
  [1, { name: 'Projekt', guid: 'p' }],
  [2, { name: 'Gelände', guid: 's' }],
  [3, { name: 'BW 3.2', guid: 'b' }],
  [4, { name: 'Pfeiler Achse 20', guid: 'bp' }],
  [10, { name: 'Pfeilerschaft', guid: '0Gl168Rv1ErxU_Zx$i1I5m' }],
  [11, { name: 'Fundament B', guid: 'f2' }],
  [12, { name: 'Fundament A', guid: 'f1' }],
]);

describe('buildTree', () => {
  const tree = buildTree('m1', raw, labels);

  it('lässt das Projekt weg und beginnt beim Gelände', () => {
    expect(tree).toHaveLength(1);
    expect(tree[0].label).toBe('Gelände');
    expect(tree[0].kind).toBe('spatial');
  });

  it('gruppiert Bauteile je IFC-Klasse unter dem Bauwerksteil', () => {
    const pier = tree[0].children[0].children[0];
    expect(pier.label).toBe('Pfeiler Achse 20');
    expect(pier.children.map((c) => c.label)).toEqual(['IfcColumn', 'IfcFooting']);
    expect(pier.children[1].children.map((c) => c.label)).toEqual(['Fundament A', 'Fundament B']);
  });

  it('zählt nur Bauteile, keine räumlichen Objekte', () => {
    expect(tree[0].elementIds.sort()).toEqual([10, 11, 12]);
  });

  it('findet Bauwerk und Teil über einem Bauteil', () => {
    const p = placementOf(tree, 10);
    expect(p.facility?.label).toBe('BW 3.2');
    expect(p.part?.label).toBe('Pfeiler Achse 20');
  });

  it('filtert nach Name, Klasse und exakter GUID', () => {
    expect(filterTree(tree, 'fundament a', labels)[0].elementIds).toEqual([12]);
    expect(filterTree(tree, 'ifccolumn', labels)[0].elementIds).toEqual([10]);
    expect(filterTree(tree, '0Gl168Rv1ErxU_Zx$i1I5m', labels)[0].elementIds).toEqual([10]);
    expect(filterTree(tree, 'gibt es nicht', labels)).toEqual([]);
  });
});

describe('className', () => {
  it('schreibt IFC-Klassen wie im Schema', () => {
    expect(className('IFCBRIDGEPART')).toBe('IfcBridgePart');
    expect(className('IFCEARTHWORKSFILL')).toBe('IfcEarthworksFill');
    expect(className('IFCWALL')).toBe('IfcWall');
    expect(className('IFCUNBEKANNT')).toBe('IfcUnbekannt');
  });
});
