import { For } from 'solid-js';

import { cx } from '../design/cx';
import { activeSheet, isPhone, isShown } from '../state/layout';
import { aboutVisible } from '../state/scope';
import { type Credit, CREDITS, SOFTWARE } from './credits';

import s from './About.module.css';

/** On a phone the dialog takes the sheet's turn; elsewhere the `i` of the top bar toggles it. */
const shown = () => isShown(isPhone(), activeSheet(), 'about', aboutVisible());

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
      <div class={s.titlebar}>About</div>
      <div class={s.body}>
        <Row credit={SOFTWARE} />
        <div class={s.divider} />
        <For each={CREDITS}>{(credit) => <Row credit={credit} />}</For>
      </div>
    </div>
  );
}
