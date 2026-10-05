import { For } from 'solid-js';

import { cx } from '../design/cx';
import { isPhone } from '../state/layout';
import { aboutVisible } from '../state/scope';
import { type Credit, CREDITS, SOFTWARE } from './credits';

import s from './About.module.css';

/** The `i` of the top bar toggles the dialog; a phone, which has no `i`, never shows it. */
const shown = () => !isPhone() && aboutVisible();

/** One line of the dialog: what, from where, and on which terms. */
function Row(props: { credit: Credit }) {
  return (
    <>
      <span class={s.subject}>{props.credit.subject}</span>
      <a class={s.source} href={props.credit.url} target="_blank" rel="noreferrer">
        {props.credit.source}
      </a>
      <span class={s.terms}>{props.credit.terms}</span>
    </>
  );
}

/** What the scope is and whose data it shows, opened from the `i` beside the panel buttons. */
export function About() {
  return (
    <div class={cx(s.about, shown() && s.show)} role="dialog" aria-label="About">
      <div class={s.body}>
        <Row credit={SOFTWARE} />
        <div class={s.divider} />
        <For each={CREDITS}>{(credit) => <Row credit={credit} />}</For>
      </div>
    </div>
  );
}
