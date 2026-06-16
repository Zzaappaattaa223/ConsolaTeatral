export class AudioDB {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'AudioStorage_v2';
  private readonly storeName = 'audioBlobs';

  private init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) return resolve();
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject("Error al abrir IndexedDB");
      request.onsuccess = () => { this.db = request.result; resolve(); };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) await this.init();
    return this.db!;
  }

  async set(key: string, value: Blob): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    tx.objectStore(this.storeName).put(value, key);
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
            console.error(`IndexedDB set error for key ${key}:`, tx.error);
            reject(tx.error);
        };
    });
  }
  
  async setMultiple(items: { key: string, value: Blob }[]): Promise<void> {
    if (items.length === 0) return Promise.resolve();
    const db = await this.getDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    items.forEach(item => {
      store.put(item.value, item.key);
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.error("IndexedDB transaction error on setMultiple:", tx.error);
        reject(tx.error);
      };
    });
  }

  async get(key: string): Promise<Blob | null> {
    const db = await this.getDB();
    const tx = db.transaction(this.storeName, 'readonly');
    const request = tx.objectStore(this.storeName).get(key);
    return new Promise(r => request.onsuccess = () => r(request.result || null));
  }
  
  async delete(key: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    tx.objectStore(this.storeName).delete(key);
    return new Promise(r => tx.oncomplete = () => r());
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    tx.objectStore(this.storeName).clear();
    return new Promise(r => tx.oncomplete = () => r());
  }
}

// audioDB will now store both audio and image blobs, keyed by their hash.
export const audioDB = new AudioDB();