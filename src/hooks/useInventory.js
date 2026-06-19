import { useState, useEffect, useCallback, useRef } from 'react';

const ITEM_DEFAULTS = {
  category: '未分類',
  name: '未分類',
  material: '名称未設定',
  size: '',
  length: '',
  unit: '個',
  supplier: '',
  maker: '',
  projectNumber: '',
  projectName: '',
  remarks: '',
  modelCode: '',
  quantity: 0,
  unitPrice: 0,
  minLot: 0,
  orderQuantity: 1,
  isOrdered: false,
  orderedBy: '',
  orderedAt: '',
  leadDays: 0,
  createdAt: '',
  updatedAt: ''
};

const toNumber = (value, fallback = 0) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', '済', '発注済', '発注済み'].includes(normalized);
};

const hashString = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const createFallbackId = (source, index) => {
  const rowIndex = source._rowIndex || source.rowIndex || index + 2;
  const signature = [
    rowIndex,
    source.category,
    source.name,
    source.material,
    source.size,
    source.length,
    source.supplier,
    source.modelCode
  ].join('|');
  return `sheet-row-${rowIndex}-${hashString(signature)}`;
};

const cleanItemForSync = (item) => {
  if (!item || typeof item !== 'object') return item;
  const syncItem = { ...item };
  delete syncItem._autoCompleted;
  return syncItem;
};

const normalizeItem = (rawItem, index) => {
  const source = rawItem && typeof rawItem === 'object' ? rawItem : {};
  const warnings = [];
  const now = new Date().toISOString();
  const id = String(source.id || '').trim() || createFallbackId(source, index);

  if (!source.id) warnings.push('id');
  if (!source.category) warnings.push('category');
  if (!source.name) warnings.push('name');
  if (!source.material) warnings.push('material');
  if (!source.unit) warnings.push('unit');

  return {
    item: {
      ...ITEM_DEFAULTS,
      ...source,
      id,
      category: String(source.category || ITEM_DEFAULTS.category).trim(),
      name: String(source.name || ITEM_DEFAULTS.name).trim(),
      material: String(source.material || ITEM_DEFAULTS.material).trim(),
      size: String(source.size || '').trim(),
      length: String(source.length || '').trim(),
      unit: String(source.unit || ITEM_DEFAULTS.unit).trim(),
      supplier: String(source.supplier || '').trim(),
      maker: String(source.maker || '').trim(),
      projectNumber: String(source.projectNumber || '').trim(),
      projectName: String(source.projectName || '').trim(),
      remarks: String(source.remarks || '').trim(),
      modelCode: String(source.modelCode || '').trim(),
      quantity: toNumber(source.quantity, ITEM_DEFAULTS.quantity),
      unitPrice: Math.max(0, toNumber(source.unitPrice, ITEM_DEFAULTS.unitPrice)),
      minLot: toNumber(source.minLot, ITEM_DEFAULTS.minLot),
      orderQuantity: Math.max(1, toNumber(source.orderQuantity, ITEM_DEFAULTS.orderQuantity)),
      isOrdered: toBoolean(source.isOrdered),
      orderedBy: String(source.orderedBy || '').trim(),
      orderedAt: String(source.orderedAt || '').trim(),
      leadDays: toNumber(source.leadDays, 0),
      createdAt: String(source.createdAt || now).trim(),
      updatedAt: String(source.updatedAt || '').trim(),
      _rowIndex: source._rowIndex || source.rowIndex || index + 2,
      _autoCompleted: warnings
    },
    needsWriteBack: warnings.length > 0,
    warnings
  };
};

const normalizeItems = (data) => {
  const sourceItems = Array.isArray(data) ? data : [];
  const results = sourceItems.map((item, index) => normalizeItem(item, index));
  return {
    items: results.map(result => result.item),
    repairedItems: results.filter(result => result.needsWriteBack).map(result => result.item),
    summary: {
      total: sourceItems.length,
      repaired: results.filter(result => result.needsWriteBack).length,
      missingIds: results.filter(result => result.warnings.includes('id')).length
    }
  };
};

const fetchItemsWithJsonp = (gasUrl) => {
  return new Promise((resolve, reject) => {
    const callbackName = `__acStockJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const separator = gasUrl.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('GAS JSONP request timed out'));
    }, 15000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('GAS JSONP request failed'));
    };
    script.src = `${gasUrl}${separator}callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
    document.head.appendChild(script);
  });
};

export function useInventory(gasUrl) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batchProgress, setBatchProgress] = useState({ isRunning: false, current: 0, total: 0 });
  const [syncStatus, setSyncStatus] = useState({ state: 'idle', message: '待機中' });
  const [dataQuality, setDataQuality] = useState({ total: 0, repaired: 0, missingIds: 0 });
  const fetchItemsRef = useRef(null);
  const itemsRef = useRef([]);

  // itemsRef を常に最新の items に同期
  useEffect(() => { itemsRef.current = items; }, [items]);

  // GASへのデータ送信（バックグラウンド処理）
  const syncToGas = useCallback(async (action, payload, options = {}) => {
    if (!gasUrl) return;
    if (!options.silent) setSyncStatus({ state: 'saving', message: '保存中...' });
    try {
      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors', // GASのCORSブロックを回避して確実にデータを送信
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload: cleanItemForSync(payload) })
      });
      if (!options.silent) setSyncStatus({ state: 'saved', message: '保存済み' });
    } catch (e) {
      console.error('GAS sync error', e);
      setSyncStatus({ state: 'error', message: '同期失敗の可能性あり' });
    }
  }, [gasUrl]);

  const fetchItems = useCallback(async (options = {}) => {
    if (!gasUrl) return;
    if (!options.silent) setLoading(true);
    try {
      let data;
      try {
        const response = await fetch(gasUrl);
        data = await response.json();
      } catch (fetchError) {
        console.warn('GAS fetch failed; retrying with JSONP', fetchError);
        data = await fetchItemsWithJsonp(gasUrl);
      }
      const normalized = normalizeItems(data);
      setItems(normalized.items);
      setDataQuality(normalized.summary);

      if (!options.silent && normalized.summary.repaired > 0) {
        setSyncStatus({
          state: 'saving',
          message: `スプレッドシート入力の不足項目を${normalized.summary.repaired}件補完中...`
        });
        await Promise.all(normalized.repairedItems.map(item => syncToGas('update', item, { silent: true })));
        setSyncStatus({
          state: 'saved',
          message: `不足項目を${normalized.summary.repaired}件補完しました`
        });
      }
    } catch (e) {
      if (!options.silent) {
        console.error('Failed to fetch from GAS', e);
        setSyncStatus({ state: 'error', message: 'データ取得に失敗しました' });
      }
    } finally {
      if (!options.silent) setLoading(false);
    }
  }, [gasUrl, syncToGas]);

  fetchItemsRef.current = fetchItems;

  // 初回データ取得
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchItems();
  }, [fetchItems]);

  // 60分ごとに自動同期（タブが表示中のみ）
  useEffect(() => {
    if (!gasUrl) return;
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchItemsRef.current({ silent: true });
      }
    }, 60 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [gasUrl]);

  const addItem = (item) => {
    const newItem = normalizeItem({ ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, 0).item;
    setItems(prev => [newItem, ...prev]); // UIを先に更新（Optimistic UI）
    syncToGas('add', newItem);
  };

  const updateItem = (id, updatedFields) => {
    let updatedItem;
    setItems(prev => {
      const existing = prev.find(item => item.id === id) || {};
      updatedItem = normalizeItem({ ...existing, ...updatedFields, id, updatedAt: new Date().toISOString() }, 0).item;
      return prev.map(item => item.id === id ? updatedItem : item);
    });
    syncToGas('update', updatedItem);
  };

  const deleteItem = (id) => {
    setItems(prev => prev.filter(item => item.id !== id));
    syncToGas('delete', { id });
  };

  const restoreItem = (item) => {
    setItems(prev => prev.some(existing => existing.id === item.id) ? prev : [item, ...prev]);
    syncToGas('add', item);
  };

  const takeOutItem = (id, amount) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const newQuantity = Math.max(0, Number(item.quantity || 0) - amount);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
    
    syncToGas('takeOut', { id, amount });
  };

  const restockItem = async (id, amount) => {
    const item = items.find(i => i.id === id);
    if (item) {
      const newQuantity = Number(item.quantity) + amount;
      // 入庫時は「発注済み」フラグを下ろす
      await updateItem(id, { 
        ...item, 
        quantity: newQuantity, 
        isOrdered: false, 
        orderedBy: '', 
        orderedAt: '' 
      });
    }
  };

  const batchUpdateItems = async (updatesArray) => {
    setBatchProgress({ isRunning: true, current: 0, total: updatesArray.length });
    setSyncStatus({ state: 'saving', message: '一括保存中...' });

    for (let i = 0; i < updatesArray.length; i++) {
      const update = updatesArray[i]; // { id, ...newFields }

      // setItems の updater 経由ではなく ref から直接読み取る（React 18 の非同期バッチ問題を回避）
      const currentItem = itemsRef.current.find(it => it.id === update.id);

      if (!currentItem) continue;
      
      const updatedItem = normalizeItem({ ...currentItem, ...update, updatedAt: new Date().toISOString() }, i).item;
      
      try {
        await fetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', payload: cleanItemForSync(updatedItem) })
        });
        
        // ローカルステートを1件ごとに更新
        setItems(prev => prev.map(it => it.id === update.id ? updatedItem : it));
        setBatchProgress({ isRunning: true, current: i + 1, total: updatesArray.length });
      } catch (e) {
        console.error('Batch update failed', e);
        setSyncStatus({ state: 'error', message: '一括同期に失敗しました' });
      }
    }
    
    setBatchProgress({ isRunning: false, current: 0, total: 0 });
    setSyncStatus(prev => prev.state === 'error' ? prev : { state: 'saved', message: '保存済み' });
  };

  return { items, loading, syncStatus, dataQuality, addItem, updateItem, deleteItem, restoreItem, takeOutItem, restockItem, batchUpdateItems, batchProgress };
}
