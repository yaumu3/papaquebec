import type { ScopeActions } from './actions';

/**
 * Scope actions that only record each call by name, to test which action a device asks for.
 * `release` reports a drag when `dragged` is set.
 */
export function recordActions({ dragged = false } = {}) {
  const calls: [keyof ScopeActions, ...unknown[]][] = [];
  const rec =
    (name: keyof ScopeActions) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const actions: ScopeActions = {
    grab: rec('grab'),
    dragTo: rec('dragTo'),
    release: (at) => {
      calls.push(['release', at]);
      return dragged;
    },
    dropGrab: rec('dropGrab'),
    tap: rec('tap'),
    menu: rec('menu'),
    dismissMenu: rec('dismissMenu'),
    rangeOrigin: (at) => {
      calls.push(['rangeOrigin', at]);
      return { kind: 'free', ...at };
    },
    showRange: rec('showRange'),
    hover: rec('hover'),
    zoomStart: rec('zoomStart'),
    zoomTo: rec('zoomTo'),
    zoomEnd: rec('zoomEnd'),
    zoomBy: rec('zoomBy'),
    stepRange: rec('stepRange'),
    cycleTrails: rec('cycleTrails'),
    cycleVectors: rec('cycleVectors'),
    toggleList: rec('toggleList'),
    toggleHint: rec('toggleHint'),
    recenter: rec('recenter'),
    startRbl: rec('startRbl'),
    deleteLastRbl: rec('deleteLastRbl'),
    clearRbls: rec('clearRbls'),
    cancel: rec('cancel'),
  };
  return { calls, actions };
}
