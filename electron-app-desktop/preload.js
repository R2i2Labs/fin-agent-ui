// preload.js
const { contextBridge } = require('electron');

// Add any API you want to expose to your Next.js app here
contextBridge.exposeInMainWorld('electronAPI', {
  // You can add methods here that your Next.js app can access
  platform: process.platform
});

// This will help with fixing path issues for assets in the renderer
window.addEventListener('DOMContentLoaded', () => {
  // Fix base path for assets
  const baseElement = document.createElement('base');
  const outDir = new URL('../out/', 'file://' + __dirname).href;
  baseElement.href = outDir;
  document.head.prepend(baseElement);
});