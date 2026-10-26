const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('bySyncDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
}))
