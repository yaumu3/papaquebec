/**
 * A sheet of the chart's elements, one to a cell of the scope: each layer, each kind of navaid and
 * each turn of a hold, built from the example set's own features so that they stay valid.
 */
import { readFileSync } from 'node:fs';

import type { LatLon } from '../../src/lib/aircraft';
import { isRecord } from '../../src/lib/guards';
import { cellOf, latLonOf, type Place, PX_PER_NM, type Sheet } from './grid';

const CELLS: Sheet = { cols: 8, width: 190, height: 130 };
const LINE: readonly Place[] = [
  [-6, 2.5],
  [0, -2.5],
  [6, 2.5],
];
const HALF_AREA: Place = [(CELLS.width * 0.42) / PX_PER_NM, (CELLS.height * 0.4) / PX_PER_NM];
/** The kinds a navaid's symbol tells apart, and one it does not know. */
const NAVAID_KINDS = ['VOR', 'DME', 'VOR/DME', 'TACAN', 'VORTAC', 'NDB', 'LOC'];
/** A set repeats no id, so each kind is named after its place in the list. */
const LETTERS = 'ABCDEFG';

type Properties = Record<string, unknown> & { layer: string };

interface Feature {
  type: 'Feature';
  properties: Properties;
  geometry: { type: string; coordinates: unknown };
}

interface Specimen {
  name: string;
  feature: Feature;
}

const specimenOf = (feature: Feature): Specimen[] => {
  const { properties } = feature;
  if (properties.layer === 'navaid') {
    return NAVAID_KINDS.map((kind, i) => ({
      name: `navaid-${kind.toLowerCase().replace('/', '-')}`,
      feature: { ...feature, properties: { ...properties, kind, id: `Q${LETTERS[i]}A` } },
    }));
  }
  if (properties.layer === 'hold') {
    return [
      { name: 'hold-rnav-right', feature },
      {
        name: 'hold-left',
        feature: {
          ...feature,
          properties: { layer: 'hold', inboundMag: 25, turn: 'L' },
        },
      },
    ];
  }
  return [{ name: properties.layer, feature }];
};

const isFeatureSet = (raw: unknown): raw is { features: Feature[] } =>
  isRecord(raw) && Array.isArray(raw.features);

/** The first feature of each layer of the set, in the order the set lists them. */
function firstOfEachLayer(features: readonly Feature[]): Feature[] {
  const seen = new Set<string>();
  return features.filter(({ properties: { layer } }) => {
    if (seen.has(layer)) return false;
    seen.add(layer);
    return true;
  });
}

const lonLatAt =
  (site: LatLon, [east, north]: Place) =>
  ([x, y]: Place): [lon: number, lat: number] => {
    const { lat, lon } = latLonOf(site, [east + x, north + y]);
    return [lon, lat];
  };

/** `feature` redrawn in its own kind of geometry about `place`. */
function placed(feature: Feature, site: LatLon, place: Place): Feature {
  const at = lonLatAt(site, place);
  const { type } = feature.geometry;
  const [e, n] = HALF_AREA;
  const area: Place[] = [
    [-e, n],
    [e, n],
    [e, -n],
    [-e, -n],
    [-e, n],
  ];
  const coordinates =
    type === 'Point' ? at([0, 0]) : type === 'LineString' ? LINE.map(at) : [area.map(at)];
  return { ...feature, geometry: { type, coordinates } };
}

export const SPECIMEN_TITLE = 'Specimens (fictional)';

/** The map set of the sheet about `site`, and the crop of each element, by the name of its shot. */
export function specimenSheet(path: string, site: LatLon) {
  const set: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isFeatureSet(set)) throw new Error(`${path} holds no features`);
  const specimens = firstOfEachLayer(set.features).flatMap(specimenOf);
  const features = specimens.map(({ feature }, i) => placed(feature, site, cellOf(i, CELLS).place));
  const crops = specimens.map(({ name }, i) => ({
    name: `element/${name}`,
    clip: cellOf(i, CELLS).clip,
  }));
  return { set: { ...set, id: 'specimens', title: SPECIMEN_TITLE, features }, crops };
}
