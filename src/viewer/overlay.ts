import * as THREE from 'three';
import type { Vec3 } from '../model/bounds';
import { tokenColor } from './tokens';

/**
 * Messgrafik über dem Modell: Punkte, Linien und eingefärbte Flächen. Punkte und Linien
 * liegen immer vorne (ohne Tiefentest), damit sie auch hinter Bauteilen lesbar bleiben.
 */
export class MeasureOverlay {
  readonly group = new THREE.Group();
  private readonly items = new Map<string, THREE.Object3D[]>();
  private color = new THREE.Color(tokenColor('--accent'));

  constructor() {
    this.group.renderOrder = 10;
  }

  setColor(color: string): void {
    this.color = new THREE.Color(color);
  }

  addPoints(id: string, points: Vec3[]): void {
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points.flat(), 3),
    );
    const material = new THREE.PointsMaterial({
      color: this.color,
      size: 9,
      sizeAttenuation: false,
      depthTest: false,
    });
    this.add(id, new THREE.Points(geometry, material));
  }

  /** `dashed`: gestrichelt (Strichlänge folgt der Linienlänge), für die Vorschau. */
  addLine(id: string, a: Vec3, b: Vec3, dashed = false): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...a),
      new THREE.Vector3(...b),
    ]);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const material = dashed
      ? new THREE.LineDashedMaterial({
          color: this.color,
          depthTest: false,
          dashSize: length / 40,
          gapSize: length / 60,
        })
      : new THREE.LineBasicMaterial({ color: this.color, depthTest: false });
    const line = new THREE.Line(geometry, material);
    if (dashed) line.computeLineDistances();
    this.add(id, line);
  }

  /** Einzelne Strecken, z. B. der Rand einer Schnittfläche. */
  addSegments(id: string, segments: [Vec3, Vec3][], color?: string): void {
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(segments.flat(2), 3),
    );
    const material = new THREE.LineBasicMaterial({
      color: color ? new THREE.Color(color) : this.color,
      depthTest: false,
    });
    this.add(id, new THREE.LineSegments(geometry, material));
  }

  /** `triangles`: je Dreieck 9 Zahlen in Weltkoordinaten; `color` statt der Messfarbe. */
  addFace(id: string, triangles: ArrayLike<number>, color?: string): void {
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(Array.from(triangles), 3),
    );
    const material = new THREE.MeshBasicMaterial({
      color: color ? new THREE.Color(color) : this.color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.add(id, new THREE.Mesh(geometry, material));
  }

  remove(id: string): void {
    for (const object of this.items.get(id) ?? []) {
      this.group.remove(object);
      dispose(object);
    }
    this.items.delete(id);
  }

  /** Alle Zeichnungen, deren Name mit `prefix` beginnt. */
  removePrefix(prefix: string): void {
    for (const id of [...this.items.keys()]) if (id.startsWith(prefix)) this.remove(id);
  }

  clear(): void {
    for (const id of [...this.items.keys()]) this.remove(id);
  }

  private add(id: string, object: THREE.Object3D): void {
    object.renderOrder = 10;
    this.group.add(object);
    this.items.set(id, [...(this.items.get(id) ?? []), object]);
  }
}

function dispose(object: THREE.Object3D): void {
  if (
    object instanceof THREE.Mesh ||
    object instanceof THREE.Line ||
    object instanceof THREE.Points
  ) {
    object.geometry.dispose();
    (object.material as THREE.Material).dispose();
  }
}
