export interface StoredVideoHistoryItem {
  id: string;
  filename: string;
  title: string;
  createdAt: string;
  blob: Blob;
  size: number;
}

const DATABASE_NAME = 'downloader-pro-video-history';
const STORE_NAME = 'videos';
const DATABASE_VERSION = 1;
export const MAX_STORED_VIDEOS = 8;
export const HISTORY_RETENTION_DAYS = 30;

function openHistoryDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('El almacenamiento local no está disponible en este navegador.'));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el historial local.'));
  });
}

function runStoreRequest<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const transaction = database.transaction(STORE_NAME, mode);
  const request = operation(transaction.objectStore(STORE_NAME));

  return new Promise((resolve, reject) => {
    let result!: T;

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error('No se pudo actualizar el historial local.'));
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('No se pudo actualizar el historial local.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('No se pudo actualizar el historial local.'));
    };
  });
}

async function getAllStoredVideos(): Promise<StoredVideoHistoryItem[]> {
  const database = await openHistoryDatabase();
  return runStoreRequest(database, 'readonly', (store) => store.getAll());
}

async function deleteStoredVideoIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const database = await openHistoryDatabase();
  await runStoreRequest(database, 'readwrite', (store) => {
    let lastRequest: IDBRequest<undefined> = store.delete(ids[0]);
    ids.slice(1).forEach((id) => {
      lastRequest = store.delete(id);
    });
    return lastRequest;
  });
}

async function pruneStoredVideos(): Promise<StoredVideoHistoryItem[]> {
  const items = await getAllStoredVideos();
  const cutoff = Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const sortedItems = items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const retainedItems = sortedItems
    .filter((item) => {
      const createdAt = new Date(item.createdAt).getTime();
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    })
    .slice(0, MAX_STORED_VIDEOS);
  const retainedIds = new Set(retainedItems.map((item) => item.id));
  const idsToDelete = sortedItems
    .filter((item) => !retainedIds.has(item.id))
    .map((item) => item.id);

  await deleteStoredVideoIds(idsToDelete);
  return retainedItems;
}

export async function listStoredVideos(): Promise<StoredVideoHistoryItem[]> {
  return pruneStoredVideos();
}

export async function deleteStoredVideo(id: string): Promise<void> {
  const database = await openHistoryDatabase();
  await runStoreRequest(database, 'readwrite', (store) => store.delete(id));
}

export async function saveStoredVideo(item: StoredVideoHistoryItem): Promise<void> {
  const database = await openHistoryDatabase();
  await runStoreRequest(database, 'readwrite', (store) => store.put(item));
  await pruneStoredVideos();
}

export async function clearStoredVideos(): Promise<void> {
  const database = await openHistoryDatabase();
  await runStoreRequest(database, 'readwrite', (store) => store.clear());
}
