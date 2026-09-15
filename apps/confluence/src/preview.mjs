/* Local verification only. build.mjs uses a different entry and output path;
   the Forge manifest never points to this simulated host. */
import * as core from 'flowview-core';
import { startConfluenceApp } from './app.mjs';
import './fonts.mjs';

const configuring = new URLSearchParams(location.search).has('configure');
const key = 'flowview-confluence-local-preview';
const notice = document.getElementById('preview-notice');
notice.hidden = false; notice.textContent = 'Local preview — Confluence is simulated. Nothing is published to a Confluence site.';
let config = {};
try { config = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
const bridge = {
  view:{
    getContext:async()=>({siteUrl:location.origin,extension:{config,macro:{isConfiguring:configuring}}}),
    submit:async payload=>{localStorage.setItem(key,JSON.stringify(payload.config));location.href='./index.html';},
    close:async()=>{location.href='./index.html';}
  },
  router:{open:async url=>{window.open(url,'_blank','noopener');}}
};
const link=document.createElement('a'); link.href='?configure=1';link.textContent=' Import or replace snapshot';notice.appendChild(link);
startConfluenceApp(document,bridge,core);
