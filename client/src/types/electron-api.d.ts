interface ElectronAPI {
  downloadYoutube(url: string, options: {
    name: string;
  }): Promise<ArrayBuffer>;
  getDownloadProgress(callback: (progress: number) => void): () => void;
  cancelDownload(): Promise<unknown>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
