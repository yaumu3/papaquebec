import type { AeroData, CoastData, LatLon } from '../../lib/mapdata';
import type { LabelDensity, Layers } from '../../state/settings';
import type { ProjectFn } from '../../state/trackStore';
import { type AtlasInfo, type Batch, Shape } from '../protocol';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { ringRadii } from './rings';
import { airspaceColor, THEME } from './rules';

export interface StaticInput {
  coast: CoastData;
  aero: AeroData;
  project: ProjectFn;
  layers: Layers;
  labelDensity: LabelDensity;
  rangeNm: number;
  atlas: AtlasInfo;
}

export interface NamedLayer {
  name: string;
  batches: Batch[];
}

/** Draw order of the static layers, back to front. */
export const STATIC_ORDER = ['rings', 'airways', 'airspace', 'sector', 'coast', 'fixes'];

const CIRCLE_SEGMENTS = 96;
const NAVAID_MAX_RANGE = 120;

function circle(cx: number, cy: number, r: number): Anchor[] {
  const pts: Anchor[] = [];
  for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
    const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    pts.push({ x: cx + r * Math.sin(a), y: cy + r * Math.cos(a) });
  }
  return pts;
}

const route = (points: LatLon[], project: ProjectFn): Anchor[] =>
  points.map(([lat, lon]) => project(lat, lon));

function density(d: LabelDensity): number {
  return { off: 0, sparse: 1, normal: 2, dense: 3 }[d];
}

function buildRings(input: Pick<StaticInput, 'layers' | 'rangeNm' | 'atlas'>): NamedLayer {
  const lines = new LineBatch();
  const text = new TextBatch(input.atlas);
  if (input.layers.rings) {
    for (const r of ringRadii(input.rangeNm)) {
      lines.polyline(circle(0, 0, r), r === input.rangeNm ? THEME.ringEdge : THEME.ring);
      text.text(String(r), { x: 0, y: r, px: 3, py: 1 }, 9, THEME.ringLabel);
    }
  }
  return { name: 'rings', batches: [lines.finish(), text.finish()] };
}

export function buildStatic(input: StaticInput): NamedLayer[] {
  const { aero, project, layers, atlas } = input;
  const labels = density(input.labelDensity);
  const out: NamedLayer[] = [buildRings(input)];

  const airways = new LineBatch();
  const airwayText = new TextBatch(atlas);
  if (layers.airways) {
    for (const aw of aero.airways) {
      const pts = route(aw.points, project);
      airways.polyline(pts, THEME.airway);
      const mid = pts[Math.floor(pts.length / 2)];
      if (labels >= 2 && mid) {
        airwayText.text(aw.name, { ...mid, px: 4, py: -6 }, 9, THEME.airwayLabel, {
          baseline: 'bottom',
        });
      }
    }
  }
  out.push({ name: 'airways', batches: [airways.finish(), airwayText.finish()] });

  const airspace = new LineBatch();
  const airspaceText = new TextBatch(atlas);
  if (layers.airspace) {
    for (const a of aero.airspace) {
      const style = a.dashed ? { dash: [4, 3] as [number, number] } : {};
      if ('center' in a) {
        const c = project(a.center[0], a.center[1]);
        airspace.polyline(circle(c.x, c.y, a.radiusNm), THEME.airspace, style);
        continue;
      }
      const pts = route(a.points, project);
      const first = pts[0];
      if (first) pts.push(first);
      airspace.polyline(pts, airspaceColor(a.kind), style);
      if (labels >= 3 && first) {
        const label = a.kind ? `${a.kind} ${a.name}` : a.name;
        airspaceText.text(label, { ...first, px: 4, py: 2 }, 9, THEME.airspaceLabel);
      }
    }
  }
  out.push({ name: 'airspace', batches: [airspace.finish(), airspaceText.finish()] });

  const sector = new LineBatch();
  if (layers.sector) {
    for (const s of aero.sectors) {
      const pts = route(s.points, project);
      const first = pts[0];
      if (first) pts.push(first);
      sector.polyline(pts, THEME.sector, { dash: [6, 4] });
    }
  }
  out.push({ name: 'sector', batches: [sector.finish()] });

  const coast = new LineBatch(4096);
  if (layers.coast) {
    for (const line of input.coast.lines) {
      coast.polyline(
        line.map(([lon, lat]) => project(lat, lon)),
        THEME.coast,
      );
    }
  }
  out.push({ name: 'coast', batches: [coast.finish()] });

  const fixes = new MarkerBatch();
  const fixText = new TextBatch(atlas);
  if (layers.waypoints) {
    for (const w of aero.waypoints) {
      const p = project(w.lat, w.lon);
      fixes.marker(p, Shape.Triangle, 8, THEME.waypoint);
      if (labels >= 2)
        fixText.text(w.id, { ...p, px: 5, py: -3 }, 9, THEME.waypointLabel, { baseline: 'bottom' });
    }
  }
  if (layers.airports) {
    for (const a of aero.airports) {
      const p = project(a.lat, a.lon);
      fixes.marker(p, Shape.Ring, 9, THEME.airport);
      if (labels >= 1) {
        fixText.text(a.id, { ...p, px: 8, py: -1 }, 10, THEME.airportLabel, { baseline: 'middle' });
      }
    }
  }
  if (layers.navaids && input.rangeNm <= NAVAID_MAX_RANGE) {
    for (const n of aero.navaids) {
      const p = project(n.lat, n.lon);
      fixes.marker(p, Shape.Hexagon, 10, THEME.navaid);
      if (labels >= 1)
        fixText.text(n.id, { ...p, px: 8, py: -1 }, 10, THEME.navaidLabel, { baseline: 'middle' });
    }
  }
  out.push({ name: 'fixes', batches: [fixes.finish(), fixText.finish()] });

  return out;
}
