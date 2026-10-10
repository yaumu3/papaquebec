import { trackLabel } from '../render/scene/rules';
import {
  type MenuItem,
  type Rbl,
  rbls,
  setModeText,
  setPan,
  setRblPending,
  setRbls,
  setSelected,
} from '../state/scope';
import type { Track } from '../state/track';
import { copyText } from '../ui/clipboard';

export function targetMenu(t: Track): MenuItem[] {
  return [
    { label: trackLabel(t), header: true },
    { label: 'Select', onSelect: () => setSelected(t.hex) },
    {
      label: 'Copy hex',
      onSelect: () => copyText(t.hex),
    },
    {
      label: 'Start RBL from here',
      onSelect: () => {
        setRblPending({ a: { kind: 'target', hex: t.hex } });
        setModeText('RBL · SELECT ANCHOR B');
      },
    },
  ];
}

const deleteRbl = (r: Rbl): MenuItem => ({
  label: `Delete RBL ${r.tag}`,
  onSelect: () => setRbls(rbls().filter((x) => x !== r)),
});

/** Right-click on an RBL line: that line's own menu. */
export function rblMenu(r: Rbl): MenuItem[] {
  return [{ label: `RBL ${r.tag}`, header: true }, deleteRbl(r)];
}

export function scopeMenu(world: { x: number; y: number }): MenuItem[] {
  const perRbl =
    rbls().length > 0 ? [{ label: '', separator: true }, ...rbls().map(deleteRbl)] : [];
  return [
    { label: 'SCOPE', header: true },
    {
      label: 'Start RBL here',
      onSelect: () => {
        setRblPending({ a: { kind: 'free', x: world.x, y: world.y } });
        setModeText('RBL · SELECT ANCHOR B');
      },
    },
    { label: '', separator: true },
    { label: 'Reset pan', shortcut: 'HOME', onSelect: () => setPan({ x: 0, y: 0 }) },
    ...perRbl,
    { label: 'Clear all RBLs', disabled: rbls().length === 0, onSelect: () => setRbls([]) },
  ];
}
