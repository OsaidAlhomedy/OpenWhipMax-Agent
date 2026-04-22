'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openwhipmax', {
  // overlay.html: listen for flash trigger from main
  onFlash: (cb) => ipcRenderer.on('flash', () => cb()),
  // overlay.html: notify main that animation finished
  overlayDone: () => ipcRenderer.send('overlay-done'),

  // pairing.html: receive QR data from main
  onQrData: (cb) => ipcRenderer.on('qr-data', (_e, data) => cb(data)),
  // pairing.html: request token revocation
  revokeToken: () => ipcRenderer.send('revoke-token'),
  // pairing.html: receive notification that token was regenerated
  onTokenRevoked: (cb) => ipcRenderer.on('token-revoked', (_e, data) => cb(data)),
});
