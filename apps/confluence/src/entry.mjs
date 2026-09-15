import { view, router } from '@forge/bridge';
import * as core from 'flowview-core';
import { startConfluenceApp } from './app.mjs';
import './fonts.mjs';

startConfluenceApp(document,{view,router},core).catch(()=>{
  const status = document.getElementById('app-status');
  status.hidden = false; status.textContent = 'Flowview could not load. Reload the page to try again.';
});
