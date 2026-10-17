interface ElectronSecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  clear(key: string): Promise<boolean>;
}

interface ElectronAPI {
  downloadYoutube(url: string, options: {
    name: string;
  }): Promise<ArrayBuffer>;
  getDownloadProgress(callback: (progress: number) => void): () => void;
  cancelDownload(): Promise<unknown>;
  /** Subscribe to the main process's pre-close signal; returns an unsubscribe. */
  onBeforeClose?(callback: () => void): () => void;
  /** Tell the main process it may close the window now. */
  confirmClose?(): Promise<unknown>;
  secureStore?: ElectronSecureStore;
}

interface Window {
  electronAPI?: ElectronAPI;
}
