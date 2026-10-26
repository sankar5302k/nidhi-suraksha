import { StorageProvider } from './StorageProvider.js';
import { GridFsStorageProvider } from './GridFsStorageProvider.js';
import { MemoryStorageProvider } from './MemoryStorageProvider.js';
import { getEnv } from '../../config/env.js';

let activeStorageProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (activeStorageProvider) {
    return activeStorageProvider;
  }

  const env = getEnv();
  if (env.NODE_ENV === 'test') {
    activeStorageProvider = new MemoryStorageProvider();
  } else if (env.STORAGE_PROVIDER === 'gridfs') {
    activeStorageProvider = new GridFsStorageProvider();
  } else {
    // Default fallback to GridFS
    activeStorageProvider = new GridFsStorageProvider();
  }

  return activeStorageProvider;
}

export function setStorageProvider(provider: StorageProvider | null): void {
  activeStorageProvider = provider;
}
