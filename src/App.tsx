import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Vec3 } from './model/bounds';
import { formatArea, formatCoordinate, formatLength, formatVolume, segment } from './model/measure';
import type { ElementProps } from './model/properties';
import {
  buildTree,
  filterTree,
  findPath,
  placementOf,
  type ItemLabel,
  type Placement,
  type TreeNode,
} from './model/tree';
import { AxisGizmo } from './ui/AxisGizmo';
import { ConoctoMark } from './ui/ConoctoMark';
import { MeasureLabels, type MeasureMode, type Measurement } from './ui/MeasureLabels';
import { TreeLevel } from './ui/ModelTree';
import { PropertiesPanel, type GroupInfo } from './ui/PropertiesPanel';
import { BimEngine, type Pick, type SurfacePick, type ViewAxes } from './viewer/engine';

interface ModelEntry {
  id: string;
  name: string;
  schema: string;
  visible: boolean;
  tree: TreeNode[];
  labels: Map<number, ItemLabel>;
  elementCount: number;
}

interface Loading {
  key: string;
  name: string;
  share: number;
}

interface Selection {
  modelId: string;
  key: string;
  ids: number[];
  /** Gesetzt, wenn genau ein Bauteil gewählt ist. */
  element: number | null;
  group: GroupInfo | null;
}

const NO_PLACEMENT: Placement = { facility: null, part: null };

function accentColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--blue').trim() || '#c8362b';
}

const MODES: { mode: MeasureMode; label: string; hint: string }[] = [
  { mode: 'point', label: 'Punkt', hint: 'Punkt antippen' },
  { mode: 'distance', label: 'Strecke', hint: 'Start- und Endpunkt antippen' },
  { mode: 'area', label: 'Fläche', hint: 'Fläche eines Bauteils antippen' },
  { mode: 'volume', label: 'Volumen', hint: 'Bauteil antippen' },
];

function isIfc(file: File): boolean {
  return /\.ifc$/i.test(file.name);
}

export function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BimEngine | null>(null);
  engineRef.current ??= new BimEngine();
  const engine = engineRef.current;

  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState<Loading[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [props, setProps] = useState<ElementProps | null>(null);
  const [propsLoading, setPropsLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<MeasureMode | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [pending, setPending] = useState<Vec3 | null>(null);
  const [axes, setAxes] = useState<ViewAxes | null>(null);
  // Zählt Kamerabewegungen; Etiketten werden damit neu positioniert.
  const [, setViewTick] = useState(0);

  useEffect(() => {
    if (!stageRef.current) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void engine.init(stageRef.current).then(() => {
      if (cancelled) return;
      engine.setOverlayColor(accentColor());
      stop = engine.onViewChange(() => {
        setAxes(engine.viewAxes());
        setViewTick((t) => t + 1);
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [engine]);

  // Auswahl → Hervorhebung im Modell.
  useEffect(() => {
    const items = selection ? { [selection.modelId]: new Set(selection.ids) } : null;
    void engine.highlight(items, accentColor());
  }, [engine, selection]);

  // Eigenschaften nur für ein einzelnes Bauteil lesen.
  useEffect(() => {
    if (!selection || selection.element === null) {
      setProps(null);
      return;
    }
    let current = true;
    setPropsLoading(true);
    engine
      .readProperties({ modelId: selection.modelId, localId: selection.element })
      .then((p) => current && setProps(p))
      .catch(() => current && setProps(null))
      .finally(() => current && setPropsLoading(false));
    return () => {
      current = false;
    };
  }, [engine, selection]);

  const addFiles = useCallback(
    async (files: File[]) => {
      const ifc = files.filter(isIfc);
      if (ifc.length < files.length) setError('Nur .ifc-Dateien werden geöffnet.');
      await engine.init(stageRef.current!);
      for (const file of ifc) {
        const key = crypto.randomUUID();
        setLoading((l) => [...l, { key, name: file.name, share: 0 }]);
        try {
          const loaded = await engine.load(file, (share) =>
            setLoading((l) => l.map((x) => (x.key === key ? { ...x, share } : x))),
          );
          const { root, labels } = await engine.readStructure(loaded.id);
          const tree = buildTree(loaded.id, root, labels);
          const elementCount = tree.reduce((n, t) => n + t.elementIds.length, 0);
          setModels((m) => [
            ...m,
            {
              id: loaded.id,
              name: file.name,
              schema: loaded.schema,
              visible: true,
              tree,
              labels,
              elementCount,
            },
          ]);
          // Modell und die ganze räumliche Gliederung aufklappen, Klassen bleiben zu.
          setExpanded((e) => {
            const next = new Set(e);
            next.add(loaded.id);
            for (const key of spatialKeys(tree)) next.add(key);
            return next;
          });
        } catch (err) {
          console.error(err);
          setError(`${file.name} konnte nicht gelesen werden.`);
        } finally {
          setLoading((l) => l.filter((x) => x.key !== key));
        }
      }
    },
    [engine],
  );

  // Ganze Fenster ist Ablagefläche für IFC-Dateien.
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      depth += 1;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) void addFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [addFiles]);

  const selectElement = useCallback(
    (pick: Pick | null) => {
      if (!pick) {
        setSelection(null);
        return;
      }
      const model = models.find((m) => m.id === pick.modelId);
      const path = model ? findPath(model.tree, pick.localId) : null;
      const node = path?.at(-1);
      setSelection({
        modelId: pick.modelId,
        key: node?.key ?? `${pick.modelId}/${pick.localId}`,
        ids: [pick.localId],
        element: pick.localId,
        group: null,
      });
      // Im Baum bis zum Bauteil aufklappen.
      if (path) {
        setExpanded((e) => {
          const next = new Set(e);
          next.add(pick.modelId);
          for (const n of path.slice(0, -1)) next.add(n.key);
          return next;
        });
      }
    },
    [models],
  );

  const measure = useCallback(
    async (pick: SurfacePick) => {
      if (!mode) return;
      const id = crypto.randomUUID();
      const add = (m: Omit<Measurement, 'id' | 'kind'>) =>
        setMeasurements((list) => [...list, { id, kind: mode, ...m }]);
      if (mode === 'point') {
        const c = engine.siteCoordinate(pick.point);
        const [x, y, z] = c.map ?? c.model;
        engine.drawPoints(id, [pick.point]);
        add({
          anchor: pick.point,
          lines: c.map
            ? [
                `O ${formatCoordinate(x)}`,
                `N ${formatCoordinate(y)}`,
                `H ${formatCoordinate(z)}`,
                c.crs ?? 'Landeskoordinaten',
              ]
            : [
                `X ${formatCoordinate(x)}`,
                `Y ${formatCoordinate(y)}`,
                `Z ${formatCoordinate(z)}`,
                'Modellkoordinaten',
              ],
        });
        return;
      }
      if (mode === 'distance') {
        if (!pending) {
          setPending(pick.point);
          engine.drawPoints('pending', [pick.point]);
          return;
        }
        engine.removeDrawing('pending');
        setPending(null);
        const a = engine.siteCoordinate(pending).model;
        const b = engine.siteCoordinate(pick.point).model;
        const s = segment(a, b);
        engine.drawPoints(id, [pending, pick.point]);
        engine.drawLine(id, pending, pick.point);
        add({
          anchor: pending.map((v, i) => (v + pick.point[i]) / 2) as Vec3,
          lines: [
            formatLength(s.length),
            `waagerecht ${formatLength(s.horizontal)}`,
            `Höhe ${s.rise >= 0 ? '+' : '−'}${formatLength(Math.abs(s.rise))}`,
          ],
        });
        return;
      }
      if (mode === 'area') {
        const area = await engine.measureFace(id, pick);
        if (area === null) {
          setError('Hier wurde keine ebene Fläche gefunden.');
          return;
        }
        add({ anchor: pick.point, lines: [formatArea(area), 'ebene Teilfläche'] });
        return;
      }
      const volume = await engine.volume(pick);
      const props = await engine.readProperties(pick).catch(() => null);
      const fromModel = props?.groups
        .filter((g) => g.kind === 'quantities')
        .flatMap((g) => g.rows)
        .find((r) => /volume/i.test(r.label));
      engine.drawPoints(id, [pick.point]);
      add({
        anchor: pick.point,
        lines: [
          formatVolume(volume),
          props?.name ?? 'Bauteil',
          ...(fromModel ? [`im Modell: ${fromModel.label} ${fromModel.value}`] : []),
        ],
      });
    },
    [engine, mode, pending],
  );

  const removeMeasurement = useCallback(
    (id: string) => {
      engine.removeDrawing(id);
      setMeasurements((list) => list.filter((m) => m.id !== id));
    },
    [engine],
  );

  const clearMeasurements = useCallback(() => {
    engine.clearDrawings();
    setMeasurements([]);
    setPending(null);
  }, [engine]);

  const startMode = useCallback(
    (next: MeasureMode | null) => {
      engine.removeDrawing('pending');
      setPending(null);
      setMode(next);
      if (next) setSelection(null);
    },
    [engine],
  );

  // Klick (ohne Ziehen) in der 3D-Ansicht wählt ein Bauteil oder misst.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = async (e: PointerEvent) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 4 || models.length === 0) return;
      if (mode) {
        const hit = await engine.pickSurface(e);
        if (hit) await measure(hit);
        return;
      }
      selectElement(await engine.pick(e));
    };
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointerup', onUp);
    return () => {
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
    };
  }, [engine, models.length, selectElement, mode, measure]);

  // Nach einem Klick in 3D die gewählte Zeile im Baum sichtbar machen.
  useEffect(() => {
    if (!selection) return;
    const row = document.querySelector('.tree-row.selected');
    row?.scrollIntoView({ block: 'nearest' });
  }, [selection, expanded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pending) {
        engine.removeDrawing('pending');
        setPending(null);
      } else if (mode) setMode(null);
      else setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, mode, pending]);

  const toggle = useCallback((key: string) => {
    setExpanded((e) => {
      const next = new Set(e);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectNode = useCallback((modelId: string, node: TreeNode) => {
    if (node.kind === 'element' && node.localId !== null) {
      setSelection({
        modelId,
        key: node.key,
        ids: node.elementIds,
        element: node.localId,
        group: null,
      });
      return;
    }
    setSelection({
      modelId,
      key: node.key,
      ids: node.elementIds,
      element: null,
      group: { category: node.category, label: node.label, count: node.elementIds.length },
    });
    setExpanded((e) => new Set(e).add(node.key));
  }, []);

  const focusNode = useCallback(
    (modelId: string, node: TreeNode) => {
      if (node.elementIds.length) void engine.fit({ [modelId]: new Set(node.elementIds) });
    },
    [engine],
  );

  const visibleIds = models.filter((m) => m.visible).map((m) => m.id);
  const selectionMap = selection ? { [selection.modelId]: new Set(selection.ids) } : null;

  const setVisible = (id: string, visible: boolean) => {
    setModels((m) => m.map((x) => (x.id === id ? { ...x, visible } : x)));
    void engine.setModelVisible(id, visible);
    if (!visible && selection?.modelId === id) setSelection(null);
  };

  const removeModel = (id: string) => {
    setModels((m) => m.filter((x) => x.id !== id));
    if (selection?.modelId === id) setSelection(null);
    void engine.remove(id);
  };

  const filtered = useMemo(
    () => models.map((m) => ({ model: m, nodes: filterTree(m.tree, query, m.labels) })),
    [models, query],
  );
  const searching = query.trim().length > 0;

  const selectedModel = models.find((m) => m.id === selection?.modelId);
  const placement =
    selectedModel && selection?.element != null
      ? placementOf(selectedModel.tree, selection.element)
      : NO_PLACEMENT;
  const totalElements = models.reduce((n, m) => n + m.elementCount, 0);

  return (
    <>
      <div ref={stageRef} className="stage" />

      <header className="topbar float">
        <span className="wordmark">
          <ConoctoMark />
          conocto <span className="sub">bim</span>
        </span>
        <span className="spacer" />
        <span className="meta">
          {models.length === 1 ? '1 Modell' : `${models.length} Modelle`} ·{' '}
          {totalElements.toLocaleString('de-DE')} Bauteile · nur lokal
        </span>
        <input
          ref={fileInput}
          type="file"
          accept=".ifc"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void addFiles(files);
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => fileInput.current?.click()}
        >
          IFC hinzufügen
        </button>
      </header>

      {(models.length > 0 || loading.length > 0) && (
        <aside
          className={`panel panel-left float${selection ? ' hidden-small' : ''}`}
          aria-label="Modelle"
        >
          <div className="panel-head">
            <span className="label">Modelle</span>
            <input
              className="search"
              type="search"
              placeholder="Name, Klasse oder GUID"
              aria-label="Bauteil suchen"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="scroll" role="tree">
            {filtered.map(({ model, nodes }) => (
              <div key={model.id}>
                <div className="model-row">
                  <input
                    type="checkbox"
                    checked={model.visible}
                    aria-label={`${model.name} anzeigen`}
                    onChange={(e) => setVisible(model.id, e.target.checked)}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ padding: 0, width: 12 }}
                    aria-label={expanded.has(model.id) ? 'Zuklappen' : 'Aufklappen'}
                    onClick={() => toggle(model.id)}
                  >
                    {expanded.has(model.id) || searching ? '▾' : '▸'}
                  </button>
                  <span className="name" title={model.name}>
                    {model.name}
                  </span>
                  <span className="meta">{model.schema.replace('_ADD2', '')}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`${model.name} entfernen`}
                    onClick={() => removeModel(model.id)}
                  >
                    ✕
                  </button>
                </div>
                {(expanded.has(model.id) || searching) && (
                  <TreeLevel
                    nodes={nodes}
                    depth={0}
                    expanded={searching ? new Set(allKeys(nodes)) : expanded}
                    selectedKey={selection?.key ?? null}
                    onToggle={toggle}
                    onSelect={(n) => selectNode(model.id, n)}
                    onFocus={(n) => focusNode(model.id, n)}
                  />
                )}
              </div>
            ))}
            {loading.map((l) => (
              <div key={l.key} className="loading-row">
                {l.name}
                <div className="bar">
                  <span style={{ width: `${Math.round(l.share * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {models.length > 0 && (
        <div className="toolbar float" role="toolbar" aria-label="Ansicht">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await engine.showAll(visibleIds);
              await engine.fit();
            }}
          >
            ⤢ Alles zeigen
          </button>
          {mode ? (
            <>
              <span className="divider" />
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  className={`btn${mode === m.mode ? ' active' : ''}`}
                  aria-pressed={mode === m.mode}
                  onClick={() => startMode(m.mode)}
                >
                  {m.label}
                </button>
              ))}
              <span className="divider" />
              <button
                type="button"
                className="btn"
                disabled={measurements.length === 0 && !pending}
                onClick={clearMeasurements}
              >
                Löschen
              </button>
              <button type="button" className="btn" onClick={() => startMode(null)}>
                Fertig
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                disabled={!selectionMap}
                onClick={() => selectionMap && void engine.isolate(selectionMap)}
              >
                ◎ Isolieren
              </button>
              <button
                type="button"
                className="btn"
                disabled={!selectionMap}
                onClick={() => {
                  if (!selectionMap) return;
                  void engine.hide(selectionMap);
                  setSelection(null);
                }}
              >
                ◌ Ausblenden
              </button>
              <button type="button" className="btn" onClick={() => startMode('distance')}>
                ⟷ Messen
              </button>
            </>
          )}
        </div>
      )}

      {selection && selectedModel && (
        <PropertiesPanel
          modelName={selectedModel.name}
          element={props}
          group={selection.group}
          placement={placement}
          loading={propsLoading}
          onClose={() => setSelection(null)}
        />
      )}

      {models.length === 0 && loading.length === 0 && (
        <div className="empty float surface">
          <h1>IFC-Modelle ansehen</h1>
          <p>Dateien hierher ziehen oder hinzufügen. Sie bleiben auf diesem Rechner.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileInput.current?.click()}
          >
            IFC hinzufügen
          </button>
        </div>
      )}

      <MeasureLabels
        measurements={measurements}
        project={(p) => engine.project(p)}
        onRemove={removeMeasurement}
      />

      {models.length > 0 && axes && (
        <AxisGizmo axes={axes} onTop={() => void engine.viewFromTop()} />
      )}

      {models.length > 0 && (
        <div className={`hint float${mode ? ' measuring' : ''}`}>
          {mode
            ? `${pending ? 'Endpunkt antippen' : MODES.find((m) => m.mode === mode)?.hint} · Esc beendet`
            : 'Ziehen dreht · Rad zoomt · Klick wählt · Doppelklick im Baum zoomt'}
        </div>
      )}

      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Hinweis schließen"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      {dragging && <div className="drop">IFC-Dateien ablegen</div>}
    </>
  );
}

function spatialKeys(nodes: TreeNode[], into: string[] = []): string[] {
  for (const n of nodes) {
    if (n.kind !== 'spatial') continue;
    into.push(n.key);
    spatialKeys(n.children, into);
  }
  return into;
}

function allKeys(nodes: TreeNode[], into: string[] = []): string[] {
  for (const n of nodes) {
    into.push(n.key);
    allKeys(n.children, into);
  }
  return into;
}
