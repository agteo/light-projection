import './style.css';
import { createProjectStore } from './state/store';
import { mountEditorShell } from './ui/shell';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('#app root missing');
}

const store = createProjectStore();
mountEditorShell(app, store);
