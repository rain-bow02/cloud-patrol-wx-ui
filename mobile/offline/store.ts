import { emptyOfflineData, offlineKey, type OfflineData, type OfflineIdentity } from './model'

export interface OfflineStore {
  read(): Promise<OfflineData>
  update(change: (data: OfflineData) => void): Promise<OfflineData>
}
/** IndexedDB保存真实Blob及任务快照；原子读改写防止其他标签页覆盖待同步记录，不保存登录令牌。 */
export function offlineStore(identity: OfflineIdentity, factory: IDBFactory = globalThis.indexedDB): OfflineStore {
  const key = offlineKey(identity)
  if (!factory) throw new Error('Mobile.offlineUnavailable')
  async function transact(change?: (data: OfflineData) => void): Promise<OfflineData> {
    return new Promise((resolve, reject) => {
      const opening = factory.open('patrol-offline-v1', 1)
      opening.onupgradeneeded = () => opening.result.createObjectStore('workspaces')
      opening.onerror = () => reject(new Error('Mobile.offlineStorageFailed'))
      opening.onblocked = () => reject(new Error('Mobile.offlineStorageFailed'))
      opening.onsuccess = () => {
        const db = opening.result
        const transaction = db.transaction('workspaces', change ? 'readwrite' : 'readonly')
        const store = transaction.objectStore('workspaces'), request = store.get(key)
        let result: OfflineData, error: unknown
        request.onsuccess = () => {
          try {
            result = request.result || emptyOfflineData()
            if (change) { change(result); store.put(result, key) }
          } catch (cause) { error = cause; transaction.abort() }
        }
        transaction.oncomplete = () => { db.close(); resolve(result) }
        transaction.onabort = transaction.onerror = () => { db.close(); reject(error || new Error('Mobile.offlineStorageFailed')) }
      }
    })
  }
  return { read: () => transact(), update: change => transact(change) }
}
