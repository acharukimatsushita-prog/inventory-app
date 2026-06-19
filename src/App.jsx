import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Search,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  QrCode,
  Settings,
  Trash2,
  Edit3,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  FileSpreadsheet,
  Printer,
  Download,
  X,
  Copy,
  ListChecks,
  CheckCircle2,
  History,
  Calculator,
  Sun,
  Moon
} from 'lucide-react';
import { useInventory } from './hooks/useInventory';
import { exportOrderList } from './utils/excelExport';
import { exportQrLabels } from './utils/qrBatchExport';
import { QRCodeCanvas } from 'qrcode.react';
import Webcam from 'react-webcam';
import jsQR from 'jsqr';

const MATERIALS = ['ボルト', 'ナット', 'ワッシャー', '配線材', 'センサー', 'モーター', '梱包資材', 'その他'];
const SIZES = ['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12', '-'];
const LENGTHS = ['10', '15', '20', '25', '30', '40', '50', '-'];

const uniqueSorted = (values) => {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

const getStockState = (item) => {
  const qty = Number(item.quantity || 0);
  const min = Number(item.minLot || 0);
  const isOrdered = String(item.isOrdered).toUpperCase() === 'TRUE';

  if (isOrdered) return 'ordered';
  if (qty === 0) return 'empty';
  if (qty <= min) return 'low';
  return 'ok';
};

const RECENT_ORDER_WARNING_HOURS = 24;

const useOrderUiVisibility = () => true;

const getOrderedAtTime = (item) => {
  if (!item.orderedAt) return null;
  const time = new Date(item.orderedAt).getTime();
  return Number.isNaN(time) ? null : time;
};

const formatOrderDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
};

function App() {
  const canUseOrderUi = useOrderUiVisibility();
  const [gasUrl, setGasUrl] = useState(localStorage.getItem('gas_api_url') || '');
  const { items, loading, syncStatus, dataQuality, addItem, updateItem, deleteItem, restoreItem, takeOutItem, restockItem, batchUpdateItems, batchProgress } = useInventory(gasUrl);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState({ category: null, subcategory: null });
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isDuplicateMode, setIsDuplicateMode] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(!gasUrl);
  const [isValueSummaryOpen, setIsValueSummaryOpen] = useState(false);
  const [txTargetItem, setTxTargetItem] = useState(null);
  const [qrPrintItem, setQrPrintItem] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState([]);
  const [txInitialType, setTxInitialType] = useState('out');
  const searchInputRef = useRef(null);

  const [isAuditMode, setIsAuditMode] = useState(false);
  const [auditDrafts, setAuditDrafts] = useState({});
  const [showOnlyLowStock, setShowOnlyLowStock] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [toasts, setToasts] = useState([]);
  const [lastTransaction, setLastTransaction] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('last_transaction') || '{"type":"out","amount":1}');
    } catch {
      return { type: 'out', amount: 1 };
    }
  });
  const [isScannerTransaction, setIsScannerTransaction] = useState(false);

  const pushToast = useCallback((message, options = {}) => {
    const id = crypto.randomUUID();
    const toast = { id, message, type: options.type || 'info', actionLabel: options.actionLabel, onAction: options.onAction };
    setToasts(prev => [...prev, toast]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(item => item.id !== id));
    }, options.duration || 4500);
  }, []);

  const dismissToast = (id) => {
    setToasts(prev => prev.filter(item => item.id !== id));
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const toggleAuditMode = () => {
    if (isAuditMode) {
      setAuditDrafts({});
    }
    setIsAuditMode(!isAuditMode);
  };

  const handleAuditChange = (id, value) => {
    setAuditDrafts(prev => ({ ...prev, [id]: value }));
  };

  const handleSaveAudit = async () => {
    const previousItems = Object.keys(auditDrafts)
      .map(id => items.find(item => item.id === id))
      .filter(Boolean);
    const updates = Object.entries(auditDrafts).map(([id, val]) => ({
      id,
      quantity: Number(val)
    }));

    if (updates.length === 0) {
      setIsAuditMode(false);
      return;
    }

    if (window.confirm(`${updates.length}件の在庫数を一括更新しますか？`)) {
      await batchUpdateItems(updates);
      setIsAuditMode(false);
      setAuditDrafts({});
      pushToast(`${updates.length}件の棚卸結果を保存しました`, {
        type: 'success',
        actionLabel: '元に戻す',
        onAction: () => {
          previousItems.forEach(item => updateItem(item.id, item));
          pushToast('棚卸前の在庫数に戻しました', { type: 'info' });
        }
      });
    }
  };

  const categoryTree = useMemo(() => {
    const tree = {};
    items.forEach(item => {
      const cat = item.category || '未分類';
      if (!tree[cat]) tree[cat] = new Set();
      if (item.name) tree[cat].add(item.name);
    });
    const result = {};
    Object.keys(tree).sort((a, b) => {
      if (a === '未分類') return 1;
      if (b === '未分類') return -1;
      return a.localeCompare(b);
    }).forEach(cat => {
      result[cat] = Array.from(tree[cat]).sort();
    });
    return result;
  }, [items]);

  const handleSaveItem = (formData) => {
    if (editingItem && !isDuplicateMode) {
      updateItem(editingItem.id, formData);
      pushToast('部材情報を更新しました', { type: 'success' });
    } else {
      const dupKeys = ['category', 'name', 'material', 'size', 'length', 'unit', 'supplier', 'maker', 'modelCode'];
      const norm = v => String(v || '').trim().toLowerCase();
      const isDup = items.some(item =>
        dupKeys.every(k => norm(item[k]) === norm(formData[k]))
      );
      if (isDup) {
        alert('同じ内容の部材がすでに登録されています。');
        return;
      }
      addItem(formData);
      pushToast('新しい部材を登録しました', { type: 'success' });
    }
    setIsItemModalOpen(false);
    setEditingItem(null);
    setIsDuplicateMode(false);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setIsDuplicateMode(false);
    setIsItemModalOpen(true);
  };

  const handleDuplicate = (item) => {
    setEditingItem(item);
    setIsDuplicateMode(true);
    setIsItemModalOpen(true);
  };

  const orderItems = useMemo(() => {
    return items.filter(item => {
      const qty = Number(item.quantity || 0);
      const min = Number(item.minLot || 0);
      return qty <= min;
    });
  }, [items]);

  const stockSummary = useMemo(() => {
    return items.reduce((summary, item) => {
      const state = getStockState(item);
      summary.total += 1;
      if (state === 'ordered') summary.ordered += 1;
      else if (state === 'empty') summary.empty += 1;
      else if (state === 'low') summary.low += 1;
      return summary;
    }, { total: 0, empty: 0, low: 0, ordered: 0 });
  }, [items]);

  const valueSummary = useMemo(() => {
    const details = items
      .map(item => {
        const quantity = Math.max(0, Number(item.quantity || 0));
        const unitPrice = Math.max(0, Number(item.unitPrice || 0));
        return {
          ...item,
          quantity,
          unitPrice,
          inventoryValue: quantity * unitPrice
        };
      })
      .sort((a, b) => b.inventoryValue - a.inventoryValue);

    return {
      details,
      totalValue: details.reduce((total, item) => total + item.inventoryValue, 0),
      pricedCount: details.filter(item => item.unitPrice > 0).length
    };
  }, [items]);

  const inputOptions = useMemo(() => ({
    categories: uniqueSorted([...MATERIALS, ...items.map(item => item.category)]),
    names: uniqueSorted(items.map(item => item.name)),
    materials: uniqueSorted(items.map(item => item.material)),
    units: uniqueSorted(items.map(item => item.unit)),
    suppliers: uniqueSorted(items.map(item => item.supplier)),
    makers: uniqueSorted(items.map(item => item.maker)),
    modelCodes: uniqueSorted(items.map(item => item.modelCode)),
    projectNumbers: uniqueSorted(items.map(item => item.projectNumber)),
    projectNames: uniqueSorted(items.map(item => item.projectName))
  }), [items]);

  const filteredItems = useMemo(() => {
    const nat = (a, b) => String(a || '').localeCompare(String(b || ''), 'ja', { numeric: true, sensitivity: 'base' });
    return items.filter(item => {
      const itemCategory = item.category || '未分類';
      const itemName = item.name;
      if (selectedFilter.category && selectedFilter.category !== itemCategory) return false;
      if (selectedFilter.subcategory && selectedFilter.subcategory !== itemName) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const searchableText = [
          item.category,
          item.name,
          item.material,
          item.size,
          item.length,
          item.unit,
          item.supplier,
          item.maker,
          item.projectNumber,
          item.projectName,
          item.modelCode,
          item.remarks
        ].join(' ').toLowerCase();

        if (!searchableText.includes(query)) return false;
      }
      if (showOnlyLowStock) {
        const state = getStockState(item);
        if (state !== 'low' && state !== 'empty') return false;
      }
      return true;
    }).sort((a, b) => nat(a.name, b.name) || nat(a.material, b.material) || nat(a.size, b.size));
  }, [items, searchQuery, selectedFilter, showOnlyLowStock]);

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const handleSettingsSave = (url) => {
    setGasUrl(url);
    localStorage.setItem('gas_api_url', url);
    setIsSettingsOpen(false);
  };

  const [isOrderPreviewOpen, setIsOrderPreviewOpen] = useState(false);
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [showOrderSuccessModal, setShowOrderSuccessModal] = useState(false);
  const [exportRequester, setExportRequester] = useState(localStorage.getItem('last_requester') || '');
  const [exportError, setExportError] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [lastExportedOrderItems, setLastExportedOrderItems] = useState([]);
  const [orderWarningBaseTime, setOrderWarningBaseTime] = useState(0);

  const orderPreviewItems = useMemo(() => {
    return orderItems.filter(item => String(item.isOrdered).toUpperCase() !== 'TRUE');
  }, [orderItems]);

  const selectedOrderItems = useMemo(() => {
    const selected = new Set(selectedOrderIds);
    return orderPreviewItems.filter(item => selected.has(item.id));
  }, [orderPreviewItems, selectedOrderIds]);

  const orderHistoryItems = useMemo(() => {
    return items
      .filter(item => getOrderedAtTime(item))
      .sort((a, b) => getOrderedAtTime(b) - getOrderedAtTime(a))
      .slice(0, 30);
  }, [items]);

  const recentReorderWarnings = useMemo(() => {
    const threshold = orderWarningBaseTime - RECENT_ORDER_WARNING_HOURS * 60 * 60 * 1000;
    return selectedOrderItems.filter(item => {
      const orderedAtTime = getOrderedAtTime(item);
      return orderedAtTime && orderedAtTime >= threshold;
    });
  }, [orderWarningBaseTime, selectedOrderItems]);

  const hasOpenModal = isItemModalOpen || isScannerOpen || isSettingsOpen || isValueSummaryOpen || Boolean(txTargetItem) || Boolean(qrPrintItem) || isOrderPreviewOpen || isOrderHistoryOpen || showOrderSuccessModal || Boolean(exportError);

  const handleExportClick = () => {
    if (!canUseOrderUi) return;
    if (orderPreviewItems.length === 0) {
      setExportError('発注が必要な部材（在庫が最小ロット以下のもの）が現在ありません。');
      return;
    }
    setSelectedOrderIds(orderPreviewItems.map(item => item.id));
    setOrderWarningBaseTime(Date.now());
    setIsOrderPreviewOpen(true);
  };

  const executeExport = async (requester, targetItems = selectedOrderItems) => {
    if (targetItems.length === 0) {
      setExportError('出力対象が選択されていません。');
      return;
    }
    if (requester.trim()) localStorage.setItem('last_requester', requester);
    try {
      await exportOrderList(targetItems, requester);
      setLastExportedOrderItems(targetItems.map(item => ({ ...item })));
      setIsOrderPreviewOpen(false);
      setShowOrderSuccessModal(true);
    } catch (e) {
      setExportError('エクセル出力エラー: ' + e.message);
    }
  };

  const handleMarkAsOrdered = async () => {
    setShowOrderSuccessModal(false);
    const previousItems = lastExportedOrderItems;
    const updates = previousItems.map(item => ({
      id: item.id,
      isOrdered: true,
      orderedBy: exportRequester,
      orderedAt: new Date().toISOString()
    }));
    await batchUpdateItems(updates);
    pushToast(`${updates.length}件を発注済みにしました`, {
      type: 'success',
      actionLabel: '元に戻す',
      onAction: () => {
        previousItems.forEach(item => updateItem(item.id, item));
        pushToast('発注済みの変更を戻しました', { type: 'info' });
      }
    });
  };

  const toggleOrderSelection = (id) => {
    setSelectedOrderIds(prev => prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]);
  };

  const toggleOrderedStatus = (item) => {
    if (!canUseOrderUi) return;
    const currentIsOrdered = String(item.isOrdered).toUpperCase() === 'TRUE';
    const previousItem = { ...item };
    updateItem(item.id, {
      ...item,
      isOrdered: !currentIsOrdered,
      orderedBy: !currentIsOrdered ? (exportRequester || '手動') : item.orderedBy,
      orderedAt: !currentIsOrdered ? new Date().toISOString() : item.orderedAt
    });
    pushToast(!currentIsOrdered ? '発注済みにしました' : '未発注に戻しました', {
      type: 'success',
      actionLabel: '元に戻す',
      onAction: () => updateItem(previousItem.id, previousItem)
    });
  };

  const openTransactionFromScanner = (item) => {
    setIsScannerOpen(false);
    setTxInitialType(lastTransaction.type || 'out');
    setIsScannerTransaction(true);
    setTxTargetItem(item);
  };

  const handleDeleteItem = (item) => {
    if (!window.confirm('この部材を削除してもよろしいですか？')) return;
    deleteItem(item.id);
    pushToast('部材を削除しました', {
      type: 'warning',
      actionLabel: '元に戻す',
      onAction: () => {
        restoreItem(item);
        pushToast('削除した部材を戻しました', { type: 'info' });
      }
    });
  };

  const handleTransactionConfirm = (amount, type) => {
    if (!txTargetItem) return;
    const beforeQty = Number(txTargetItem.quantity || 0);
    const minQty = Number(txTargetItem.minLot || 0);
    const afterQty = type === 'out' ? Math.max(0, beforeQty - amount) : beforeQty + amount;

    if (type === 'out') takeOutItem(txTargetItem.id, amount);
    else restockItem(txTargetItem.id, amount);

    const nextTransaction = { type, amount };
    setLastTransaction(nextTransaction);
    localStorage.setItem('last_transaction', JSON.stringify(nextTransaction));
    setTxTargetItem(null);
    setIsScannerTransaction(false);

    pushToast(`${type === 'out' ? '出庫' : '入庫'}しました（${amount}${txTargetItem.unit || ''}）`, { type: 'success' });
    if (type === 'out' && afterQty <= minQty && beforeQty > minQty) {
      pushToast(`${txTargetItem.material || txTargetItem.name} が発注点を下回りました`, { type: 'warning', duration: 6500 });
    }
  };

  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable
      );

      if (event.key === '/' && !hasOpenModal && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (hasOpenModal || isTyping || event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        setEditingItem(null);
        setIsDuplicateMode(false);
        setIsItemModalOpen(true);
      } else if (key === 'q') {
        event.preventDefault();
        setIsScannerOpen(true);
      } else if (key === 'a') {
        event.preventDefault();
        setIsAuditMode(prev => {
          if (prev) setAuditDrafts({});
          return !prev;
        });
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [hasOpenModal]);

  if (isSettingsOpen) {
    return <SettingsModal initialUrl={gasUrl} onSave={handleSettingsSave} onClose={() => setIsSettingsOpen(false)} />;
  }

  return (
    <div className="container animate-fade-in">
      <header className="header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div className="branding">
          <div className="logo-icon">
            <Package size={32} />
          </div>
          <div className="brand-text">
            <h1 className="logo-title">
              AC-STOCK <span className="logo-subtitle">Inventory System</span>
            </h1>
            <div className="status-bar">
              <span className={`status-indicator status-${syncStatus.state}`}>
                <span className="status-dot"></span>
                {syncStatus.state === 'idle' ? 'システム稼働中 (GAS連携済)' : syncStatus.message}
              </span>
            </div>
          </div>
        </div>

        <div className="header-actions">
          <div className="action-group secondary-actions">
            <button className={`btn ${showOnlyLowStock ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setShowOnlyLowStock(!showOnlyLowStock)} title="在庫不足のみ表示">
              <AlertTriangle size={18} />
              <span className="btn-text">要発注フィルタ</span>
            </button>
            {canUseOrderUi && (
              <>
                <button className="btn btn-secondary btn-success-outline" onClick={handleExportClick}>
                  <FileSpreadsheet size={18} /> <span className="btn-text">発注リスト出力</span>
                </button>
                <button className="btn btn-secondary" onClick={() => exportQrLabels(items, gasUrl)}>
                  <QrCode size={18} /> <span className="btn-text">QR一括印刷</span>
                </button>
                <button className="btn btn-secondary" onClick={() => setIsOrderHistoryOpen(true)} title="直近の発注履歴">
                  <History size={18} /> <span className="btn-text">発注履歴</span>
                </button>
                <div style={{ width: '1px', height: '24px', background: 'var(--surface-border)', margin: '0 0.5rem' }}></div>
              </>
            )}
            <button className={`btn ${isAuditMode ? 'btn-danger' : 'btn-secondary'}`} onClick={toggleAuditMode}>
              <ListChecks size={18} /> <span className="btn-text">{isAuditMode ? '棚卸完了' : '棚卸'}</span>
            </button>
            <button className="btn btn-secondary" onClick={toggleTheme} title={theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替'}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="btn btn-secondary" onClick={() => setIsSettingsOpen(true)}>
              <Settings size={18} /> <span className="btn-text">設定</span>
            </button>
          </div>
        </div>
      </header>

      <div className={`sync-strip sync-${syncStatus.state} no-print`}>
        <span className="sync-dot"></span>
        <span>{syncStatus.state === 'idle' ? 'GAS連携済み。変更はバックグラウンドで保存されます。' : syncStatus.message}</span>
        {dataQuality.repaired > 0 && (
          <span className="sync-note">
            直接編集された行を{dataQuality.repaired}件補完
            {dataQuality.missingIds > 0 ? `（ID ${dataQuality.missingIds}件）` : ''}
          </span>
        )}
        {syncStatus.state === 'saved' && <span className="sync-note">no-cors送信のため、GAS側の反映はバックグラウンドで行われます。</span>}
        {syncStatus.state === 'error' && <span className="sync-note">通信環境またはGAS URLを確認してください。</span>}
      </div>

      <div className="stock-summary no-print">
        <div className="summary-tile summary-neutral">
          <span className="summary-label">総部材数</span>
          <strong>{stockSummary.total}</strong>
        </div>
        <div className="summary-tile summary-danger">
          <span className="summary-label">在庫不足</span>
          <strong>{stockSummary.empty + stockSummary.low}</strong>
        </div>
        {canUseOrderUi && (
          <div className="summary-tile summary-accent">
            <span className="summary-label">発注済み</span>
            <strong>{stockSummary.ordered}</strong>
          </div>
        )}
        <div className={`summary-tile summary-sync summary-sync-${syncStatus.state}`}>
          <span className="summary-label">保存状態</span>
          <strong>{syncStatus.state === 'saving' ? '保存中' : syncStatus.state === 'error' ? '要確認' : syncStatus.state === 'saved' ? '保存済み' : '待機中'}</strong>
        </div>
      </div>

      {canUseOrderUi && orderPreviewItems.length > 0 && (
        <div className="glass-panel no-print" style={{ marginBottom: '2rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.5rem', borderLeft: '5px solid var(--warning-color)', background: 'rgba(245, 158, 11, 0.05)' }}>
          <AlertTriangle color="var(--warning-color)" size={24} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>発注アラート</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              現在 {orderPreviewItems.length} 件の部材が最小ロットを下回っています。
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleExportClick} style={{ background: 'var(--warning-color)', border: 'none' }}>
            <FileSpreadsheet size={18} /> 発注リスト出力
          </button>
        </div>
      )}

      <div className="main-layout" style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        <aside className="sidebar no-print" style={{ width: '280px', flexShrink: 0 }}>
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ChevronRight size={16} /> カテゴリー
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div
                className={`sidebar-item ${!selectedFilter.category ? 'active' : ''}`}
                onClick={() => setSelectedFilter({ category: null, subcategory: null })}
                style={{ padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem' }}
              >
                すべて表示
              </div>
              {Object.entries(categoryTree).map(([cat, names]) => (
                <div key={cat} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div
                    className={`sidebar-item ${selectedFilter.category === cat ? 'active' : ''}`}
                    style={{ padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onClick={() => {
                      setSelectedFilter({ category: cat, subcategory: null });
                      toggleCategory(cat);
                    }}
                  >
                    {cat}
                    {expandedCategories.includes(cat) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                  {expandedCategories.includes(cat) && (
                    <div style={{ paddingLeft: '1.5rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {names.map(name => (
                        <div
                          key={name}
                          className={`sidebar-subitem ${selectedFilter.subcategory === name ? 'active' : ''}`}
                          onClick={() => setSelectedFilter({ category: cat, subcategory: name })}
                          style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0 }}>
          <div className="search-scan-bar glass-panel" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="search-wrapper" style={{ flex: 1, maxWidth: '500px' }}>
              <Search size={16} className="search-icon" />
              <input ref={searchInputRef} type="text" className="form-control" placeholder="部材名、工番、案件名、メーカー、型式、備考などで検索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={() => setIsScannerOpen(true)} style={{ height: '42px', padding: '0 1.5rem' }}>
              <QrCode size={20} /> <span style={{ fontWeight: '600' }}>QRスキャン</span>
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{selectedFilter.subcategory || selectedFilter.category || '全部材'} <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)', fontSize: '1rem' }}>({filteredItems.length})</span></h2>
                {isAuditMode && (
                  <>
                    <button className="btn btn-primary" onClick={handleSaveAudit} style={{ background: 'var(--success-color)', padding: '0.4rem 1rem' }}>
                      <CheckCircle2 size={16} /> 在庫数を確定
                    </button>
                    <button className="btn btn-secondary" onClick={() => setIsValueSummaryOpen(true)} title="在庫金額を確認" style={{ padding: '0.4rem 1rem' }}>
                      <Calculator size={16} /> 金額集計
                    </button>
                  </>
                )}
              </div>
              <button className="btn btn-primary btn-add" onClick={() => { setEditingItem(null); setIsItemModalOpen(true); }}>
                <Plus size={18} /> 新規登録
              </button>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>状態</th>
                    <th className="sticky-col sticky-name" style={{ width: '160px' }}>部材名称 / 材質</th>
                    <th style={{ width: '54px' }}>規格</th>
                    <th style={{ width: '64px' }}>仕様</th>
                    <th style={{ width: '92px', textAlign: 'center' }}>数量操作</th>
                    <th style={{ width: '56px', textAlign: 'center' }}>在庫</th>
                    <th style={{ width: '38px' }}>単位</th>
                    <th className="sticky-col sticky-actions" style={{ width: '132px', textAlign: 'right' }}>管理</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--accent-color)', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div></td></tr>
                  ) : filteredItems.length === 0 ? (
                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>表示する部材がありません。</td></tr>
                  ) : (
                    filteredItems.map(item => {
                      const qty = Number(item.quantity || 0);
                      const stockState = getStockState(item);
                      const isLow = stockState === 'empty' || stockState === 'low';
                      const auditValue = Number(auditDrafts[item.id] ?? item.quantity);
                      const auditDiff = auditValue - qty;

                      return (
                        <tr key={item.id} className={isLow ? 'row-low-stock' : ''}>
                          <td
                            onClick={canUseOrderUi ? () => toggleOrderedStatus(item) : undefined}
                            style={{ cursor: canUseOrderUi ? 'pointer' : 'default', padding: '1rem' }}
                            title={canUseOrderUi ? 'クリックで発注ステータスを切り替え' : undefined}
                          >
                            <ItemStatusBadge item={item} />
                          </td>
                          <td className="sticky-col sticky-name">
                            <div className="item-name-cell">{item.material}</div>
                            {item.remarks && <div className="item-remarks-cell">備考: {item.remarks}</div>}
                          </td>
                          <td>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{item.size && item.size !== '-' ? item.size : '-'}</div>
                          </td>
                          <td>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.length && item.length !== '-' ? item.length : '-'}</div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {!isAuditMode && (
                              <button
                                className="btn-action btn-change"
                                onClick={() => {
                                  setIsScannerTransaction(false);
                                  setTxTargetItem(item);
                                  setTxInitialType(qty === 0 ? 'in' : 'out');
                                }}
                              >
                                数量変更
                              </button>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isAuditMode ? (
                              <div className="audit-cell">
                                <input
                                  type="number"
                                  className="form-control"
                                  style={{ width: '68px', padding: '0.2rem 0.4rem', textAlign: 'center', margin: '0 auto', fontSize: '0.85rem' }}
                                  value={auditDrafts[item.id] ?? item.quantity}
                                  onChange={(e) => handleAuditChange(item.id, e.target.value)}
                                />
                                <AuditDiff current={qty} actual={auditValue} diff={auditDiff} />
                              </div>
                            ) : (
                              <span style={{ fontSize: '1.25rem', fontWeight: '800', color: isLow ? 'var(--danger-color)' : 'inherit', whiteSpace: 'nowrap' }}>{item.quantity}</span>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{item.unit}</td>
                          <td className="sticky-col sticky-actions" style={{ textAlign: 'right', paddingRight: '0.25rem' }}>
                            <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                              {!isAuditMode && (
                                <>
                                  <button className="btn-icon" onClick={() => handleEdit(item)} title="編集">
                                    <Edit3 size={18} />
                                  </button>
                                  <button className="btn-icon" onClick={() => setQrPrintItem(item)} title="QRコード">
                                    <QrCode size={18} />
                                  </button>
                                  <button className="btn-icon" onClick={() => handleDuplicate(item)} title="複製して登録">
                                    <Copy size={18} />
                                  </button>
                                  <button className="btn-icon" onClick={() => handleDeleteItem(item)} title="削除" style={{ color: 'rgba(239, 68, 68, 0.5)' }}>
                                    <Trash2 size={18} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mobile-card-list">
              {loading ? (
                <div className="mobile-empty">
                  <div className="spinner" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--accent-color)', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="mobile-empty">表示する部材がありません。</div>
              ) : (
                filteredItems.map(item => (
                  <InventoryMobileCard
                    key={item.id}
                    item={item}
                    isAuditMode={isAuditMode}
                    auditValue={auditDrafts[item.id] ?? item.quantity}
                    onAuditChange={handleAuditChange}
                    canUseOrderUi={canUseOrderUi}
                    onToggleOrdered={toggleOrderedStatus}
                    onEdit={handleEdit}
                    onQr={setQrPrintItem}
                    onQuantityChange={(target) => {
                      setIsScannerTransaction(false);
                      setTxTargetItem(target);
                      setTxInitialType(Number(target.quantity || 0) === 0 ? 'in' : 'out');
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      {isItemModalOpen && (
        <ItemModal
          onClose={() => { setIsItemModalOpen(false); setEditingItem(null); setIsDuplicateMode(false); }}
          onSave={handleSaveItem}
          initialData={editingItem}
          isDuplicate={isDuplicateMode}
          categoryTree={categoryTree}
          inputOptions={inputOptions}
        />
      )}

      {txTargetItem && (
        <TransactionModal
          item={txTargetItem}
          onClose={() => { setTxTargetItem(null); setIsScannerTransaction(false); }}
          onConfirm={handleTransactionConfirm}
        />
      )}

      {isValueSummaryOpen && (
        <InventoryValueModal
          summary={valueSummary}
          onClose={() => setIsValueSummaryOpen(false)}
        />
      )}

      {isScannerOpen && (
        <QrScannerModal
          items={items}
          onClose={() => setIsScannerOpen(false)}
          onSelectCandidate={openTransactionFromScanner}
        />
      )}

      {batchProgress.isRunning && (
        <div className="modal-overlay" style={{ zIndex: 5000 }}>
          <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', minWidth: '300px' }}>
            <h3 style={{ marginTop: 0 }}>データを保存中...</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{batchProgress.current} / {batchProgress.total} 件 完了</p>
            <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', marginTop: '1.5rem', overflow: 'hidden' }}>
              <div style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%`, height: '100%', background: 'var(--accent-color)', transition: 'width 0.3s ease' }}></div>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--warning-color)', marginTop: '1.5rem', marginBottom: 0 }}>
              <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.25rem' }} />
              保存中は画面を閉じないでください
            </p>
          </div>
        </div>
      )}

      {canUseOrderUi && isOrderPreviewOpen && (
        <OrderPreviewModal
          items={orderPreviewItems}
          selectedIds={selectedOrderIds}
          selectedCount={selectedOrderItems.length}
          recentWarnings={recentReorderWarnings}
          requester={exportRequester}
          onRequesterChange={setExportRequester}
          onToggle={toggleOrderSelection}
          onSelectAll={() => setSelectedOrderIds(orderPreviewItems.map(item => item.id))}
          onClear={() => setSelectedOrderIds([])}
          onClose={() => setIsOrderPreviewOpen(false)}
          onExport={() => executeExport(exportRequester)}
        />
      )}

      {canUseOrderUi && isOrderHistoryOpen && (
        <OrderHistoryModal
          items={orderHistoryItems}
          onClose={() => setIsOrderHistoryOpen(false)}
        />
      )}


      {qrPrintItem && (
        <QrPrintModal
          item={qrPrintItem}
          gasUrl={gasUrl}
          onClose={() => setQrPrintItem(null)}
        />
      )}

      {canUseOrderUi && showOrderSuccessModal && (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
          <div className="modal-content glass-panel" style={{ maxWidth: '400px', padding: '2rem', textAlign: 'center' }}>
            <CheckCircle2 size={48} color="var(--success-color)" style={{ marginBottom: '1rem' }} />
            <h3 style={{ margin: '0 0 0.75rem 0' }}>発注リストを出力しました</h3>
            <p style={{ margin: '0 0 2rem 0', color: 'var(--text-secondary)' }}>
              {lastExportedOrderItems.length}件の部材を発注済みにしますか？
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowOrderSuccessModal(false)} style={{ flex: 1 }}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={handleMarkAsOrdered} style={{ flex: 1 }}>
                はい、発注済みにする
              </button>
            </div>
          </div>
        </div>
      )}

      {exportError && (
        <div className="modal-overlay" onClick={() => setExportError(null)} style={{ zIndex: 3000 }}>
          <div className="modal-content glass-panel" style={{ maxWidth: '400px', padding: '2rem', textAlign: 'center', border: '1px solid var(--danger-color)' }}>
            <AlertTriangle size={48} color="var(--danger-color)" style={{ marginBottom: '1rem' }} />
            <h3 style={{ margin: '0 0 1rem 0' }}>お知らせ</h3>
            <p style={{ margin: 0, color: 'var(--text-primary)' }}>{exportError}</p>
            <button className="btn btn-primary" onClick={() => setExportError(null)} style={{ marginTop: '2rem', width: '100%' }}>閉じる</button>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack no-print">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <div className="toast-message">{toast.message}</div>
          {toast.actionLabel && (
            <button
              className="toast-action"
              onClick={() => {
                toast.onAction?.();
                onDismiss(toast.id);
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button className="toast-close" onClick={() => onDismiss(toast.id)} title="閉じる">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ItemStatusBadge({ item }) {
  const stockState = getStockState(item);

  if (stockState === 'ordered') {
    return (
      <span className="badge badge-ordered">
        発注済 ({item.orderedBy || '完了'})
      </span>
    );
  }

  if (stockState === 'empty') {
    return <span className="badge badge-empty pulse">在庫 0</span>;
  }

  if (stockState === 'low') {
    return <span className="badge badge-low pulse">発注点以下</span>;
  }

  return <span className="badge badge-ok">適正</span>;
}

function AuditDiff({ current, actual, diff }) {
  const diffClass = diff > 0 ? 'audit-plus' : diff < 0 ? 'audit-minus' : 'audit-zero';
  const diffText = diff > 0 ? `+${diff}` : String(diff);

  return (
    <div className={`audit-diff ${diffClass}`}>
      現在 {current} → 実数 {actual} / 差分 {diffText}
    </div>
  );
}

function InventoryMobileCard({ item, isAuditMode, auditValue, onAuditChange, canUseOrderUi, onToggleOrdered, onEdit, onQr, onQuantityChange }) {
  const qty = Number(item.quantity || 0);
  const actual = Number(auditValue);
  const diff = actual - qty;
  const isLow = ['empty', 'low'].includes(getStockState(item));

  return (
    <article className={`inventory-card ${isLow ? 'inventory-card-alert' : ''}`}>
      <div className="inventory-card-head">
        {canUseOrderUi ? (
          <button className="status-button" type="button" onClick={() => onToggleOrdered(item)} title="発注ステータスを切り替え">
            <ItemStatusBadge item={item} />
          </button>
        ) : (
          <ItemStatusBadge item={item} />
        )}
        <button className="btn-icon" onClick={() => onQr(item)} title="QRコード">
          <QrCode size={20} />
        </button>
      </div>

      <div className="inventory-card-title">{item.material || item.name}</div>
      <div className="inventory-card-meta">
        {[item.name, item.size, item.length].filter(Boolean).join(' / ') || '-'}
      </div>

      <div className="inventory-card-stock">
        <span>在庫</span>
        {isAuditMode ? (
          <div className="inventory-card-audit">
            <input
              type="number"
              className="form-control"
              value={auditValue}
              onChange={(e) => onAuditChange(item.id, e.target.value)}
            />
            <AuditDiff current={qty} actual={actual} diff={diff} />
          </div>
        ) : (
          <strong className={isLow ? 'stock-danger' : ''}>{item.quantity} {item.unit}</strong>
        )}
      </div>

      <div className="inventory-card-actions">
        {!isAuditMode && (
          <button className="btn-action btn-change" onClick={() => onQuantityChange(item)}>
            数量変更
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => onEdit(item)}>
          <Edit3 size={18} /> 編集
        </button>
      </div>
    </article>
  );
}

function OrderPreviewModal({ items, selectedIds, selectedCount, recentWarnings, requester, onRequesterChange, onToggle, onSelectAll, onClear, onClose, onExport }) {
  const selected = new Set(selectedIds);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onExport();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content glass-panel order-preview-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal-title-row">
          <h2 style={{ margin: 0 }}>発注リストのプレビュー</h2>
          <button className="btn-icon" onClick={onClose} title="閉じる"><X size={22} /></button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1.25rem' }}>
          出力対象を確認し、不要な部材は一時的にチェックを外してください。
        </p>

        <div className="order-preview-toolbar">
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <label className="form-label">発注担当者名</label>
            <input
              type="text"
              className="form-control"
              value={requester}
              onChange={e => onRequesterChange(e.target.value)}
              placeholder="担当者名を入力"
              autoFocus
            />
          </div>
          <div className="order-preview-count">
            <span>選択中</span>
            <strong>{selectedCount}</strong>
            <span>/ {items.length} 件</span>
          </div>
        </div>

        <div className="order-preview-actions">
          <button type="button" className="btn btn-secondary" onClick={onSelectAll}>全選択</button>
          <button type="button" className="btn btn-secondary" onClick={onClear}>全解除</button>
        </div>

        {recentWarnings.length > 0 && (
          <div className="order-warning-box">
            <div className="order-warning-title">
              <AlertTriangle size={18} />
              24時間以内に発注済みの部材があります
            </div>
            <div className="order-warning-text">
              再発注する場合は、内容を確認してからExcel出力してください。
            </div>
            <div className="order-warning-list">
              {recentWarnings.map(item => (
                <div key={item.id} className="order-warning-item">
                  <strong>{item.material || item.name}</strong>
                  <span>前回: {formatOrderDateTime(item.orderedAt)} / {item.orderedBy || '発注者未入力'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="order-preview-list">
          {items.map(item => (
            <label key={item.id} className={`order-preview-row ${selected.has(item.id) ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => onToggle(item.id)}
              />
              <div className="order-preview-main">
                <strong>{item.material || item.name}</strong>
                <span>{[item.name, item.size, item.length].filter(Boolean).join(' / ') || '-'}</span>
                {(item.projectNumber || item.projectName) && (
                  <small>{[item.projectNumber, item.projectName].filter(Boolean).join(' / ')}</small>
                )}
              </div>
              <div className="order-preview-qty">
                <span>在庫 {item.quantity}{item.unit}</span>
                <span>発注 {item.orderQuantity || 1}{item.unit}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="modal-footer-row">
          <button type="button" className="btn btn-secondary" onClick={onClose}>キャンセル</button>
          <button type="button" className="btn btn-primary" onClick={onExport} disabled={selectedCount === 0}>
            <FileSpreadsheet size={18} /> Excel出力
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderHistoryModal({ items, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content glass-panel order-history-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title-row">
          <h2 style={{ margin: 0 }}>直近の発注履歴</h2>
          <button className="btn-icon" onClick={onClose} title="閉じる"><X size={22} /></button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1.25rem' }}>
          発注リスト出力後に「発注済み」にした部材を、新しい順に表示します。
        </p>

        {items.length === 0 ? (
          <div className="history-empty">発注履歴はまだありません。</div>
        ) : (
          <div className="order-history-list">
            {items.map(item => (
              <div key={`${item.id}-${item.orderedAt}`} className="order-history-row">
                <div className="order-history-main">
                  <strong>{item.material || item.name}</strong>
                  <span>{[item.name, item.size, item.length].filter(Boolean).join(' / ') || '-'}</span>
                  {(item.projectNumber || item.projectName) && (
                    <small>{[item.projectNumber, item.projectName].filter(Boolean).join(' / ')}</small>
                  )}
                </div>
                <div className="order-history-meta">
                  <strong>{formatOrderDateTime(item.orderedAt)}</strong>
                  <span>{item.orderedBy || '発注者未入力'}</span>
                  <span>発注 {item.orderQuantity || 1}{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer-row">
          <button type="button" className="btn btn-secondary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

// === 高速QRコードスキャナーモーダル ===
function QrScannerModal({ items, onClose, onSelectCandidate }) {
  const webcamRef = useRef(null);
  const requestRef = useRef();

  const scanQRCode = useCallback(() => {
    if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) { // HAVE_ENOUGH_DATA
      const video = webcamRef.current.video;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      // ビデオフレームをキャンバスに描画
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // jsQRで解析
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        // URL形式（gasUrl?id=UUID）と生UUID両方に対応
        let scannedId = code.data;
        try {
          const url = new URL(code.data);
          const idParam = url.searchParams.get('id');
          if (idParam) scannedId = idParam;
        } catch (_) { /* 生UUIDの場合はそのまま */ }
        const matchedItem = items.find(i => i.id === scannedId);
        if (matchedItem) {
          onSelectCandidate(matchedItem);
          return; // スキャンループを停止
        }
      }
    }
    // 再帰的に次のフレームをスキャン
    // eslint-disable-next-line react-hooks/immutability
    requestRef.current = requestAnimationFrame(scanQRCode);
  }, [items, onSelectCandidate]);

  useEffect(() => {
    // コンポーネントマウント時にスキャン開始
    requestRef.current = requestAnimationFrame(scanQRCode);
    return () => cancelAnimationFrame(requestRef.current);
  }, [scanQRCode]);

  const videoConstraints = {
    facingMode: "environment",
    width: { ideal: 1280 }, // QRならHDで十分かつ高速
    height: { ideal: 720 }
  };

  return (
    <div className="modal-overlay modal-overlay-top no-print" onClick={onClose} style={{ zIndex: 2000, background: 'rgba(0,0,0,0.85)' }}>
      <div className="modal-content glass-panel scanner-modal" onClick={e => e.stopPropagation()} style={{ padding: '1.5rem', maxWidth: '600px', width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <QrCode size={24} color="var(--accent-color)" /> QRコードで探す
          </h2>
          <button className="btn-icon" onClick={onClose}><X size={24} /></button>
        </div>

        <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#000', height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={videoConstraints}
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          />
          {/* QRコード用のガイド枠 */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '200px', height: '200px', border: '3px solid rgba(29, 78, 158, 0.8)', borderRadius: '12px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: '-30px', left: '0', width: '100%', textAlign: 'center', color: 'white', fontSize: '0.875rem', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
              QRコードを枠内に入れてください
            </div>
          </div>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
          カメラを向けるだけで自動的に認識し、出庫画面が開きます。
        </p>
      </div>
    </div>
  );
}

// === QR印刷・保存用モーダル ===
function QrPrintModal({ item, onClose, gasUrl }) {
  const qrSizeMm = 16;
  const qrCanvasSize = 300;
  const qrValue = gasUrl ? `${gasUrl}?id=${item.id}` : item.id;

  const handlePrint = () => {
    exportQrLabels([item], gasUrl);
  };

  const handleDownload = () => {
    const canvas = document.getElementById('qr-canvas');
    if (canvas) {
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `${item.name}_QRコード.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  return (
    <div className="modal-overlay no-print" onClick={onClose} style={{ zIndex: 3000 }}>
      <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{ padding: '2rem', maxWidth: '400px', textAlign: 'center' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>QRコードの発行</h3>

        {(() => {
          const hasSize   = item.size   && item.size   !== '-';
          const hasLength = item.length && item.length !== '-';
          const topText   = hasSize
            ? [item.name, hasLength ? item.length : ''].filter(Boolean).join('　')
            : item.name;
          const largeText = hasSize ? item.size : (hasLength ? item.length : '');
          return (
            <div className="print-area" style={{ background: '#fff', borderRadius: '8px', color: '#000', display: 'inline-flex', flexDirection: 'row', alignItems: 'stretch', width: '60mm', height: '21mm', overflow: 'hidden', padding: '1mm', boxSizing: 'border-box' }}>
              <QRCodeCanvas
                id="qr-canvas"
                value={qrValue}
                size={qrCanvasSize}
                level="L"
                includeMargin={true}
                style={{ width: `${qrSizeMm}mm`, height: `${qrSizeMm}mm`, flexShrink: 0, alignSelf: 'center' }}
              />
              <div style={{ flex: 1, paddingLeft: '2mm', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontWeight: 'bold', fontSize: '7pt', lineHeight: 1.3, color: '#000', wordBreak: 'break-all' }}>{topText}</div>
                {largeText && (
                  <div style={{ fontWeight: 'bold', fontSize: '20pt', lineHeight: 1.2, color: '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {largeText}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '2rem' }}>
          <button className="btn btn-primary" onClick={handlePrint}>
            <Printer size={18} />
            Excelで出力して印刷
          </button>
          <button className="btn btn-secondary" onClick={handleDownload} style={{ color: 'var(--success-color)', borderColor: 'var(--success-color)' }}>
            <Download size={18} />
            画像として保存（タブレット向け）
          </button>
          <button className="btn btn-secondary" onClick={onClose} style={{ marginTop: '0.5rem' }}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

// === トランザクション、設定モーダル ===
function SettingsModal({ initialUrl, onClose, onSave }) {
  const [url, setUrl] = useState(initialUrl);
  const formRef = useRef(null);
  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && initialUrl) {
      event.preventDefault();
      onClose();
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };
  return (
    <div className="modal-overlay no-print" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown} style={{ padding: '2rem', maxWidth: '500px' }}>
        <h2>Google Apps Script (GAS) 連携設定</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>スプレッドシート側にデプロイした「ウェブアプリのURL」をここに貼り付けてください。この設定はこのタブレット（ブラウザ）にのみ保存されます。</p>
        <form ref={formRef} onSubmit={e => { e.preventDefault(); onSave(url); }}>
          <div className="form-group">
            <label className="form-label">ウェブアプリ의 URL</label>
            <input required type="url" className="form-control" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            {initialUrl && <button type="button" className="btn btn-secondary" onClick={onClose}>キャンセル</button>}
            <button type="submit" className="btn btn-primary">保存する</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InventoryValueModal({ summary, onClose }) {
  return (
    <div className="modal-overlay no-print" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="modal-content glass-panel value-summary-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-title-row">
          <div>
            <h2 style={{ margin: 0 }}>在庫金額集計</h2>
            <p className="value-summary-note">単価 × 現在庫数で計算した税抜金額です。</p>
          </div>
          <button className="btn-icon" onClick={onClose} title="閉じる">
            <X size={22} />
          </button>
        </div>

        <div className="value-summary-overview">
          <div className="value-summary-total">
            <span>在庫合計金額</span>
            <strong>{formatCurrency(summary.totalValue)}</strong>
          </div>
          <div className="value-summary-status">
            単価登録済み {summary.pricedCount} / {summary.details.length} 件
          </div>
        </div>

        <div className="value-summary-list">
          {summary.details.length === 0 ? (
            <div className="value-summary-empty">登録されている部材がありません。</div>
          ) : (
            summary.details.map(item => (
              <div className="value-summary-row" key={item.id}>
                <div className="value-summary-item">
                  <strong>{item.material || item.name}</strong>
                  <span>{item.category} / {item.name}</span>
                </div>
                <div className="value-summary-calculation">
                  <span>{formatCurrency(item.unitPrice)} × {item.quantity}{item.unit}</span>
                  <strong>{formatCurrency(item.inventoryValue)}</strong>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="modal-footer-row value-summary-footer">
          <span>単価未入力の部材は0円として計算されます。</span>
          <button className="btn btn-primary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

function TransactionModal({ item, onClose, onConfirm }) {
  const [amount, setAmount] = useState(1);
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="modal-overlay no-print" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown} style={{ padding: '2rem', maxWidth: '400px' }}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem' }}>数量を選択</h2>
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>
            {item.name}
            {item.material && item.material !== '-' && <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginLeft: '0.5rem' }}>({item.material})</span>}
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>現在庫: <strong>{item.quantity}</strong> {item.unit}</div>
          {(item.size || item.length) && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {item.size && <span>規格・サイズ: {item.size}</span>}
              {item.size && item.length && <span style={{ margin: '0 0.5rem' }}>/</span>}
              {item.length && <span>仕様・詳細: {item.length}</span>}
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">数量 ({item.unit})</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAmount(Math.max(1, amount - 1))}>-</button>
            <input autoFocus type="number" min="1" className="form-control" value={amount} onChange={e => setAmount(Number(e.target.value))} style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: 'bold' }} />
            <button type="button" className="btn btn-secondary" onClick={() => setAmount(amount + 1)}>+</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>キャンセル</button>
          <button type="button" className="btn" style={{ flex: 1, background: 'var(--danger-color)', color: 'white' }} disabled={amount > item.quantity} onClick={() => onConfirm(Number(amount), 'out')}>出庫する</button>
          <button type="button" className="btn" style={{ flex: 1, background: 'var(--success-color)', color: 'white' }} onClick={() => onConfirm(Number(amount), 'in')}>入庫する</button>
        </div>
      </div>
    </div>
  );
}

// === 動的カテゴリー対応 部材登録モーダル ===
function ItemModal({ onClose, onSave, initialData, categoryTree, inputOptions, isDuplicate }) {
  const categories = Object.keys(categoryTree);
  const initialCat = initialData?.category || categories[0] || '';
  const initialName = initialData?.name || '';
  const formRef = useRef(null);

  const isEdit = initialData && !isDuplicate;

  const [formData, setFormData] = useState({
    category: initialData?.category || initialCat,
    name: initialData?.name || initialName,
    material: initialData?.material || '',
    size: initialData?.size || '',
    length: initialData?.length || '',
    unit: initialData?.unit || '個',
    supplier: initialData?.supplier || '',
    maker: initialData?.maker || '',
    projectNumber: initialData?.projectNumber || '',
    projectName: initialData?.projectName || '',
    remarks: initialData?.remarks || '',
    leadDays: initialData?.leadDays ?? 0,
    modelCode: initialData?.modelCode || '',
    quantity: isDuplicate ? 0 : (initialData?.quantity ?? 0),
    unitPrice: initialData?.unitPrice ?? 0,
    minLot: initialData?.minLot ?? 5,
    orderQuantity: initialData?.orderQuantity ?? 10
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      quantity: Number(formData.quantity),
      unitPrice: Math.max(0, Number(formData.unitPrice)),
      minLot: Number(formData.minLot),
      orderQuantity: Number(formData.orderQuantity)
    });
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const currentNames = categoryTree[formData.category] || [];
  const nameOptions = uniqueSorted([...currentNames, ...(inputOptions?.names || [])]);

  return (
    <div className="modal-overlay modal-overlay-top no-print" style={{ zIndex: 1000 }}>
      <div className="modal-content glass-panel item-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown} style={{ padding: '2rem', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>
          {isEdit ? '部材情報の編集' : (isDuplicate ? '部材を複製して登録' : '新規部材の登録')}
        </h2>
        <form ref={formRef} onSubmit={handleSubmit}>
          <h4 style={{ color: 'var(--accent-color)', marginBottom: '0.75rem', marginTop: 0, fontSize: '0.95rem' }}>1. サイドバーの分類設定</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">第1階層 (大分類カテゴリー)</label>
              <input required type="text" list="cat-list" className="form-control" value={formData.category} onChange={e => handleChange('category', e.target.value)} placeholder="例: 安全体感装置部材" />
              <datalist id="cat-list">
                {(inputOptions?.categories || categories).map(cat => <option key={cat} value={cat} />)}
              </datalist>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">第2階層 (中分類フォルダ名)</label>
              <input required type="text" list="name-list" className="form-control" value={formData.name} onChange={e => handleChange('name', e.target.value)} placeholder="例: モーター、CAPボルト" />
              <datalist id="name-list">
                {nameOptions.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0', marginBottom: '1.5rem' }}>※ここに登録した名前で左側のサイドバーが作られます。</p>

          <div style={{ height: '1px', background: 'var(--surface-border)', margin: '1rem 0' }}></div>

          <h4 style={{ color: 'var(--accent-color)', marginBottom: '0.75rem', marginTop: 0, fontSize: '0.95rem' }}>2. 第3階層（個別の部材名・仕様）</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">具体的な部材名 / 材質</label>
              <input required type="text" list="mat-list" className="form-control" value={formData.material} onChange={e => handleChange('material', e.target.value)} placeholder="例: ACサーボモーター 100W" />
              <datalist id="mat-list">
                {(inputOptions?.materials || []).map(value => <option key={value} value={value} />)}
              </datalist>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">規格・サイズ <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>(任意)</span></label>
              <input type="text" list="size-list" className="form-control" value={formData.size} onChange={e => handleChange('size', e.target.value)} placeholder="例: M8" />
              <datalist id="size-list">
                {SIZES.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">仕様・詳細 <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>(任意)</span></label>
              <input type="text" list="len-list" className="form-control" value={formData.length} onChange={e => handleChange('length', e.target.value)} placeholder="例: 20" />
              <datalist id="len-list">
                {LENGTHS.map(l => <option key={l} value={l} />)}
              </datalist>
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0', marginBottom: '1rem' }}>※ここに実際の部品の名称や仕様を入力してください。一覧に表示されます。</p>
          <div style={{ height: '1px', background: 'var(--surface-border)', margin: '1rem 0' }}></div>
          <div className="item-stock-grid">
            <div className="form-group">
              <label className="form-label">現在庫数</label>
              <input required type="number" min="0" className="form-control" value={formData.quantity} onChange={e => handleChange('quantity', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">最小ロット数 (発注点)</label>
              <input required type="number" min="0" className="form-control" value={formData.minLot} onChange={e => handleChange('minLot', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">単位</label>
              <input required type="text" list="unit-list" className="form-control" value={formData.unit} onChange={e => handleChange('unit', e.target.value)} placeholder="例: 箱" />
              <datalist id="unit-list">
                {(inputOptions?.units || []).map(value => <option key={value} value={value} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">単価（円・税抜）</label>
              <input required type="number" min="0" step="1" className="form-control" value={formData.unitPrice} onChange={e => handleChange('unitPrice', e.target.value)} />
            </div>
          </div>
          <div style={{ height: '1px', background: 'var(--surface-border)', margin: '1rem 0' }}></div>
          <h4 style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>3. プロジェクト・発注書（Excel）用設定</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">工番</label>
              <input type="text" list="project-number-list" className="form-control" value={formData.projectNumber} onChange={e => handleChange('projectNumber', e.target.value)} placeholder="例: P2024-001" />
              <datalist id="project-number-list">
                {(inputOptions?.projectNumbers || []).map(value => <option key={value} value={value} />)}
              </datalist>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">案件名</label>
              <input type="text" list="project-name-list" className="form-control" value={formData.projectName} onChange={e => handleChange('projectName', e.target.value)} placeholder="例: 〇〇様向け安全体感装置" />
              <datalist id="project-name-list">
                {(inputOptions?.projectNames || []).map(value => <option key={value} value={value} />)}
              </datalist>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">発注先</label>
              <input type="text" list="supplier-list" className="form-control" value={formData.supplier} onChange={e => handleChange('supplier', e.target.value)} placeholder="例: 富国" />
              <datalist id="supplier-list">
                {(inputOptions?.suppliers || []).map(value => <option key={value} value={value} />)}
              </datalist>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">メーカー</label>
              <input type="text" list="maker-list" className="form-control" value={formData.maker} onChange={e => handleChange('maker', e.target.value)} placeholder="例: オムロン" />
              <datalist id="maker-list">
                {(inputOptions?.makers || []).map(value => <option key={value} value={value} />)}
              </datalist>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">発注単位（1回の手配数）</label>
              <input required type="number" min="1" className="form-control" value={formData.orderQuantity} onChange={e => handleChange('orderQuantity', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">注文コード / 型式</label>
              <input type="text" list="model-code-list" className="form-control" value={formData.modelCode} onChange={e => handleChange('modelCode', e.target.value)} placeholder="例: E2E-X5" />
              <datalist id="model-code-list">
                {(inputOptions?.modelCodes || []).map(value => <option key={value} value={value} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">備考</label>
              <input type="text" className="form-control" value={formData.remarks} onChange={e => handleChange('remarks', e.target.value)} placeholder="備考があれば入力" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">納期（営業日数）</label>
              <input type="number" className="form-control" min="0" value={formData.leadDays || ''} onChange={e => handleChange('leadDays', Number(e.target.value) || 0)} placeholder="例: 10（土日を除く10営業日後）" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>キャンセル</button>
            <button type="submit" className="btn btn-primary">{initialData ? '更新する' : '登録する'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const style = document.createElement('style');
style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
document.head.appendChild(style);

export default App;
