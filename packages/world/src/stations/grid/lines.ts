// The kit's screen-space lines (region/flows.ts) under loose types: the kit's files are untyped, and their option
// objects infer only the keys that carry defaults.
import type * as THREE from 'three';
import * as flows from '../../kit/region/flows';

type Pts = readonly (readonly number[])[];
type Opts = Record<string, unknown>;
const F = flows as unknown as {
  line(points: Pts, o: Opts): THREE.Mesh;
  lines(polys: readonly Pts[], o: Opts): THREE.Mesh;
  comets(points: Pts, o: Opts): THREE.Mesh;
  setLineResolution(root: THREE.Object3D, w: number, h: number, dpr: number): void;
  tickPulses(root: THREE.Object3D, seconds: number): void;
};

/** A line: a fine core (width, CSS px) under an optional glow; dash and gap in world units. */
export const line = (points: Pts, o: Opts) => F.line(points, o);
/** Several polylines of one look as one draw. */
export const lines = (polys: readonly Pts[], o: Opts) => F.lines(polys, o);
/** Pulses along a polyline, moving from its first point toward its last. */
export const comets = (points: Pts, o: Opts) => F.comets(points, o);
export const setLineResolution = (root: THREE.Object3D, w: number, h: number, dpr: number) => F.setLineResolution(root, w, h, dpr);
export const tickPulses = (root: THREE.Object3D, seconds: number) => F.tickPulses(root, seconds);
