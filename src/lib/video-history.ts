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

export async function listStoredVideos(): Promise<StoredVideoHistoryItem[]> {
  const database = await openHistoryDatabase();
  const items = await runStoreRequest(database, 'readonly', (store) => store.getAll());

  return items
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 8);
}

export async function saveStoredVideo(item: StoredVideoHistoryItem): Promise<void> {
  const database = await openHistoryDatabase();
  await runStoreRequest(database, 'readwrite', (store) => store.put(item));
}

export async function clearStoredVideos(): Promise<void> {
  const database = await openHistoryDatabase();
  await runStoreRequest(database, 'readwrite', (store) => store.clear());
}
