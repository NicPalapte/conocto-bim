import * as OBC from '@thatopen/components';
import * as FRAGS from '@thatopen/fragments';
import * as THREE from 'three';
import {
  attr,
  buildElementProps,
  definitionIds,
  rel,
  type ElementProps,
  type RawItem,
} from '../model/properties';
import { coreBounds, type Bounds } from '../model/bounds';
import { collectIds, type ItemLabel, type RawSpatialItem } from '../model/tree';

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
    // Transparenter Hintergrund: das Punktraster der Seite bleibt sichtbar.
    world.scene.three.background = null;
    world.renderer = new OBC.SimpleRenderer(this.components, container, { alpha: true });
    world.camera = new OBC.SimpleCamera(this.components);
    world.camera.controls.setLookAt(60, 40, 60, 0, 0, 0);
    this.components.init();
    this.world = world;

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
    if (!items) this.sceneRadius = sphere.radius;
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
    const only = { attributes: true, relations: false };
    const none = { attributes: false, relations: false };
    // Drei schmale Abfragen statt einer tiefen: tiefe Beziehungen laufen über den Typ
    // zu allen gleichartigen Bauteilen und werden bei großen Modellen riesig.
    const [item] = (await model.getItemsData([pick.localId], {
      attributesDefault: true,
      relationsDefault: none,
      relations: { IsDefinedBy: only, HasAssociations: only, ContainedInStructure: only },
    })) as RawItem[];
    const defs = (await model.getItemsData(definitionIds(item), {
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
    })) as RawItem[];
    const typeSetIds = defs
      .flatMap((d) => rel(d, 'HasPropertySets'))
      .map((d) => Number(attr(d, '_localId')))
      .filter((n) => Number.isFinite(n));
    const typeSets = typeSetIds.length
      ? ((await model.getItemsData(typeSetIds, {
          attributesDefault: true,
          relationsDefault: none,
          relations: { HasProperties: only, Quantities: only },
        })) as RawItem[])
      : [];
    return buildElementProps(item, [...defs, ...typeSets]);
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
