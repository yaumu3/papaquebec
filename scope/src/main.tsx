import { render } from 'solid-js/web';

import { App } from './app';

import './design/tokens.css';
import './design/base.css';

const root = document.getElementById('root');
if (root) render(() => <App />, root);
