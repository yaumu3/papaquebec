import { geodesicPath } from '../../lib/geodesic';
import type { AeroLayers, CoastData, LatLon } from '../../lib/mapdata';
import type { LabelDensity, Layers } from '../../state/settings';
import type { ProjectFn } from '../../state/trackStore';
import type { MapLayer } from '../layers';
import { type AtlasInfo, type Batch, Shape } from '../protocol';
import { type Anchor, LineBatch, MarkerBatch, TextBatch, type TextStyle } from './pack';
import { projectedCircle, ringRadii } from './rings';
import { airspaceColor, THEME } from './rules';

export interface RingsInput {
  layers: Layers;
  rangeNm: number;
  /** How far out rings are drawn, so they reach the longer canvas edge. */
  ringExtentNm: number;
  /** A ring's outline on the scope plane, starting at its northern point. */
  ringPath: (radiusNm: number) => Anchor[];
  atlas: AtlasInfo;
}

/** Everything the map layers draw from. Zooming changes none of it but `navaidsInRange`. */
export interface MapInput {
  coast: CoastData;
  aero: AeroLayers;
  project: ProjectFn;
  layers: Layers;
  labelDensity: LabelDensity;
  navaidsInRange: boolean;
  atlas: AtlasInfo;
}

const NAVAID_MAX_RANGE = 120;

/** A route drawn along the geodesics between its points. */
const route = (points: LatLon[], project: ProjectFn): Anchor[] =>
  geodesicPath(
    points.map(([lat, lon]) => ({ lat, lon })),
    project,
  );

/** A route back to its first point, for an outline. */
function closedRoute(points: LatLon[], project: ProjectFn): Anchor[] {
  const first = points[0];
  return route(first ? [...points, first] : points, project);
}

function density(d: LabelDensity): number {
  return { off: 0, sparse: 1, normal: 2, dense: 3 }[d];
}

/** Navaids clutter a wide range; they show only out to `NAVAID_MAX_RANGE`. */
export function navaidsShownAt(rangeNm: number): boolean {
  return rangeNm <= NAVAID_MAX_RANGE;
}

export function buildRings(input: RingsInput): Batch[] {
  const lines = new LineBatch();
  const text = new TextBatch(input.atlas);
  if (input.layers.rings) {
    for (const r of ringRadii(input.rangeNm, input.ringExtentNm)) {
      const path = input.ringPath(r);
      lines.polyline(path, r === input.rangeNm ? THEME.ringEdge : THEME.ring);
      const north = path[0];
      if (north) text.text(String(r), { ...north, px: 3, py: 1 }, 9, THEME.ringLabel);
    }
  }
  return [lines.finish(), text.finish()];
}

function airwaysLayer({ aero, project, layers, atlas }: MapInput, labels: number): Batch[] {
  const lines = new LineBatch();
  const text = new TextBatch(atlas);
  if (layers.airways) {
    for (const aw of aero.airways) {
      const pts = route(aw.points, project);
      lines.polyline(pts, THEME.airway);
      const mid = pts[Math.floor(pts.length / 2)];
      if (labels >= 2 && mid) {
        text.text(aw.name, { ...mid, px: 4, py: -6 }, 9, THEME.airwayLabel, {
          baseline: 'bottom',
        });
      }
    }
  }
  return [lines.finish(), text.finish()];
}

function airspaceLayer({ aero, project, layers, atlas }: MapInput, labels: number): Batch[] {
  const lines = new LineBatch();
  const text = new TextBatch(atlas);
  if (layers.airspace) {
    for (const a of aero.airspace) {
      const style = a.dashed ? { dash: [4, 3] as [number, number] } : {};
      if ('center' in a) {
        const [lat, lon] = a.center;
        lines.polyline(projectedCircle({ lat, lon }, a.radiusNm, project), THEME.airspace, style);
        continue;
      }
      const pts = closedRoute(a.points, project);
      lines.polyline(pts, airspaceColor(a.kind), style);
      const first = pts[0];
      if (labels >= 3 && first) {
        const label = a.kind ? `${a.kind} ${a.name}` : a.name;
        text.text(label, { ...first, px: 4, py: 2 }, 9, THEME.airspaceLabel);
      }
    }
  }
  return [lines.finish(), text.finish()];
}

function sectorLayer({ aero, project, layers }: MapInput): Batch[] {
  const lines = new LineBatch();
  if (layers.sector) {
    for (const s of aero.sectors) {
      lines.polyline(closedRoute(s.points, project), THEME.sector, { dash: [6, 4] });
    }
  }
  return [lines.finish()];
}

function coastLayer({ coast, project, layers }: MapInput): Batch[] {
  const lines = new LineBatch(4096);
  if (layers.coast) {
    for (const line of coast.lines) {
      lines.polyline(
        geodesicPath(
          line.map(([lon, lat]) => ({ lat, lon })),
          project,
        ),
        THEME.coast,
      );
    }
  }
  return [lines.finish()];
}

/** How one kind of fix is drawn: its glyph, and its label from a label density up. */
interface FixStyle {
  shape: Shape;
  size: number;
  color: string;
  label: {
    from: number;
    px: number;
    py: number;
    size: number;
    color: string;
    baseline: NonNullable<TextStyle['baseline']>;
  };
}

const WAYPOINT: FixStyle = {
  shape: Shape.Triangle,
  size: 8,
  color: THEME.waypoint,
  label: { from: 2, px: 5, py: -3, size: 9, color: THEME.waypointLabel, baseline: 'bottom' },
};
const AIRPORT: FixStyle = {
  shape: Shape.Ring,
  size: 9,
  color: THEME.airport,
  label: { from: 1, px: 8, py: -1, size: 10, color: THEME.airportLabel, baseline: 'middle' },
};
const NAVAID: FixStyle = {
  shape: Shape.Hexagon,
  size: 10,
  color: THEME.navaid,
  label: { from: 1, px: 8, py: -1, size: 10, color: THEME.navaidLabel, baseline: 'middle' },
};

function fixesLayer(input: MapInput, labels: number): Batch[] {
  const { aero, project, layers } = input;
  const markers = new MarkerBatch();
  const text = new TextBatch(input.atlas);
  const draw = (fixes: readonly { id: string; lat: number; lon: number }[], style: FixStyle) => {
    const { label } = style;
    for (const f of fixes) {
      const p = project(f.lat, f.lon);
      markers.marker(p, style.shape, style.size, style.color);
      if (labels >= label.from) {
        text.text(f.id, { ...p, px: label.px, py: label.py }, label.size, label.color, {
          baseline: label.baseline,
        });
      }
    }
  };
  if (layers.waypoints) draw(aero.waypoints, WAYPOINT);
  if (layers.airports) draw(aero.airports, AIRPORT);
  if (layers.navaids && input.navaidsInRange) draw(aero.navaids, NAVAID);
  return [markers.finish(), text.finish()];
}

export function buildMap(input: MapInput): Record<MapLayer, Batch[]> {
  const labels = density(input.labelDensity);
  return {
    airways: airwaysLayer(input, labels),
    airspace: airspaceLayer(input, labels),
    sector: sectorLayer(input),
    coast: coastLayer(input),
    fixes: fixesLayer(input, labels),
  };
}
