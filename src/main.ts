import { mount } from 'svelte';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import './styles/tokens.css';
import App from './App.svelte';
import { editor } from './ui/state.svelte';

const app = mount(App, { target: document.getElementById('app')! });
export default app;

// Handy for debugging and automated checks.
(window as unknown as { dlite: typeof editor }).dlite = editor;
