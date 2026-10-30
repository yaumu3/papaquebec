import { createEffect, onCleanup, onMount } from 'solid-js';

import { ScopeCanvas } from './canvas/ScopeCanvas';
import { cx } from './design/cx';
import { connectFeed, feedOptionsFromUrl } from './feed/connect';
import { chartOf } from './lib/chart';
import { drawnOf } from './lib/drawn';
import { type AeroData, parseCoast } from './lib/mapdata';
import { type MapSetData, parseMapSet } from './lib/mapset';
import { loadDeclination } from './lib/wmm';
import { About } from './panels/About';
import { ContextMenu } from './panels/ContextMenu';
import { DetailPanel } from './panels/DetailPanel';
import { DisplayPanel } from './panels/DisplayPanel';
import { ListPanel } from './panels/ListPanel';
import { MapsPanel } from './panels/MapsPanel';
import { Overlays } from './panels/Overlays';
import { TabBar } from './panels/TabBar';
import { TopBar } from './panels/TopBar';
import { plotted } from './state/lanes';
import { keepUnscrolled } from './state/layout';
import { setDeclinationAt } from './state/magnetic';
import { setBuiltinAero } from './state/mapsets';
import { ndRangeNm } from './state/nd';
import { qnhReport } from './state/qnh';
import { listSort, panels, setCoast, setTick } from './state/scope';
import { persist, setSettings, settings } from './state/settings';

import s from './app.module.css';

/** Until the store holds map sets: the set as the old data shape. */
function drawnFrom(set: MapSetData): AeroData {
  return { title: set.title, ...(set.note ? { note: set.note } : {}), ...drawnOf(chartOf([set])) };
}

async function loadJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export function App() {
  onMount(() => {
    const clock = setInterval(() => setTick(Date.now()), 1000);
    const disconnect = connectFeed(feedOptionsFromUrl(location.search));
    const unscroll = keepUnscrolled(window);
    onCleanup(() => {
      clearInterval(clock);
      disconnect();
      unscroll();
    });
    void loadJson('./map/coast.json')
      .then((raw) => setCoast(parseCoast(raw)))
      .catch((err: unknown) => console.warn('coast.json unavailable', err));
    void loadJson('./map/openaip.mapset.geojson')
      .then((raw) => setBuiltinAero(drawnFrom(parseMapSet(raw))))
      .catch((err: unknown) => console.warn('openaip.mapset.geojson unavailable', err));
    void loadDeclination()
      .then((declination) => setDeclinationAt(() => declination))
      .catch((err: unknown) => console.warn('magnetic model unavailable', err));
  });

  createEffect(() =>
    persist({
      panels: panels(),
      listSort: listSort(),
      plotted: plotted(),
      ndRangeNm: ndRangeNm(),
    }),
  );

  // The latest report becomes the altimeter setting whenever automatic mode is on.
  createEffect(() => {
    const report = qnhReport();
    if (settings.qnh.auto && report) setSettings('altimeter', 'qnhInHg', report.qnhInHg);
  });

  return (
    <>
      <ScopeCanvas />
      <TopBar />
      <div class={cx(s.column, s.left)}>
        <DisplayPanel />
        <MapsPanel />
      </div>
      <div class={cx(s.column, s.right)}>
        <DetailPanel />
        <ListPanel />
      </div>
      <TabBar />
      <ContextMenu />
      <Overlays />
      <About />
    </>
  );
}
