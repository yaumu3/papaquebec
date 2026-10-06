import { createEffect, onCleanup, onMount } from 'solid-js';

import { ScopeCanvas } from './canvas/ScopeCanvas';
import { cx } from './design/cx';
import { connectFeed, feedOptionsFromUrl } from './feed/connect';
import { fetchQnhFrom, qnhSourceFromUrl } from './feed/qnh';
import { parseAero, parseCoast } from './lib/mapdata';
import { About } from './panels/About';
import { ContextMenu } from './panels/ContextMenu';
import { DetailPanel } from './panels/DetailPanel';
import { DisplayPanel } from './panels/DisplayPanel';
import { ListPanel } from './panels/ListPanel';
import { MapsPanel } from './panels/MapsPanel';
import { Overlays } from './panels/Overlays';
import { TabBar } from './panels/TabBar';
import { TopBar } from './panels/TopBar';
import { keepUnscrolled } from './state/layout';
import { setBuiltinAero } from './state/mapsets';
import { QNH_POLL_MS, qnhReport, setQnhError, setQnhReport, stationCandidates } from './state/qnh';
import { listSort, panels, setCoast, setTick } from './state/scope';
import { persist, setSettings, settings } from './state/settings';

import s from './app.module.css';

async function loadJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export function App() {
  const wx = qnhSourceFromUrl(location.search);
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
    void loadJson('./map/aero.json')
      .then((raw) => setBuiltinAero(parseAero(raw)))
      .catch((err: unknown) => console.warn('aero.json unavailable', err));
  });

  createEffect(() => persist({ panels: panels(), listSort: listSort() }));

  // METAR polling over the candidate stations; answers for a superseded list are dropped.
  createEffect(() => {
    const stations = stationCandidates();
    const key = stations.join(',');
    setQnhReport(null);
    setQnhError(null);
    if (!key) return;
    const current = () => stationCandidates().join(',') === key;
    const refresh = () =>
      fetchQnhFrom(stations, wx)
        .then((report) => {
          if (!current()) return;
          setQnhReport(report);
          setQnhError(null);
        })
        .catch((err: unknown) => {
          if (current()) setQnhError(err instanceof Error ? err.message : 'failed');
        });
    void refresh();
    const timer = setInterval(() => void refresh(), QNH_POLL_MS);
    onCleanup(() => clearInterval(timer));
  });

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
        <ListPanel />
        <DetailPanel />
      </div>
      <TabBar />
      <ContextMenu />
      <Overlays />
      <About />
    </>
  );
}
