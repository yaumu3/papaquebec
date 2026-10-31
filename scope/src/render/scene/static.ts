import type { ProjectFn } from '../../lib/geo';
import type { CoastData, DrawnLayers, LatLon, LonLat } from '../../lib/mapdata';
import type { LabelDensity, Layers } from '../../state/settings';
import { type AtlasInfo, type Batch, Shape } from '../protocol';
import type { MapSlot } from '../slots';
import { type Anchor, LineBatch, MarkerBatch, TextBatch, type TextStyle } from './pack';
import { closedRoute, route } from './paths';
import { ringRadii } from './rings';
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
  drawn: DrawnLayers;
  project: ProjectFn;
  layers: Layers;
  labelDensity: LabelDensity;
  navaidsInRange: boolean;
  atlas: AtlasInfo;
}

const NAVAID_MAX_RANGE = 120;

const flipped = (points: readonly LatLon[]): LonLat[] => points.map(([lat, lon]) => [lon, lat]);

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

function airwaysLayer({ drawn, project, layers, atlas }: MapInput, labels: number): Batch[] {
  const lines = new LineBatch();
  const text = new TextBatch(atlas);
  if (layers.airways) {
    for (const aw of drawn.airways) {
      const pts = route(flipped(aw.points), project);
      lines.polyline(pts, THEME.rnav);
      const mid = pts[Math.floor(pts.length / 2)];
      if (labels >= 2 && mid) {
        text.text(aw.name, { ...mid, px: 4, py: -6 }, 9, THEME.rnavLabel, {
          baseline: 'bottom',
        });
      }
    }
  }
  return [lines.finish(), text.finish()];
}

function airspaceLayer({ drawn, project, layers, atlas }: MapInput, labels: number): Batch[] {
  const lines = new LineBatch();
  const text = new TextBatch(atlas);
  if (layers.airspace) {
    for (const a of drawn.airspace) {
      const style = a.dashed ? { dash: [4, 3] as [number, number] } : {};
      const pts = closedRoute(flipped(a.points), project);
      lines.polyline(pts, airspaceColor(a.kind), style);
      const first = pts[0];
      if (labels >= 3 && first) {
        const label = `${a.kind} ${a.name}`;
        text.text(label, { ...first, px: 4, py: 2 }, 9, THEME.airspaceLabel);
      }
    }
  }
  return [lines.finish(), text.finish()];
}

function sectorLayer({ drawn, project, layers }: MapInput): Batch[] {
  const lines = new LineBatch();
  if (layers.sector) {
    for (const s of drawn.sectors) {
      lines.polyline(closedRoute(flipped(s.points), project), THEME.sector, { dash: [6, 4] });
    }
  }
  return [lines.finish()];
}

function coastLayer({ coast, project, layers }: MapInput): Batch[] {
  const lines = new LineBatch(4096);
  if (layers.coast) {
    for (const line of coast.lines) {
      lines.polyline(route(line, project), THEME.coast);
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
  color: THEME.fix,
  label: { from: 2, px: 5, py: -3, size: 9, color: THEME.fixLabel, baseline: 'bottom' },
};
const AIRPORT: FixStyle = {
  shape: Shape.Ring,
  size: 9,
  color: THEME.ad,
  label: { from: 1, px: 8, py: -1, size: 10, color: THEME.adLabel, baseline: 'middle' },
};
const NAVAID: FixStyle = {
  shape: Shape.Hexagon,
  size: 10,
  color: THEME.navaid,
  label: { from: 1, px: 8, py: -1, size: 10, color: THEME.navaidLabel, baseline: 'middle' },
};

function fixesLayer(input: MapInput, labels: number): Batch[] {
  const { drawn, project, layers } = input;
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
  if (layers.waypoints) draw(drawn.waypoints, WAYPOINT);
  if (layers.airports) draw(drawn.airports, AIRPORT);
  if (layers.navaids && input.navaidsInRange) draw(drawn.navaids, NAVAID);
  return [markers.finish(), text.finish()];
}

export function buildMap(input: MapInput): Record<MapSlot, Batch[]> {
  const labels = density(input.labelDensity);
  return {
    airways: airwaysLayer(input, labels),
    airspace: airspaceLayer(input, labels),
    sector: sectorLayer(input),
    coast: coastLayer(input),
    fixes: fixesLayer(input, labels),
  };
}
