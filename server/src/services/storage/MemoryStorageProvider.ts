import { StorageProvider } from './StorageProvider.js';

export class MemoryStorageProvider implements StorageProvider {
  private storage = new Map<string, { data: Buffer; mimeType: string }>();

  async upload(key: string, data: Buffer, mimeType: string): Promise<void> {
    this.storage.set(key, { data, mimeType });
  }

  async download(key: string): Promise<Buffer> {
    const item = this.storage.get(key);
    if (!item) {
      throw new Error(`Storage item not found: ${key}`);
    }
    return item.data;
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  clear(): void {
    this.storage.clear();
  }
}
