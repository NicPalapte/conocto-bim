import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GAEBParseError,
  GAEBValidationError,
  GAEBVersionError,
  fileExtension,
  isGaebExtension,
} from './core';
import type { Vec3 } from './model/bounds';
import { dimensionOf, listPositions, type Dimension, type LoadedLv } from './model/lv';
import {
  applyRule,
  defaultTakeoff,
  emptyGroup,
  members,
  parseLinksFile,
  toLinksFile,
  type ElementFacts,
  type Rule,
} from './model/takeoff';
import {
  dedupe,
  formatArea,
  formatCoordinate,
  formatLength,
  formatVolume,
  partKeys,
  segment,
} from './model/measure';
import type { ElementProps } from './model/properties';
import {
  buildTree,
  filterTree,
  findPath,
  idsByCategory,
  placementOf,
  type ItemLabel,
  type Placement,
  type TreeNode,
} from './model/tree';
import { AxisGizmo } from './ui/AxisGizmo';
import { ConoctoMark } from './ui/ConoctoMark';
import { MeasureLabels, type MeasureMode, type Measurement } from './ui/MeasureLabels';
import { TreeLevel } from './ui/ModelTree';
import { LvList } from './ui/LvList';
import { PositionCard } from './ui/PositionCard';
import { RuleEditor } from './ui/RuleEditor';
import { PropertiesPanel, type GroupInfo } from './ui/PropertiesPanel';
import {
  BimEngine,
  type ElementAxes,
  type Pick,
  type Snap,
  type SnapKind,
  type ViewAxes,
} from './viewer/engine';

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

function amberColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--amber').trim() || '#b36200';
}

const factKey = (modelId: string, localId: number) => `${modelId}#${localId}`;

function accentColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--blue').trim() || '#c8362b';
}

const MODES: { mode: MeasureMode; label: string; hint: string }[] = [
  { mode: 'point', label: 'Punkt', hint: 'Punkt antippen' },
  { mode: 'distance', label: 'Strecke', hint: 'Start- und Endpunkt antippen' },
  { mode: 'area', label: 'Fläche', hint: 'Bauteilseiten antippen, Summe oben' },
  { mode: 'volume', label: 'Volumen', hint: 'Bauteil antippen' },
];

const SNAP_LABEL: Record<SnapKind, string> = {
  vertex: 'Eckpunkt',
  edge: 'Kante',
  axis: 'Bauteilachse',
  surface: 'Fläche',
};

/** Messarten, bei denen Punkte einrasten. */
function snaps(mode: MeasureMode | null): boolean {
  return mode === 'point' || mode === 'distance';
}

function isIfc(file: File): boolean {
  return /\.ifc$/i.test(file.name);
}

function isGaeb(file: File): boolean {
  return isGaebExtension(fileExtension(file.name));
}

const GAEB_ACCEPT = '.x81,.x82,.x83,.x84,.x85,.x86,.xml';

/** Messart, deren Summe zur Einheit einer Position passt. */
const MODE_OF: Record<Dimension, MeasureMode> = {
  length: 'distance',
  area: 'area',
  volume: 'volume',
};

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
  const lvInput = useRef<HTMLInputElement>(null);
  const [lv, setLv] = useState<LoadedLv | null>(null);
  const [positionId, setPositionId] = useState<string | null>(null);
  // Mengenregeln je Position (Fingerabdruck) und was der Viewer über Bauteile weiß.
  const [rules, setRules] = useState<Record<string, Rule>>({});
  const [facts, setFacts] = useState<Map<string, ElementFacts>>(new Map());
  const factsRequested = useRef(new Set<string>());
  const [factsLoading, setFactsLoading] = useState(0);
  const [picking, setPicking] = useState(false);
  const rulesInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<MeasureMode | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  // Messen läuft asynchron; der Abgleich braucht den Stand zum Zeitpunkt des Antippens.
  const measurementsRef = useRef(measurements);
  measurementsRef.current = measurements;
  const [pending, setPending] = useState<{ point: Vec3; axes: ElementAxes | null } | null>(null);
  const [hover, setHover] = useState<Snap | null>(null);
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
      const gaeb = files.filter(isGaeb);
      if (ifc.length + gaeb.length < files.length) {
        setError('Nur IFC- und GAEB-Dateien (X81–X86) werden geöffnet.');
      }
      // Es gibt immer nur ein LV: die zuletzt gewählte GAEB-Datei ersetzt das alte.
      const lvFile = gaeb.at(-1);
      if (lvFile) {
        try {
          setLv(listPositions(new Uint8Array(await lvFile.arrayBuffer()), lvFile.name));
          setPositionId(null);
        } catch (err) {
          const known =
            err instanceof GAEBParseError ||
            err instanceof GAEBValidationError ||
            err instanceof GAEBVersionError;
          if (!known) console.error(err);
          setError(`${lvFile.name} konnte nicht gelesen werden${known ? `: ${err.message}` : '.'}`);
        }
      }
      if (!ifc.length) return;
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

  const removeMeasurement = useCallback(
    (id: string) => {
      engine.removeDrawing(id);
      setMeasurements((list) => list.filter((m) => m.id !== id));
    },
    [engine],
  );

  const measure = useCallback(
    async (snap: Snap) => {
      if (!mode) return;
      const id = crypto.randomUUID();
      const add = (m: Omit<Measurement, 'id' | 'kind'>) =>
        setMeasurements((list) => [...list, { id, kind: mode, ...m }]);
      const { point } = snap;
      if (mode === 'point') {
        const c = engine.siteCoordinate(point);
        const [x, y, z] = c.map ?? c.model;
        engine.drawPoints(id, [point]);
        add({
          anchor: point,
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
          setPending({ point, axes: snap.axes });
          engine.drawPoints('pending', [point]);
          return;
        }
        engine.removeDrawing('pending');
        engine.drawPreview(null, null);
        setPending(null);
        const a = engine.siteCoordinate(pending.point).model;
        const b = engine.siteCoordinate(point).model;
        const s = segment(a, b);
        engine.drawPoints(id, [pending.point, point]);
        engine.drawLine(id, pending.point, point);
        add({
          value: s.length,
          anchor: pending.point.map((v, i) => (v + point[i]) / 2) as Vec3,
          lines: [
            formatLength(s.length),
            `waagerecht ${formatLength(s.horizontal)}`,
            `Höhe ${s.rise >= 0 ? '+' : '−'}${formatLength(Math.abs(s.rise))}`,
          ],
        });
        return;
      }
      if (!snap.pick) return;
      const element = `${snap.pick.modelId}#${snap.pick.localId}`;
      if (mode === 'area') {
        const face = await engine.faceAt({ ...snap.pick, point });
        if (!face) {
          setError('Hier wurde keine Bauteilfläche gefunden.');
          return;
        }
        const parts = partKeys(element, face);
        const check = dedupe(measurementsRef.current, parts);
        if ('remove' in check) return removeMeasurement(check.remove);
        if (!check.fresh.length) {
          setError('Diese Fläche ist schon gemessen.');
          return;
        }
        const fresh = new Set(check.fresh);
        const kept = face.filter((_, i) => fresh.has(parts[i]));
        const area = await engine.drawFace(id, snap.pick, kept);
        add({
          anchor: point,
          value: area,
          parts: check.fresh,
          lines: [
            formatArea(area),
            kept.length < face.length ? 'Bauteilseite ohne schon Gemessenes' : 'Bauteilseite',
          ],
        });
        return;
      }
      const check = dedupe(measurementsRef.current, [element]);
      if ('remove' in check) return removeMeasurement(check.remove);
      const volume = await engine.volume(snap.pick);
      const props = await engine.readProperties(snap.pick).catch(() => null);
      const fromModel = props?.groups
        .filter((g) => g.kind === 'quantities')
        .flatMap((g) => g.rows)
        .find((r) => /volume/i.test(r.label));
      await engine.drawHull(id, snap.pick);
      add({
        anchor: point,
        value: volume,
        parts: [element],
        lines: [
          formatVolume(volume),
          props?.name ?? 'Bauteil',
          ...(fromModel ? [`im Modell: ${fromModel.label} ${fromModel.value}`] : []),
        ],
      });
    },
    [engine, mode, pending, removeMeasurement],
  );

  const clearMeasurements = useCallback(() => {
    engine.clearDrawings();
    setMeasurements([]);
    setPending(null);
    setHover(null);
  }, [engine]);

  const startMode = useCallback(
    (next: MeasureMode | null) => {
      engine.removeDrawing('pending');
      engine.drawPreview(null, null);
      setPending(null);
      setHover(null);
      setMode(next);
      if (next) setSelection(null);
    },
    [engine],
  );

  // Beim Messen zeigt eine Marke unter dem Zeiger, wo der Punkt einrastet. Immer nur eine
  // Abfrage gleichzeitig; Bewegungen dazwischen zählen nur mit ihrer letzten Position.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !snaps(mode)) return;
    let busy = false;
    let next: PointerEvent | null = null;
    let active = true;
    const run = async (e: PointerEvent) => {
      busy = true;
      const snap = await engine.snap(e, pending, e.altKey);
      busy = false;
      if (!active) return;
      setHover(snap);
      engine.drawPreview(pending?.point ?? null, snap?.point ?? null);
      if (next) {
        const latest = next;
        next = null;
        void run(latest);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons || e.pointerType === 'touch') return;
      if (busy) next = e;
      else void run(e);
    };
    const onLeave = () => {
      next = null;
      setHover(null);
      engine.drawPreview(null, null);
    };
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
    return () => {
      active = false;
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      engine.drawPreview(null, null);
    };
  }, [engine, mode, pending]);

  // Nach einem Klick in 3D die gewählte Zeile im Baum sichtbar machen.
  useEffect(() => {
    if (!selection) return;
    const row = document.querySelector('.tree-row.selected');
    row?.scrollIntoView({ block: 'nearest' });
  }, [selection, expanded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (picking) setPicking(false);
      else if (pending) {
        engine.removeDrawing('pending');
        engine.drawPreview(null, null);
        setPending(null);
      } else if (mode) setMode(null);
      else setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, mode, pending, picking]);

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
  const total = useMemo(() => {
    if (mode !== 'area' && mode !== 'volume') return null;
    const values = measurements.filter((m) => m.kind === mode && m.value !== undefined);
    if (values.length < 2) return null;
    const sum = values.reduce((n, m) => n + (m.value ?? 0), 0);
    return {
      count: values.length,
      text: `${mode === 'area' ? formatArea(sum) : formatVolume(sum)} · ${values.length}`,
    };
  }, [mode, measurements]);
  const position = lv?.positions.find((p) => p.id === positionId) ?? null;
  const rule = position ? (rules[position.id] ?? null) : null;
  const ruleCategory = rule?.group.category ?? null;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of models) {
      for (const [category, ids] of idsByCategory(m.tree)) {
        counts.set(category, (counts.get(category) ?? 0) + ids.size);
      }
    }
    return [...counts]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [models]);

  const loadFacts = useCallback(
    async (modelId: string, ids: number[]) => {
      if (!ids.length) return;
      setFactsLoading((n) => n + 1);
      try {
        const loaded = await engine.elementFacts(modelId, ids);
        setFacts((prev) => {
          const next = new Map(prev);
          for (const f of loaded) next.set(factKey(f.modelId, f.localId), f);
          return next;
        });
      } catch (err) {
        console.error(err);
        setError('Bauteildaten konnten nicht gelesen werden.');
      } finally {
        setFactsLoading((n) => n - 1);
      }
    },
    [engine],
  );

  // Bauteildaten der gewählten Klasse einmal je Modell laden.
  useEffect(() => {
    if (!ruleCategory) return;
    for (const m of models) {
      const key = `${m.id}|${ruleCategory}`;
      if (factsRequested.current.has(key)) continue;
      factsRequested.current.add(key);
      void loadFacts(m.id, [...(idsByCategory(m.tree).get(ruleCategory) ?? [])]);
    }
  }, [models, ruleCategory, loadFacts]);

  const candidates = useMemo(() => {
    if (!rule) return [];
    const add = new Set(rule.group.add);
    return [...facts.values()].filter(
      (f) => (ruleCategory !== null && f.category === ruleCategory) || add.has(f.guid),
    );
  }, [facts, rule, ruleCategory]);
  const result = useMemo(() => (rule ? applyRule(candidates, rule) : null), [candidates, rule]);

  // Hervorhebung: Auswahl, sonst die Bauteile der Mengenregel (ohne Wert amber).
  useEffect(() => {
    if (selection) {
      void engine.highlight({ [selection.modelId]: new Set(selection.ids) }, accentColor());
      return;
    }
    if (!result?.rows.length) {
      void engine.highlight(null, accentColor());
      return;
    }
    const valued: Record<string, Set<number>> = {};
    const missing: Record<string, Set<number>> = {};
    for (const { element, quantity } of result.rows) {
      const target = quantity === null ? missing : valued;
      (target[element.modelId] ??= new Set()).add(element.localId);
    }
    void engine.highlightGroups([
      { items: valued, color: accentColor() },
      { items: missing, color: amberColor() },
    ]);
  }, [engine, selection, result]);

  const setRule = useCallback(
    (next: Rule) => setRules((r) => ({ ...r, [next.position]: next })),
    [],
  );

  // Im Modell antippen: Bauteil zur Gruppe dazu oder heraus.
  const togglePick = useCallback(
    async (hit: Pick) => {
      if (!rule) return;
      const key = factKey(hit.modelId, hit.localId);
      let element = facts.get(key);
      if (!element) {
        const [loaded] = await engine.elementFacts(hit.modelId, [hit.localId]);
        if (!loaded) return;
        element = loaded;
        setFacts((prev) => new Map(prev).set(key, loaded));
      }
      const { guid } = element;
      const group = rule.group;
      const isMember = members([element], group).length > 0;
      const without = (list: string[]) => list.filter((g) => g !== guid);
      setRule({
        ...rule,
        group: isMember
          ? group.add.includes(guid)
            ? { ...group, add: without(group.add) }
            : { ...group, remove: [...group.remove, guid] }
          : group.remove.includes(guid)
            ? { ...group, remove: without(group.remove) }
            : { ...group, add: [...group.add, guid] },
      });
    },
    [engine, facts, rule, setRule],
  );

  // Klick (ohne Ziehen) in der 3D-Ansicht wählt ein Bauteil oder misst.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      setHover(null);
    };
    const onUp = async (e: PointerEvent) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 4 || models.length === 0) return;
      if (mode) {
        const snap = snaps(mode)
          ? await engine.snap(e, pending, e.altKey)
          : await engine.snap(e, null, true);
        if (snap) await measure(snap);
        return;
      }
      const hit = await engine.pick(e);
      if (picking) {
        if (hit) await togglePick(hit);
        return;
      }
      selectElement(hit);
    };
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointerup', onUp);
    return () => {
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
    };
  }, [engine, models.length, selectElement, mode, pending, measure, picking, togglePick]);

  const measured = useMemo(() => {
    if (result && rule)
      return { sum: result.sum, count: result.rows.length, from: 'rule' as const };
    const dimension = position ? dimensionOf(position.unit) : null;
    if (!dimension) return null;
    const values = measurements.filter(
      (m) => m.kind === MODE_OF[dimension] && m.value !== undefined,
    );
    if (!values.length) return null;
    return {
      sum: values.reduce((n, m) => n + (m.value ?? 0), 0),
      count: values.length,
      from: 'measure' as const,
    };
  }, [position, measurements, result, rule]);

  const saveRules = () => {
    if (!lv) return;
    const file = toLinksFile({ fileId: lv.fileId, name: lv.name }, Object.values(rules));
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lv.name.replace(/\.[^.]+$/, '')}.mengen.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadRules = async (file: File) => {
    try {
      const data = parseLinksFile(await file.text());
      setRules((r) => ({
        ...r,
        ...Object.fromEntries(data.rules.map((x) => [x.position, x])),
      }));
      if (lv && data.lv.fileId !== lv.fileId) {
        setError(`Die Regeln stammen aus „${data.lv.name}“, einer anderen LV-Datei.`);
      }
    } catch {
      setError(`${file.name} ist keine Regeldatei von Conocto BIM.`);
    }
  };

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
          {totalElements.toLocaleString('de-DE')} Bauteile
          {lv ? ` · LV ${lv.positions.length.toLocaleString('de-DE')} Positionen` : ''} · nur lokal
        </span>
        <input
          ref={rulesInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void loadRules(file);
          }}
        />
        <input
          ref={lvInput}
          type="file"
          accept={GAEB_ACCEPT}
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void addFiles(files);
          }}
        />
        <button type="button" className="btn" onClick={() => lvInput.current?.click()}>
          LV hinzufügen
        </button>
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

      {(models.length > 0 || loading.length > 0 || lv) && (
        <aside
          className={`panel panel-left float${selection || position ? ' hidden-small' : ''}`}
          aria-label="Modelle und LV"
        >
          {(models.length > 0 || loading.length > 0) && (
            <section className="section" aria-label="Modelle">
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
            </section>
          )}
          {lv && (
            <LvList
              lv={lv}
              selectedId={positionId}
              ruled={new Set(Object.keys(rules))}
              onSaveRules={Object.keys(rules).length ? saveRules : null}
              onLoadRules={() => rulesInput.current?.click()}
              onSelect={(id) => {
                setPositionId(id);
                setSelection(null);
              }}
              onRemove={() => {
                setLv(null);
                setPositionId(null);
              }}
            />
          )}
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
              {total && (
                <span className="sum" title={`${total.count} Messungen zusammen`}>
                  Σ {total.text}
                </span>
              )}
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

      {position && !selection && (
        <PositionCard
          position={position}
          measured={measured}
          rule={
            rule && result ? (
              <RuleEditor
                rule={rule}
                unit={position.unit}
                categories={categories}
                candidates={candidates}
                loading={factsLoading > 0}
                result={result}
                picking={picking}
                onChange={setRule}
                onPicking={(on) => {
                  setPicking(on);
                  if (on) startMode(null);
                }}
                onFocus={(e) => void engine.fit({ [e.modelId]: new Set([e.localId]) })}
                onRemove={() => {
                  setPicking(false);
                  setRules(({ [rule.position]: _, ...rest }) => rest);
                }}
              />
            ) : null
          }
          onCreateRule={() =>
            setRule({
              position: position.id,
              group: emptyGroup(),
              takeoff: defaultTakeoff(dimensionOf(position.unit), position.unit),
            })
          }
          measuring={(() => {
            const dimension = dimensionOf(position.unit);
            return dimension !== null && mode === MODE_OF[dimension];
          })()}
          onMeasure={(dimension) => startMode(MODE_OF[dimension])}
          onClose={() => {
            setPicking(false);
            setPositionId(null);
          }}
        />
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
          <p>
            Modelle und LV (GAEB) hierher ziehen oder hinzufügen. Sie bleiben auf diesem Rechner.
          </p>
          <div className="empty-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileInput.current?.click()}
            >
              IFC hinzufügen
            </button>
            {!lv && (
              <button type="button" className="btn" onClick={() => lvInput.current?.click()}>
                LV hinzufügen
              </button>
            )}
          </div>
        </div>
      )}

      {hover && hover.kind !== 'surface' && <SnapMarker snap={hover} engine={engine} />}

      <MeasureLabels
        measurements={measurements}
        project={(p) => engine.project(p)}
        onRemove={removeMeasurement}
      />

      {models.length > 0 && axes && (
        <AxisGizmo axes={axes} onTop={() => void engine.viewFromTop()} />
      )}

      {models.length > 0 && (
        <div className={`hint float${mode || picking ? ' measuring' : ''}`}>
          {mode
            ? [
                pending ? 'Endpunkt antippen' : MODES.find((m) => m.mode === mode)?.hint,
                ...(snaps(mode) ? [hover ? snapLabel(hover) : 'Alt = ohne Einrasten'] : []),
                'Esc beendet',
              ].join(' · ')
            : picking
              ? 'Bauteil antippen: zur Gruppe dazu oder heraus · Esc beendet'
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

      {dragging && <div className="drop">IFC- oder GAEB-Dateien ablegen</div>}
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

function snapLabel(snap: Snap): string {
  if (snap.kind === 'axis') return `entlang Bauteil-${'XYZ'[snap.axis ?? 0]}`;
  return SNAP_LABEL[snap.kind];
}

/** Fangmarke: Quadrat = Eckpunkt, Raute = Kante, Kreis = Bauteilachse. */
function SnapMarker({ snap, engine }: { snap: Snap; engine: BimEngine }) {
  const at = engine.project(snap.point);
  if (!at.visible) return null;
  return (
    <div
      className={`snap-marker kind-${snap.kind}`}
      style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
      aria-hidden="true"
    />
  );
}
