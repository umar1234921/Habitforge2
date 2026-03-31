const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('habitforgeEnv', {
  isElectron: true,
});
