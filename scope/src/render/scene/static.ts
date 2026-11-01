import { CHART_COLORS } from '../../design/palette';
import type { ProjectFn } from '../../lib/geo';
import { geodesicLine } from '../../lib/geodesic';
import type { CoastData } from '../../lib/mapdata';
import type { AtlasInfo } from '../protocol';
import type { Slots } from '../slots';
import { type Anchor, LineBatch, TextBatch } from './pack';
import { ringRadii } from './rings';

export interface RingsInput {
  shown: boolean;
  rangeNm: number;
  /** How far out rings are drawn, so they reach the longer canvas edge. */
  ringExtentNm: number;
  /** A ring's outline on the scope plane, starting at its northern point. */
  ringPath: (radiusNm: number) => Anchor[];
  atlas: AtlasInfo;
}

export interface CoastInput {
  shown: boolean;
  coast: CoastData;
  project: ProjectFn;
}

export function buildRings(input: RingsInput): Slots {
  const lines = new LineBatch();
  const text = new TextBatch(input.atlas);
  if (input.shown) {
    for (const r of ringRadii(input.rangeNm, input.ringExtentNm)) {
      const path = input.ringPath(r);
      lines.polyline(path, r === input.rangeNm ? CHART_COLORS.ringEdge : CHART_COLORS.ring);
      const north = path[0];
      if (north) text.text(String(r), { ...north, px: 3, py: 1 }, 9, CHART_COLORS.ringLabel);
    }
  }
  return { ringLines: [lines.finish()], ringLabels: [text.finish()] };
}

export function buildCoast({ shown, coast, project }: CoastInput): Slots {
  const lines = new LineBatch(4096);
  if (shown) {
    for (const line of coast.lines) lines.polyline(geodesicLine(line, project), CHART_COLORS.coast);
  }
  return { coastLines: [lines.finish()] };
}
