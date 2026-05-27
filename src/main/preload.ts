import { contextBridge, ipcRenderer } from 'electron';
import type { StreamChunk } from '../types';

contextBridge.exposeInMainWorld('isgrace', {

  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config: unknown) => ipcRenderer.invoke('config:save', config),
  },

  file: {
    selectMaterials: () => ipcRenderer.invoke('file:select-materials'),
    uploadMaterial: (src: string, name: string) => ipcRenderer.invoke('file:upload-material', src, name),
    uploadUrl: (url: string) => ipcRenderer.invoke('file:upload-url', url),
    deleteMaterial: (id: string) => ipcRenderer.invoke('file:delete-material', id),
  },

  llm: {
    buildSmartContext: (opts: unknown) => ipcRenderer.invoke('llm:build-smart-context', opts),

    /** Start a streaming chat. Returns { streamId } immediately; chunks arrive via onChunk. */
    chat: (payload: unknown) => ipcRenderer.invoke('llm:chat', payload),

    /** Subscribe to streaming chunks. Returns an unsubscribe function. */
    onChunk: (cb: (chunk: StreamChunk) => void) => {
      const handler = (_: Electron.IpcRendererEvent, chunk: StreamChunk) => cb(chunk);
      ipcRenderer.on('llm:chunk', handler);
      return () => ipcRenderer.removeListener('llm:chunk', handler);
    },

    /** Grade a single essay or code answer. Returns score + explanation. */
    grade: (payload: unknown) => ipcRenderer.invoke('llm:grade', payload),
  },

  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (s: unknown) => ipcRenderer.invoke('settings:save', s),
    testConnection: (s: unknown) => ipcRenderer.invoke('settings:test-connection', s),
  },

  progress: {
    update: (data: unknown) => ipcRenderer.invoke('progress:update', data),
  },

  cheatsheet: {
    save: (content: string) => ipcRenderer.invoke('cheatsheet:save', content),
  },

  app: {
    /** Returns the OS locale string, e.g. 'zh-CN', 'en-US' */
    locale: () => ipcRenderer.invoke('app:locale'),
  },
});
