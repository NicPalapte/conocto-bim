import { describe, expect, it } from 'vitest';
import { buildElementProps, definitionIds, type RawItem } from '../src/model/properties';

const v = (value: unknown, type?: string) => ({ value, type });

// Form wie Fragments `getItemsData` sie liefert (Bauteil aus der IFC-4.3-Beispielbrücke).
const column: RawItem = {
  _category: v('IFCCOLUMN'),
  _localId: v(335),
  _guid: v('0Gl168Rv1ErxU_Zx$i1I5m'),
  Name: v('road river bridge pierstem'),
  ObjectType: v('pierstem'),
  PredefinedType: v('NOTDEFINED'),
  IsDefinedBy: [
    { _category: v('IFCCOLUMNTYPE'), _localId: v(333), Name: v('Rundpfeiler D 1,20') },
    { _category: v('IFCELEMENTQUANTITY'), _localId: v(394), Name: v('Qto_ColumnBaseQuantities') },
    { _category: v('IFCPROPERTYSET'), _localId: v(400), Name: v('Pset_ColumnCommon') },
  ],
  HasAssociations: [{ _category: v('IFCMATERIAL'), _localId: v(337), Name: v('C35/45') }],
  ContainedInStructure: [{ _category: v('IFCBRIDGEPART'), _localId: v(434), Name: v('Pfeiler') }],
};

const definitions: RawItem[] = [
  {
    _category: v('IFCCOLUMNTYPE'),
    _localId: v(333),
    Name: v('Rundpfeiler D 1,20'),
    HasPropertySets: [{ _category: v('IFCPROPERTYSET'), _localId: v(500) }],
  },
  {
    _category: v('IFCELEMENTQUANTITY'),
    _localId: v(394),
    Name: v('Qto_ColumnBaseQuantities'),
    Quantities: [
      { _category: v('IFCQUANTITYVOLUME'), Name: v('NetVolume'), VolumeValue: v(8.1430124) },
      { _category: v('IFCQUANTITYLENGTH'), Name: v('Length'), LengthValue: v(7.2) },
    ],
  },
  {
    _category: v('IFCPROPERTYSET'),
    _localId: v(400),
    Name: v('Pset_ColumnCommon'),
    HasProperties: [
      { _category: v('IFCPROPERTYSINGLEVALUE'), Name: v('LoadBearing'), NominalValue: v(true) },
      { _category: v('IFCPROPERTYSINGLEVALUE'), Name: v('Reference'), NominalValue: v('P20') },
    ],
  },
  // Gleichnamiges Set am Typ: das Exemplar gewinnt.
  {
    _category: v('IFCPROPERTYSET'),
    _localId: v(500),
    Name: v('Pset_ColumnCommon'),
    HasProperties: [{ Name: v('LoadBearing'), NominalValue: v(false) }],
  },
];

describe('buildElementProps', () => {
  const props = buildElementProps(column, definitions);

  it('liest Kopfdaten, Typ, Material und Behälter', () => {
    expect(props.category).toBe('IFCCOLUMN');
    expect(props.name).toBe('road river bridge pierstem');
    expect(props.guid).toBe('0Gl168Rv1ErxU_Zx$i1I5m');
    expect(props.type).toBe('Rundpfeiler D 1,20');
    expect(props.material).toBe('C35/45');
    expect(props.container).toBe('Pfeiler');
  });

  it('lässt NOTDEFINED weg', () => {
    expect(props.basics).toEqual([{ label: 'Objekttyp', value: 'pierstem' }]);
  });

  it('stellt Mengen mit Einheit und deutschem Komma vor die Property-Sets', () => {
    expect(props.groups[0]).toEqual({
      title: 'Qto_ColumnBaseQuantities',
      kind: 'quantities',
      rows: [
        { label: 'NetVolume', value: '8,143 m³' },
        { label: 'Length', value: '7,2 m' },
      ],
    });
  });

  it('nimmt Property-Sets vom Exemplar vor gleichnamigen vom Typ', () => {
    const psets = props.groups.filter((g) => g.kind === 'properties');
    expect(psets).toHaveLength(1);
    expect(psets[0].rows).toEqual([
      { label: 'LoadBearing', value: 'Ja' },
      { label: 'Reference', value: 'P20' },
    ]);
  });

  it('nennt alle Definitionen zum Nachladen', () => {
    expect(definitionIds(column)).toEqual([333, 394, 400, 337]);
  });
});
