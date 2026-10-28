import * as OBC from '@thatopen/components';
import * as FRAGS from '@thatopen/fragments';
import * as THREE from 'three';
import {
  attr,
  buildElementProps,
  definitionIds,
  elementValues,
  rel,
  type ElementProps,
  type RawItem,
} from '../model/properties';
import { coreBounds, type Bounds, type Vec3 } from '../model/bounds';
import type { ElementFacts } from '../model/takeoff';
import { parseMapConversion, toMap, type MapConversion } from '../model/georef';
import { surfaceAt, triangleNormal } from '../model/measure';
import {
  along,
  closestOnLineToRay,
  orthonormal,
  snapGeometry,
  type SnapGeometry,
} from '../model/snap';
import { collectIds, type ItemLabel, type RawSpatialItem } from '../model/tree';
import { MeasureOverlay } from './overlay';

export interface LoadedModel {
  id: string;
  name: string;
  schema: string;
  model: FRAGS.FragmentsModel;
}

export interface Pick {
  modelId: string;
  localId: number;
}

/** Getroffener Punkt auf einem Bauteil, in Szenen-Koordinaten. */
export interface SurfacePick extends Pick {
  point: Vec3;
}

export type SnapKind = 'vertex' | 'edge' | 'axis' | 'surface';

/** Achsen eines Bauteils (x, y, z) als Einheitsvektoren in Szenen-Koordinaten. */
export type ElementAxes = [Vec3, Vec3, Vec3];

/** Punkt, an dem ein Messklick landet, mit Art des Einrastens. */
export interface Snap {
  point: Vec3;
  kind: SnapKind;
  /** Getroffenes Bauteil; bei Achsen-Einrasten neben dem Modell `null`. */
  pick: Pick | null;
  /** Achsen des getroffenen Bauteils, für die Richtung der nächsten Strecke. */
  axes: ElementAxes | null;
  /** 0 = x, 1 = y, 2 = z bei `kind === 'axis'`. */
  axis?: number;
}

interface ElementGeometry {
  /** Dreiecke in Szenen-Koordinaten, je Dreieck 9 Zahlen. */
  triangles: number[];
  axes: ElementAxes;
  snap: SnapGeometry | null;
}

// Fangradien in Bildschirmpixeln: Eckpunkt vor Achse vor Kante.
const SNAP_VERTEX_PX = 12;
const SNAP_AXIS_PX = 10;
const SNAP_EDGE_PX = 8;
const GEOMETRY_CACHE = 64;
const FACTS_CHUNK = 100;

/** Koordinate eines Punkts: im Modell (IFC, Meter) und, falls georeferenziert, im Kartennetz. */
export interface SiteCoordinate {
  model: Vec3;
  map: Vec3 | null;
  crs: string | null;
}

/** Bildschirmrichtung der IFC-Achsen X (Ost), Y (Nord), Z (Höhe); y zeigt nach unten. */
export type ViewAxes = Record<'x' | 'y' | 'z', { dx: number; dy: number; depth: number }>;

export type Progress = (share: number) => void;

type World = OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>;

function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).href;
}

/** Liest das IFC-Schema aus dem STEP-Kopf, ohne die ganze Datei zu parsen. */
export function readSchema(bytes: Uint8Array): string {
  const head = new TextDecoder().decode(bytes.subarray(0, 4096));
  return /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(head)?.[1] ?? '?';
}

/**
 * Kapselt That Open (web-ifc + Fragments + Three.js). Die UI kennt nur diese Klasse,
 * damit ein späterer Wechsel der 3D-Bibliothek an einer Stelle passiert.
 */
export class BimEngine {
  private readonly components = new OBC.Components();
  private world!: World;
  private fragments!: OBC.FragmentsManager;
  private loader!: OBC.IfcLoader;
  private hider!: OBC.Hider;
  private alignments = new Map<string, THREE.Object3D>();
  private sceneRadius = 0;
  private grid: OBC.SimpleGrid | null = null;
  private readonly overlay = new MeasureOverlay();
  private georef: MapConversion | null = null;
  private georefKnown = false;
  private readonly geometries = new Map<string, ElementGeometry>();
  private ready: Promise<void> | null = null;

  init(container: HTMLElement): Promise<void> {
    this.ready ??= this.setup(container);
    return this.ready;
  }

  private async setup(container: HTMLElement): Promise<void> {
    const worlds = this.components.get(OBC.Worlds);
    const world = worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();
    world.scene = new OBC.SimpleScene(this.components);
    world.scene.setup();
    // Transparenter Hintergrund: die Seitenfarbe (hell/dunkel) bleibt sichtbar.
    world.scene.three.background = null;
    world.renderer = new OBC.SimpleRenderer(this.components, container, { alpha: true });
    world.camera = new OBC.SimpleCamera(this.components);
    world.camera.controls.setLookAt(60, 40, 60, 0, 0, 0);
    this.components.init();
    this.world = world;
    this.grid = this.components.get(OBC.Grids).create(world);
    // Neutralgrau ist auf hellem und dunklem Hintergrund lesbar.
    this.grid.config.color = new THREE.Color('#aeaeb2');
    this.grid.config.visible = false;
    world.scene.three.add(this.overlay.group);

    this.fragments = this.components.get(OBC.FragmentsManager);
    this.fragments.init(assetUrl('worker/fragments-worker.mjs'));
    world.camera.controls.addEventListener('rest', () => {
      void this.fragments.core.update(true);
    });
    this.fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(world.camera.three);
      world.scene.three.add(model.object);
      void this.fragments.core.update(true);
    });

    this.loader = this.components.get(OBC.IfcLoader);
    await this.loader.setup({
      autoSetWasm: false,
      wasm: { path: assetUrl('wasm/'), absolute: true },
    });
    this.hider = this.components.get(OBC.Hider);
  }

  get canvas(): HTMLCanvasElement {
    return this.world.renderer!.three.domElement;
  }

  async load(file: File, onProgress: Progress): Promise<LoadedModel> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const schema = readSchema(bytes);
    // Die Georeferenz des ersten Modells gilt für alle: That Open richtet weitere Modelle
    // am ersten aus. Sie steht im Dateikopf, deshalb reichen die ersten 2 MB.
    if (this.fragments.list.size === 0) this.georefKnown = false;
    if (!this.georefKnown) {
      this.georef = parseMapConversion(new TextDecoder().decode(bytes.subarray(0, 2 ** 21)));
      this.georefKnown = true;
    }
    const id = `${file.name}#${crypto.randomUUID().slice(0, 8)}`;
    const model = await this.loader.load(bytes, true, id, {
      processData: { progressCallback: (share) => onProgress(share) },
      instanceCallback: (importer) => {
        // Standard lädt nur Gebäude-Gliederung; Infrastruktur (IfcFacility, IfcAlignment …)
        // und alle Property-Sets brauchen die vollständigen Attribute und Beziehungen.
        importer.addAllAttributes();
        importer.addAllRelations();
      },
    });
    try {
      const group = await model.getAlignments();
      if (group.children.length > 0) {
        this.world.scene.three.add(group);
        this.alignments.set(model.modelId, group);
      }
    } catch {
      // Modelle ohne Achse: nichts zu zeichnen.
    }
    await this.fragments.core.update(true);
    await this.fit();
    return { id: model.modelId, name: file.name, schema, model };
  }

  async remove(modelId: string): Promise<void> {
    const group = this.alignments.get(modelId);
    if (group) {
      this.world.scene.three.remove(group);
      this.alignments.delete(modelId);
    }
    for (const key of [...this.geometries.keys()]) {
      if (key.startsWith(`${modelId}\n`)) this.geometries.delete(key);
    }
    await this.fragments.core.disposeModel(modelId);
  }

  async pick(event: PointerEvent | MouseEvent): Promise<Pick | null> {
    const hit = await this.fragments.raycast({
      camera: this.world.camera.three,
      mouse: new THREE.Vector2(event.clientX, event.clientY),
      dom: this.canvas,
    });
    return hit ? { modelId: hit.fragments.modelId, localId: hit.localId } : null;
  }

  async pickSurface(event: PointerEvent | MouseEvent): Promise<SurfacePick | null> {
    const hit = await this.fragments.raycast({
      camera: this.world.camera.three,
      mouse: new THREE.Vector2(event.clientX, event.clientY),
      dom: this.canvas,
    });
    if (!hit) return null;
    return {
      modelId: hit.fragments.modelId,
      localId: hit.localId,
      point: hit.point.toArray() as Vec3,
    };
  }

  /**
   * Szenen-Punkt → Koordinate der Datei. That Open verschiebt Modelle zum Nullpunkt und
   * dreht auf „Y oben“; beides wird hier zurückgerechnet (IFC: x Ost, y Nord, z Höhe).
   */
  siteCoordinate(point: Vec3): SiteCoordinate {
    const p = new THREE.Vector3(...point).applyMatrix4(
      this.fragments.baseCoordinationMatrix.clone().invert(),
    );
    const model: Vec3 = [p.x, -p.z, p.y];
    return {
      model,
      map: this.georef ? toMap(model, this.georef) : null,
      crs: this.georef?.crs ?? null,
    };
  }

  /**
   * Wohin ein Messklick einrastet: Eckpunkt, Kante oder Fläche des getroffenen Bauteils.
   * Mit `from` (erster Punkt einer Strecke) zusätzlich entlang der Bauteilachsen x, y, z,
   * auch neben dem Modell. `free` schaltet das Einrasten aus.
   */
  async snap(
    event: PointerEvent | MouseEvent,
    from: { point: Vec3; axes: ElementAxes | null } | null,
    free = false,
  ): Promise<Snap | null> {
    const hit = await this.pickSurface(event);
    const geometry = hit ? await this.geometry(hit) : null;
    const surface: Snap | null = hit
      ? { point: hit.point, kind: 'surface', pick: hit, axes: geometry?.axes ?? null }
      : null;
    if (free) return surface;
    const cursor = { x: event.clientX, y: event.clientY };
    const distance = (p: Vec3) => {
      const s = this.project(p);
      return Math.hypot(s.x - cursor.x, s.y - cursor.y);
    };
    const ray = this.ray(event);

    if (hit && geometry) {
      geometry.snap ??= snapGeometry(geometry.triangles);
      let best: Vec3 | null = null;
      let bestDist = SNAP_VERTEX_PX;
      for (const v of geometry.snap.vertices) {
        const d = distance(v);
        if (d < bestDist) [best, bestDist] = [v, d];
      }
      if (best) return { ...surface!, point: best, kind: 'vertex' };
    }

    if (from?.axes) {
      const start = this.project(from.point);
      if (Math.hypot(start.x - cursor.x, start.y - cursor.y) > SNAP_AXIS_PX * 2) {
        let best: Snap | null = null;
        let bestDist = SNAP_AXIS_PX;
        from.axes.forEach((dir, axis) => {
          const p = along(from.point, dir, closestOnLineToRay(from.point, dir, ...ray));
          const d = distance(p);
          if (d < bestDist) {
            bestDist = d;
            best = { point: p, kind: 'axis', axis, pick: hit, axes: from.axes };
          }
        });
        if (best) return best;
      }
    }

    if (hit && geometry?.snap) {
      let best: Vec3 | null = null;
      let bestDist = SNAP_EDGE_PX;
      for (const [a, b] of geometry.snap.edges) {
        const dir: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const t = Math.min(Math.max(closestOnLineToRay(a, dir, ...ray), 0), 1);
        const p = along(a, dir, t);
        const d = distance(p);
        if (d < bestDist) [best, bestDist] = [p, d];
      }
      if (best) return { ...surface!, point: best, kind: 'edge' };
    }
    return surface;
  }

  /** Dreiecke der Bauteilseite am getroffenen Punkt (auch gekrümmt). */
  async faceAt(pick: SurfacePick): Promise<number[] | null> {
    const { triangles } = await this.geometry(pick);
    return surfaceAt(triangles, pick.point)?.triangles ?? null;
  }

  /** Dreiecke eines Bauteils unter `id` einzeichnen; liefert ihre Fläche in m². */
  async drawFace(id: string, pick: Pick, picked: number[]): Promise<number> {
    const { triangles } = await this.geometry(pick);
    this.overlay.addFace(
      id,
      picked.flatMap((t) => triangles.slice(t * 9, t * 9 + 9)),
    );
    return picked.reduce((sum, t) => sum + triangleNormal(triangles, t).area, 0);
  }

  /** Volumen eines Bauteils aus der Geometrie, in m³. */
  async volume(pick: Pick): Promise<number> {
    return this.model(pick.modelId).getItemsVolume([pick.localId]);
  }

  /** Ganze Hülle eines Bauteils einfärben. */
  async drawHull(id: string, pick: Pick): Promise<void> {
    this.overlay.addFace(id, (await this.geometry(pick)).triangles);
  }

  /** Vorschau beim Messen: Gummiband vom ersten Punkt und Fangpunkt unter dem Zeiger. */
  drawPreview(from: Vec3 | null, to: Vec3 | null): void {
    this.overlay.remove('preview');
    if (from && to) this.overlay.addLine('preview', from, to, true);
  }

  private ray(event: PointerEvent | MouseEvent): [Vec3, Vec3] {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.world.camera.three);
    return [raycaster.ray.origin.toArray() as Vec3, raycaster.ray.direction.toArray() as Vec3];
  }

  /** Dreiecke und Achsen eines Bauteils in Szenen-Koordinaten; die letzten 64 bleiben gemerkt. */
  private async geometry(pick: Pick): Promise<ElementGeometry> {
    const key = `${pick.modelId}\n${pick.localId}`;
    const cached = this.geometries.get(key);
    if (cached) return cached;
    const model = this.model(pick.modelId);
    const [meshes = []] = await model.getItemsGeometry([pick.localId]);
    const triangles: number[] = [];
    let axes: ElementAxes | null = null;
    const v = new THREE.Vector3();
    for (const mesh of meshes) {
      if (!mesh.positions) continue;
      const matrix = model.object.matrixWorld.clone().multiply(mesh.transform);
      if (!axes) {
        // Lage des Bauteils: Spalten der Drehung = Bauteilachsen x, y, z.
        const x = new THREE.Vector3();
        const y = new THREE.Vector3();
        const z = new THREE.Vector3();
        matrix.extractBasis(x, y, z);
        axes = orthonormal(x.toArray() as Vec3, z.toArray() as Vec3);
      }
      const index = mesh.indices ?? Array.from({ length: mesh.positions.length / 3 }, (_, i) => i);
      for (let i = 0; i + 2 < index.length; i += 3) {
        for (let c = 0; c < 3; c++) {
          const k = index[i + c] * 3;
          v.set(mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]);
          v.applyMatrix4(matrix);
          triangles.push(v.x, v.y, v.z);
        }
      }
    }
    const geometry: ElementGeometry = {
      triangles,
      axes: axes ?? [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      snap: null,
    };
    if (this.geometries.size >= GEOMETRY_CACHE) {
      this.geometries.delete(this.geometries.keys().next().value!);
    }
    this.geometries.set(key, geometry);
    return geometry;
  }

  drawPoints(id: string, points: Vec3[]): void {
    this.overlay.addPoints(id, points);
  }

  drawLine(id: string, a: Vec3, b: Vec3): void {
    this.overlay.addLine(id, a, b);
  }

  setOverlayColor(color: string): void {
    this.overlay.setColor(color);
  }

  removeDrawing(id: string): void {
    this.overlay.remove(id);
  }

  clearDrawings(): void {
    this.overlay.clear();
  }

  /** Bildschirmposition eines Szenen-Punkts relativ zur Zeichenfläche. */
  project(point: Vec3): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(...point).project(this.world.camera.three);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
      visible: v.z > -1 && v.z < 1,
    };
  }

  /** Meldet jede Kamerabewegung und Größenänderung, höchstens einmal je Bild. */
  onViewChange(listener: () => void): () => void {
    let frame = 0;
    const notify = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        listener();
      });
    };
    const controls = this.world.camera.controls;
    controls.addEventListener('update', notify);
    window.addEventListener('resize', notify);
    notify();
    return () => {
      controls.removeEventListener('update', notify);
      window.removeEventListener('resize', notify);
      cancelAnimationFrame(frame);
    };
  }

  viewAxes(): ViewAxes {
    const rotation = new THREE.Matrix4().extractRotation(
      this.world.camera.three.matrixWorldInverse,
    );
    const axis = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(rotation);
      return { dx: v.x, dy: -v.y, depth: v.z };
    };
    // IFC x = Szene x, IFC y (Nord) = Szene −z, IFC z (Höhe) = Szene y.
    return { x: axis(1, 0, 0), y: axis(0, 0, -1), z: axis(0, 1, 0) };
  }

  /** Draufsicht auf den aktuellen Mittelpunkt, Norden oben. */
  async viewFromTop(): Promise<void> {
    const controls = this.world.camera.controls;
    const target = controls.getTarget(new THREE.Vector3());
    const distance = this.world.camera.three.position.distanceTo(target);
    // Ein Hauch nach Süden versetzt: genau senkrecht verliert die Kamera die Nordrichtung.
    await controls.setLookAt(
      target.x,
      target.y + distance,
      target.z + distance * 1e-4,
      target.x,
      target.y,
      target.z,
      true,
    );
  }

  /** Hebt Bauteile in der Akzentfarbe hervor; `null` hebt die Hervorhebung auf. */
  async highlight(items: OBC.ModelIdMap | null, color: string): Promise<void> {
    await this.fragments.resetHighlight();
    if (items) {
      await this.fragments.highlight(
        {
          color: new THREE.Color(color),
          renderedFaces: FRAGS.RenderedFaces.TWO,
          opacity: 1,
          transparent: false,
        },
        items,
      );
    }
    await this.fragments.core.update(true);
  }

  async setModelVisible(modelId: string, visible: boolean): Promise<void> {
    const model = this.fragments.list.get(modelId);
    if (!model) return;
    await model.setVisible(undefined, visible);
    const group = this.alignments.get(modelId);
    if (group) group.visible = visible;
    await this.fragments.core.update(true);
  }

  async isolate(items: OBC.ModelIdMap): Promise<void> {
    await this.hider.isolate(items);
    await this.fragments.core.update(true);
  }

  async hide(items: OBC.ModelIdMap): Promise<void> {
    await this.hider.set(false, items);
    await this.fragments.core.update(true);
  }

  async showAll(visibleModels: string[]): Promise<void> {
    const items: OBC.ModelIdMap = {};
    for (const id of visibleModels) {
      const model = this.fragments.list.get(id);
      if (model) items[id] = new Set(await model.getLocalIds());
    }
    await this.hider.set(true, items);
    await this.fragments.core.update(true);
  }

  /** Zoomt auf die Bauteile; ohne Angabe auf alle Modelle, abseits liegende Marker ausgenommen. */
  async fit(items?: OBC.ModelIdMap): Promise<void> {
    const box = coreBounds(await this.itemBounds(items));
    if (!box) return;
    const sphere = new THREE.Box3(
      new THREE.Vector3(...box.min),
      new THREE.Vector3(...box.max),
    ).getBoundingSphere(new THREE.Sphere());
    sphere.radius = Math.max(sphere.radius, 0.5);
    if (!items) {
      this.sceneRadius = sphere.radius;
      this.placeGrid(box.min[1], sphere.radius);
    }
    this.updateClipping(Math.max(sphere.radius, this.sceneRadius));
    await this.world.camera.controls.fitToSphere(sphere, true);
  }

  private async itemBounds(items?: OBC.ModelIdMap): Promise<Bounds[]> {
    const boxes: Bounds[] = [];
    for (const [modelId, model] of this.fragments.list) {
      const ids = items ? [...(items[modelId] ?? [])] : await model.getItemsIdsWithGeometry();
      if (!ids.length) continue;
      for (const b of await model.getBoxes(ids)) {
        boxes.push({ min: b.min.toArray(), max: b.max.toArray() });
      }
    }
    return boxes;
  }

  /**
   * Bodenraster unter dem tiefsten Punkt des Modells, damit Bauteile nicht im Raum schweben.
   * Maschenweite wächst in Zehnerschritten mit der Modellgröße (1/10 m bis 100/1000 m).
   */
  private placeGrid(bottom: number, radius: number): void {
    if (!this.grid) return;
    const step = 10 ** Math.min(Math.max(Math.floor(Math.log10(radius / 10)), 0), 2);
    this.grid.three.position.y = bottom;
    this.grid.config.visible = true;
    this.grid.config.primarySize = step;
    this.grid.config.secondarySize = step * 10;
    this.grid.config.distance = Math.max(radius * 4, 500);
  }

  /**
   * Die Kamera hat ab Werk eine Sichtweite von 1000 m; größere oder weit verteilte Modelle
   * würden abgeschnitten. Sichtweite und Nahgrenze folgen deshalb der Modellgröße.
   */
  private updateClipping(radius: number): void {
    const camera = this.world.camera.three;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.near = Math.min(Math.max(radius / 5000, 0.01), 1);
    camera.far = Math.max(radius * 40, 1000);
    camera.updateProjectionMatrix();
  }

  /** Räumliche Gliederung und Namen/GUIDs aller Objekte, für den Bauteilbaum. */
  async readStructure(
    modelId: string,
  ): Promise<{ root: RawSpatialItem; labels: Map<number, ItemLabel> }> {
    const model = this.model(modelId);
    const root = (await model.getSpatialStructure()) as RawSpatialItem;
    const ids = collectIds(root);
    const data = (await model.getItemsData(ids, {
      attributesDefault: false,
      attributes: ['Name'],
      relationsDefault: { attributes: false, relations: false },
    })) as RawItem[];
    const labels = new Map<number, ItemLabel>();
    data.forEach((item, i) => {
      const name = attr(item, 'Name');
      const guid = attr(item, '_guid');
      labels.set(ids[i], {
        name: typeof name === 'string' ? name : null,
        guid: typeof guid === 'string' ? guid : null,
      });
    });
    return { root, labels };
  }

  async readProperties(pick: Pick): Promise<ElementProps> {
    const model = this.model(pick.modelId);
    const [[item], defs] = await this.readItems(model, [pick.localId]);
    return buildElementProps(item, defs);
  }

  /**
   * Bauteile mit ihren Definitionen (Property-Sets, Mengen, Typen, Material).
   * Drei schmale Abfragen statt einer tiefen: tiefe Beziehungen laufen über den Typ
   * zu allen gleichartigen Bauteilen und werden bei großen Modellen riesig.
   */
  private async readItems(
    model: FRAGS.FragmentsModel,
    localIds: number[],
  ): Promise<[RawItem[], RawItem[]]> {
    const only = { attributes: true, relations: false };
    const none = { attributes: false, relations: false };
    const items = (await model.getItemsData(localIds, {
      attributesDefault: true,
      relationsDefault: none,
      relations: { IsDefinedBy: only, HasAssociations: only, ContainedInStructure: only },
    })) as RawItem[];
    const defIds = [...new Set(items.flatMap(definitionIds))];
    const defs = defIds.length
      ? ((await model.getItemsData(defIds, {
          attributesDefault: true,
          relationsDefault: none,
          relations: {
            HasProperties: only,
            Quantities: only,
            HasPropertySets: only,
            ForLayerSet: only,
            MaterialLayers: only,
            MaterialConstituents: only,
            Materials: only,
            Material: only,
          },
        })) as RawItem[])
      : [];
    const typeSetIds = [
      ...new Set(
        defs
          .flatMap((d) => rel(d, 'HasPropertySets'))
          .map((d) => Number(attr(d, '_localId')))
          .filter((n) => Number.isFinite(n)),
      ),
    ];
    const typeSets = typeSetIds.length
      ? ((await model.getItemsData(typeSetIds, {
          attributesDefault: true,
          relationsDefault: none,
          relations: { HasProperties: only, Quantities: only },
        })) as RawItem[])
      : [];
    return [items, [...defs, ...typeSets]];
  }

  /**
   * Merkmale, Maße entlang der Bauteilachsen und Volumen für Auswahlgruppen.
   * In Paketen, damit große Klassen den Worker nicht mit einer Riesenabfrage blockieren.
   */
  async elementFacts(modelId: string, localIds: number[]): Promise<ElementFacts[]> {
    const model = this.model(modelId);
    const facts: ElementFacts[] = [];
    for (let i = 0; i < localIds.length; i += FACTS_CHUNK) {
      const ids = localIds.slice(i, i + FACTS_CHUNK);
      const [[items, defs], geometries, volumes] = await Promise.all([
        this.readItems(model, ids),
        model.getItemsGeometry(ids),
        Promise.all(ids.map((id) => model.getItemsVolume([id]).catch(() => 0))),
      ]);
      ids.forEach((localId, k) => {
        const item = items[k];
        const extents = extentsOf(model, geometries[k] ?? []);
        facts.push({
          modelId,
          localId,
          guid: String(attr(item, '_guid') ?? `${modelId}#${localId}`),
          category: String(attr(item, '_category') ?? ''),
          name: String(attr(item, 'Name') ?? ''),
          values: elementValues(item, defs),
          extents: extents ?? { x: 0, y: 0, z: 0 },
          volume: extents && volumes[k] > 0 ? volumes[k] : null,
        });
      });
    }
    return facts;
  }

  /** Hebt Gruppen in je eigener Farbe hervor (z. B. Akzent und Amber). */
  async highlightGroups(groups: { items: OBC.ModelIdMap; color: string }[]): Promise<void> {
    await this.fragments.resetHighlight();
    for (const { items, color } of groups) {
      if (!Object.values(items).some((ids) => ids.size)) continue;
      await this.fragments.highlight(
        {
          color: new THREE.Color(color),
          renderedFaces: FRAGS.RenderedFaces.TWO,
          opacity: 1,
          transparent: false,
        },
        items,
      );
    }
    await this.fragments.core.update(true);
  }

  private model(modelId: string): FRAGS.FragmentsModel {
    const model = this.fragments.list.get(modelId);
    if (!model) throw new Error(`Modell ${modelId} ist nicht geladen`);
    return model;
  }

  dispose(): void {
    this.components.dispose();
  }
}

/**
 * Ausdehnung eines Bauteils entlang seiner eigenen Achsen (aus der Lage des ersten Teils),
 * z. B. Pfahllänge entlang z. `null` ohne Geometrie.
 */
function extentsOf(
  model: FRAGS.FragmentsModel,
  meshes: FRAGS.MeshData[],
): Record<'x' | 'y' | 'z', number> | null {
  let axes: THREE.Vector3[] | null = null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const v = new THREE.Vector3();
  for (const mesh of meshes) {
    if (!mesh.positions) continue;
    const matrix = model.object.matrixWorld.clone().multiply(mesh.transform);
    if (!axes) {
      const [x, y, z] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      matrix.extractBasis(x, y, z);
      axes = orthonormal(x.toArray() as Vec3, z.toArray() as Vec3).map(
        (a) => new THREE.Vector3(...a),
      );
    }
    for (let k = 0; k + 2 < mesh.positions.length; k += 3) {
      v.set(mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]).applyMatrix4(matrix);
      axes.forEach((a, i) => {
        const d = v.dot(a);
        min[i] = Math.min(min[i], d);
        max[i] = Math.max(max[i], d);
      });
    }
  }
  if (!axes) return null;
  return { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] };
}
