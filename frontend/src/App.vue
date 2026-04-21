<template>
  <div id="app">
    <nav>
      <button @click="currentView = 'list'">상품 목록</button>
      <button @click="currentView = 'upload'">엑셀 업로드</button>
    </nav>
    
    <ProductUpload v-if="currentView === 'upload'" />
    
    <!-- Toast Container -->
    <div class="toast-container">
      <div v-for="toast in toastMessages" :key="toast.id" class="toast">
        {{ toast.text }}
      </div>
    </div>

    <div v-if="currentView === 'list'">
      <div class="header-container">
        <h1>재고 대시보드</h1>
        <div class="header-actions">
          <button class="excel-download-btn" @click="openDownloadModal">
            📥 엑셀 다운로드
            <span v-if="modifiedIds.size > 0" class="modified-badge">{{ modifiedIds.size }}</span>
          </button>
          <label class="group-toggle">
            <input type="checkbox" v-model="isGroupView" />
            <span>그룹으로 묶어보기</span>
          </label>
        </div>
      </div>

      <!-- Excel Download Modal -->
      <div v-if="showDownloadModal" class="modal-overlay" @click.self="showDownloadModal = false">
        <div class="modal-box">
          <h2 class="modal-title">📥 엑셀 다운로드</h2>

          <div class="modal-section">
            <label class="modal-label">다운로드 범위</label>
            <div class="radio-group">
              <label>
                <input type="radio" v-model="downloadMode" value="all" /> 전체 (현재 탭)
              </label>
              <label :class="{ disabled: modifiedIds.size === 0 }">
                <input type="radio" v-model="downloadMode" value="modified" :disabled="modifiedIds.size === 0" />
                수정된 항목만
                <span class="badge">{{ modifiedIds.size }}개</span>
              </label>
            </div>
          </div>

          <div class="modal-section">
            <label class="modal-label">포함할 컬럼 선택</label>
            <div class="col-check-grid">
              <label v-for="key in Object.keys(defaultCols)" :key="key" class="col-check-item">
                <input type="checkbox" v-model="downloadCols[key]" />
                {{ defaultCols[key].label }}
              </label>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-cancel" @click="showDownloadModal = false">취소</button>
            <button class="btn-download" @click="doDownloadExcel">다운로드</button>
          </div>
        </div>
      </div>
      
      <!-- Field Visibility & Ordering Checklist -->
      <div class="column-visibility-container">
        <strong>표시 및 순서 (드래그하여 순서 변경): </strong>
        <div 
          v-for="(key, index) in columnOrder" 
          :key="key" 
          class="vis-label draggable-col"
          draggable="true"
          @dragstart="onColDragStart(index)"
          @dragover.prevent
          @drop="onColDrop(index)"
        >
          <input type="checkbox" v-model="columnVisibility[key].visible" /> {{ defaultCols[key].label }}
        </div>
      </div>

      <div class="add-product">
        <h2>새 상품 추가</h2>
        <input v-model="newProduct.manage_code" placeholder="관리 코드" />
        <input v-model="newProduct.manage_name" placeholder="상품명" />
        <input v-model.number="newProduct.quantity" placeholder="수량" type="number" />
        <input v-model.number="newProduct.purchase_price" placeholder="매입가" type="number" />
        <button @click="addProduct">상품 추가</button>
      </div>

      <!-- Tab Navigation -->
      <div class="tab-navigation">
        <button 
          v-for="tab in allTabs()" 
          :key="tab"
          :class="{ 'active': activeTab === tab, 'loading': loadingTabs.has(tab) }"
          @click="selectTab(tab)"
          :disabled="loadingTabs.has(tab)"
        >
          {{ tab }}
          <span v-if="loadingTabs.has(tab)" class="loading-dot">●</span>
        </button>
      </div>

      <!-- Search Input -->
      <div v-if="activeTab === '🔍 검색'" class="search-container">
        <input 
          v-model="searchQuery" 
          placeholder="검색어 (관리코드 또는 상품명 일부 입력)" 
          @keyup.enter="loadTab('🔍 검색', true)" 
        />
        <button @click="loadTab('🔍 검색', true)">검색</button>
      </div>

      <!-- Products Table for Active Tab -->
      <div v-if="activeTab" class="table-wrapper">
        <table class="product-table" @dragstart.prevent>
          <thead>
            <tr>
              <th class="th-no" style="position: sticky; left: 0; z-index: 2; background: #f5f5f5;">No</th>
              <th
                v-for="key in visibleColsKeys"
                :key="key"
                class="resizable-th"
                :style="{ width: colWidths[key] + 'px', minWidth: '40px' }"
              >
                <span class="th-label">{{ defaultCols[key].label }}</span>
                <span
                  class="col-resize-handle"
                  @mousedown.stop.prevent="startColResize($event, key)"
                ></span>
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in renderRows" :key="row.isGroupRow ? row.node.id : row.product.id">
              <!-- Group Row -->
              <tr v-if="row.isGroupRow" class="group-row" @click="toggleGroup(row.node.prefix)" :style="{ backgroundColor: row.node.color }">
                <td :style="{ backgroundColor: row.node.color, textAlign: 'center', position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid #ddd' }">
                  <span class="expand-icon">{{ expandedGroups.has(row.node.prefix) ? '▼' : '▶' }}</span>
                </td>
                <td v-if="columnVisibility.manage_code.visible"><strong>{{ row.node.prefix }}</strong></td>
                <td :colspan="visibleColCount - (columnVisibility.manage_code.visible ? 1 : 0)"><strong>{{ row.node.name }}</strong></td>
              </tr>

              <!-- Items / Flat Rows -->
              <tr v-else class="item-row" :class="{ 'single-item-row': !row.idxInGroup && row.idxInGroup !== 0 }" :style="{ backgroundColor: row.color || '#fff' }">
                <td :style="{ backgroundColor: row.color || '#fff', textAlign: 'center', color: '#888', fontSize: '11px', position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid #ddd' }">
                  {{ (row.idxInGroup !== undefined) ? (row.idxInGroup + 1) : '-' }}
                </td>
                
                <td v-for="(key, cIdx) in visibleColsKeys" :key="key"
                    @mousedown.stop="onMouseDown(row.rIdx, cIdx, $event)"
                    @mouseenter="onMouseEnter(row.rIdx, cIdx)"
                    @dblclick="onDoubleClick(row.rIdx, cIdx)"
                    :class="{ 'cell-selected': isSelected(row.rIdx, cIdx) }"
                    class="excel-cell">
                  
                  <template v-if="isEditing(row.rIdx, cIdx)">
                    <select v-if="key === 'is_hidden'"
                       class="full-input edit-active" 
                       :id="'edit-'+row.rIdx+'-'+cIdx" 
                       :value="row.product[key] ? 'true' : 'false'" 
                       @blur="closeAndSave(row.product, key, $event.target.value === 'true')">
                      <option value="false">노출</option>
                      <option value="true">숨김</option>
                    </select>
                    
                    <input v-else-if="defaultCols[key].type === 'number'"
                       type="number"
                       class="full-input edit-active" 
                       :id="'edit-'+row.rIdx+'-'+cIdx" 
                       :value="row.product[key]" 
                       @blur="closeAndSave(row.product, key, $event.target.valueAsNumber)"
                       @keydown.enter="$event.target.blur()" />

                    <template v-else-if="key === 'updated_at'">
                      <div class="padding-cell text-muted">{{ formatDate(row.product.updated_at) }}</div>
                    </template>

                    <input v-else
                       class="full-input edit-active" 
                       :id="'edit-'+row.rIdx+'-'+cIdx" 
                       :value="row.product[key]" 
                       @blur="closeAndSave(row.product, key, $event.target.value)"
                       @keydown.enter="$event.target.blur()" />
                  </template>

                  <!-- Standard readable view -->
                  <template v-else>
                    <div class="padding-cell text-content">
                       <template v-if="key === 'is_hidden'">{{ row.product.is_hidden ? '숨김' : '노출' }}</template>
                       <template v-else-if="key === 'updated_at'">
                         <span class="text-muted">{{ formatDate(row.product.updated_at) }}</span>
                       </template>
                       <template v-else-if="key === 'manage_name' && row.idxInGroup !== undefined">
                         {{ getShortName(row.product.manage_name) }}
                       </template>
                       <template v-else>{{ row.product[key] }}</template>
                    </div>
                  </template>
                  
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div v-else class="loading-message">
        탭을 선택하여 상품을 확인하세요
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { supabase } from "./supabaseClient";
import ProductUpload from "./components/ProductUpload.vue";

const newProduct = ref({
  manage_code: "",
  manage_name: "",
  quantity: 0,
  purchase_price: 0,
});
const currentView = ref("list");
const isGroupView = ref(true);
const toastMessages = ref([]);

function addToast(message) {
  const id = Date.now() + Math.random();
  toastMessages.value.push({ id, text: message });
  setTimeout(() => {
    toastMessages.value = toastMessages.value.filter(t => t.id !== id);
  }, 2000);
}

const expandedGroups = ref(new Set());
const tabProducts = ref({});
const activeTab = ref('🔍 검색');
const loadingTabs = ref(new Set());

// Undo Stack for Ctrl+Z
const undoStack = ref([]);
const pushToUndo = (changes) => {
  undoStack.value.push(changes);
  if (undoStack.value.length > 50) undoStack.value.shift(); // Limit stack size
};

const undoLastAction = async () => {
  if (undoStack.value.length === 0) return;
  const lastChanges = undoStack.value.pop();
  const promises = [];
  const updatedProducts = new Map();

  for (const change of lastChanges) {
    const { id, field, oldValue } = change;
    const updates = { [field]: oldValue, updated_at: new Date().toISOString() };
    promises.push(supabase.from('products').update(updates).eq('id', id));
    
    // Track updates for local cache sync
    if (!updatedProducts.has(id)) updatedProducts.set(id, {});
    updatedProducts.get(id)[field] = oldValue;
    updatedProducts.get(id).updated_at = updates.updated_at;
  }

  addToast(`복구 중 (${lastChanges.length}개 항목)...`);
  await Promise.all(promises);

  // Sync local cache
  const active = activeTab.value;
  if (active && tabProducts.value[active]) {
    updatedProducts.forEach((updates, id) => {
      const idx = tabProducts.value[active].findIndex(p => p.id === id);
      if (idx !== -1) {
        tabProducts.value[active][idx] = { ...tabProducts.value[active][idx], ...updates };
      }
    });
  }
  addToast('복구 완료');
};

const defaultCols = {
  manage_code: { label: '관리코드', width: '120px', visible: true },
  manage_name: { label: '관리상품명', width: '250px', visible: true },
  print_name: { label: '인쇄상품명', width: '250px', visible: true },
  memo: { label: '메모', width: '250px', visible: true },
  quantity: { label: '재고', width: '80px', type: 'number', visible: true },
  safety_quantity: { label: '안전재고', width: '80px', type: 'number', visible: true },
  supplier: { label: '사입처', width: '120px', visible: false },
  purchase_price: { label: '사입단가', width: '100px', type: 'number', visible: true },
  consumer_price: { label: '소비자가', width: '100px', type: 'number', visible: true },
  location: { label: '위치', width: '120px', visible: true },
  barcode: { label: '바코드', width: '120px', visible: false },
  barcode_format: { label: '바코드포멧', width: '100px', visible: false },
  weight: { label: '무게', width: '80px', visible: false },
  freight_amount: { label: '운임금액', width: '100px', visible: false },
  spec: { label: '규격', width: '100px', visible: false },
  serial_number: { label: '일련번호', width: '100px', type: 'number', visible: false },
  image_url: { label: '이미지URL', width: '150px', visible: false },
  is_hidden: { label: '숨김여부', width: '80px', visible: false },
  updated_at: { label: '수정일시', width: '150px', visible: false }
};

const columnVisibility = ref(Object.keys(defaultCols).reduce((acc, key) => {
  acc[key] = { visible: defaultCols[key].visible };
  return acc;
}, {}));

const columnOrder = ref(Object.keys(defaultCols));
const draggingColIdx = ref(null);

const onColDragStart = (idx) => {
  draggingColIdx.value = idx;
};

const onColDrop = (idx) => {
  if (draggingColIdx.value === null) return;
  const item = columnOrder.value.splice(draggingColIdx.value, 1)[0];
  columnOrder.value.splice(idx, 0, item);
  draggingColIdx.value = null;
  localStorage.setItem('columnOrder', JSON.stringify(columnOrder.value));
};

const visibleColsKeys = computed(() => {
  return columnOrder.value.filter(k => columnVisibility.value[k].visible);
});

const visibleColCount = computed(() => visibleColsKeys.value.length);

// ─── Column Resize ───────────────────────────────────────────────────────────
const DEFAULT_COL_WIDTHS = Object.fromEntries(
  Object.entries(defaultCols).map(([k, v]) => [k, parseInt(v.width) || 120])
);
const colWidths = ref({ ...DEFAULT_COL_WIDTHS });

let resizingKey = null;
let resizeStartX = 0;
let resizeStartW = 0;

function startColResize(event, key) {
  resizingKey = key;
  resizeStartX = event.clientX;
  resizeStartW = colWidths.value[key];
  document.addEventListener('mousemove', onColResizeMove);
  document.addEventListener('mouseup', stopColResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onColResizeMove(event) {
  if (!resizingKey) return;
  const delta = event.clientX - resizeStartX;
  colWidths.value[resizingKey] = Math.max(40, resizeStartW + delta);
}

function stopColResize() {
  resizingKey = null;
  document.removeEventListener('mousemove', onColResizeMove);
  document.removeEventListener('mouseup', stopColResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  // Persist widths
  localStorage.setItem('colWidths', JSON.stringify(colWidths.value));
}

// ─── Modified IDs Tracking (localStorage) ────────────────────────────────────
const MODIFIED_KEY = 'modifiedProductIds';
const modifiedIds = ref(new Set(
  JSON.parse(localStorage.getItem(MODIFIED_KEY) || '[]')
));

function markModified(id) {
  modifiedIds.value.add(id);
  localStorage.setItem(MODIFIED_KEY, JSON.stringify([...modifiedIds.value]));
}

function clearModified() {
  modifiedIds.value.clear();
  localStorage.removeItem(MODIFIED_KEY);
}

// ─── Excel Download Modal ─────────────────────────────────────────────────────
const showDownloadModal = ref(false);
const downloadMode = ref('all'); // 'all' | 'modified'
const downloadCols = ref(
  Object.fromEntries(Object.keys(defaultCols).map(k => [
    k, k === 'serial_number' || k === 'manage_name'
  ]))
);

function openDownloadModal() {
  showDownloadModal.value = true;
  if (modifiedIds.value.size === 0) downloadMode.value = 'all';
}

async function doDownloadExcel() {
  showDownloadModal.value = false;

  // Collect selected columns
  const selectedKeys = Object.keys(downloadCols.value).filter(k => downloadCols.value[k]);
  if (selectedKeys.length === 0) { addToast('최소 1개 컬럼을 선택하세요.'); return; }

  addToast('데이터 조회 중...');

  let products = [];
  if (downloadMode.value === 'modified' && modifiedIds.value.size > 0) {
    const ids = [...modifiedIds.value];
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .in('id', ids)
      .eq('is_deleted', false)
      .order('manage_code', { ascending: true });
    if (error) { addToast('조회 실패: ' + error.message); return; }
    products = data;
  } else {
    // Download all from ALL tabs (full DB)
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_deleted', false)
      .order('manage_code', { ascending: true });
    if (error) { addToast('조회 실패: ' + error.message); return; }
    products = data;
  }

  if (products.length === 0) { addToast('다운로드할 데이터가 없습니다.'); return; }

  // Build CSV
  const headers = selectedKeys.map(k => defaultCols[k].label);
  const rows = products.map(p =>
    selectedKeys.map(k => {
      const val = p[k];
      if (val === null || val === undefined) return '';
      if (k === 'is_hidden') return val ? '숨김' : '노출';
      if (k === 'updated_at') return formatDate(val);
      return String(val).replace(/"/g, '""');
    }).map(v => `"${v}"`).join(',')
  );
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  a.href = url;
  a.download = `상품DB_${downloadMode.value === 'modified' ? '수정항목' : '전체'}_${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  addToast(`다운로드 완료 (${products.length}개)`);
}

onMounted(() => {
  selectTab('🔍 검색');

  const savedVis = localStorage.getItem('columnVisibility');
  if (savedVis) {
    try {
      const parsed = JSON.parse(savedVis);
      for (const key in columnVisibility.value) {
        if (parsed[key] !== undefined && parsed[key].visible !== undefined) {
          columnVisibility.value[key].visible = parsed[key].visible;
        }
      }
    } catch {}
  }

  const savedOrder = localStorage.getItem('columnOrder');
  if (savedOrder) {
    try {
      const parsed = JSON.parse(savedOrder);
      // Validate in case defaultCols changed
      const validKeys = Object.keys(defaultCols);
      const filtered = parsed.filter(k => validKeys.includes(k));
      const missing = validKeys.filter(k => !filtered.includes(k));
      columnOrder.value = [...filtered, ...missing];
    } catch {}
  }

  const savedWidths = localStorage.getItem('colWidths');
  if (savedWidths) {
    try {
      const parsed = JSON.parse(savedWidths);
      for (const key in colWidths.value) {
        if (parsed[key] !== undefined) colWidths.value[key] = parsed[key];
      }
    } catch {}
  }
  
  window.addEventListener('mouseup', () => { isDragging.value = false; });
  document.addEventListener('keydown', handleGlobalKeydown);
  document.addEventListener('paste', handleGlobalPaste);
});

watch(columnVisibility, (newVal) => {
  localStorage.setItem('columnVisibility', JSON.stringify(newVal));
}, { deep: true });

function allTabs() {
  const tabs = ['🔍 검색'];
  for (let i = 65; i <= 90; i++) {
    tabs.push(String.fromCharCode(i));
  }
  tabs.push('#');
  return tabs;
}

const searchQuery = ref('');

async function loadTab(tab, forceSearch = false) {
  if (tab === '🔍 검색' && !forceSearch) {
    if (!tabProducts.value[tab]) tabProducts.value[tab] = [];
    return;
  }
  if (!forceSearch && (tabProducts.value[tab] || loadingTabs.value.has(tab))) return;
  loadingTabs.value.add(tab);
  
  selStart.value = null; // reset selection
  selEnd.value = null;

  try {
    let query = supabase
      .from("products")
      .select("*")
      .eq('is_deleted', false)
      .order('manage_code', { ascending: true });
      
    if (tab === '🔍 검색') {
      const term = `%${searchQuery.value.trim()}%`;
      query = query.or(`manage_code.ilike.${term},manage_name.ilike.${term}`);
    } else if (tab === '#') {
       query = query.or('manage_code.is.null,manage_code.eq.,manage_code.like.0%,manage_code.like.1%,manage_code.like.2%,manage_code.like.3%,manage_code.like.4%,manage_code.like.5%,manage_code.like.6%,manage_code.like.7%,manage_code.like.8%,manage_code.like.9%,manage_code.like.[%,manage_code.like.(%,manage_code.like.-%');
    } else {
       query = query.ilike('manage_code', `${tab}%`);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    tabProducts.value[tab] = data;
  } finally {
    loadingTabs.value.delete(tab);
  }
}

const groupedProducts = computed(() => {
  const products = tabProducts.value[activeTab.value] || [];
  const groupsMap = new Map();
  const pastelColors = ['#ffebeb', '#fff3e6', '#fffae6', '#ecfced', '#e6f7ff', '#f0f0ff', '#f9f0ff'];
  let colorIdx = 0;

  products.forEach((product, idx) => {
    const code = (product.manage_code || '').trim();
    let prefix = code.split('-')[0];
    
    if (!prefix) {
      prefix = `empty-${product.id || idx}`;
    }

    if (!groupsMap.has(prefix)) {
      let baseName = product.manage_name || '';
      baseName = baseName.replace(/\[.*?\]\s*/, '').split(':')[0].trim();
      const color = pastelColors[colorIdx % pastelColors.length];
      colorIdx++;

      const newGroup = {
        isGroup: true,
        id: `group-${prefix}`,
        prefix: prefix.startsWith('empty-') ? '' : prefix,
        name: baseName,
        items: [],
        color: color
      };
      groupsMap.set(prefix, newGroup);
    }
    groupsMap.get(prefix).items.push(product);
  });

  const result = [];

  if (!isGroupView.value) {
    products.forEach((product, idx) => {
      const code = (product.manage_code || '').trim();
      let prefix = code.split('-')[0];
      if (!prefix) {
        prefix = `empty-${product.id || idx}`;
      }
      const color = groupsMap.get(prefix).color;
      result.push({ isItem: true, product: product, color: color });
    });
    return result;
  }

  groupsMap.forEach(group => {
    if (group.items.length === 1) {
      result.push({ isItem: true, product: group.items[0], color: group.color });
    } else {
      result.push(group);
    }
  });

  return result;
});

function getShortName(fullName) {
  if (!fullName) return '';
  const parts = fullName.split(':');
  return parts.length > 1 ? parts[1].trim() : fullName;
}

// Render Rows maps the nested view to a flat iteration to track row index 'rIdx'
const renderRows = computed(() => {
  const result = [];
  let rIdx = 0;
  groupedProducts.value.forEach(node => {
     if (node.isGroup) {
       result.push({ isGroupRow: true, node });
       if (expandedGroups.value.has(node.prefix)) {
         node.items.forEach((product, idxInGroup) => {
            result.push({ isItemRow: true, product, color: node.color, idxInGroup, rIdx });
            rIdx++;
         });
       }
     } else {
       result.push({ isItemRow: true, product: node.product, color: node.color, rIdx });
       rIdx++;
     }
  });
  return result;
});

// Grid rows contains ONLY the flat item products currently visible, matched to 'rIdx'
const itemsOnlyGrid = computed(() => renderRows.value.filter(r => r.isItemRow));

// Excel UI State
const selStart = ref(null);
const selEnd = ref(null);
const isDragging = ref(false);
const editingCell = ref(null);

function onMouseDown(r, c, event) {
  if (editingCell.value && editingCell.value.r === r && editingCell.value.c === c) return;
  if (editingCell.value) {
    editingCell.value = null; // blur active input
  }
  
  if (event.shiftKey && selStart.value) {
    selEnd.value = { r, c };
  } else {
    selStart.value = { r, c };
    selEnd.value = { r, c };
    isDragging.value = true;
  }
  
  // Clear text selection
  if (document.selection && document.selection.empty) {
    document.selection.empty();
  } else if (window.getSelection) {
    window.getSelection().removeAllRanges();
  }
}

function onMouseEnter(r, c) {
  if (isDragging.value) {
    selEnd.value = { r, c };
  }
}

function onDoubleClick(r, c) {
  editingCell.value = { r, c };
  nextTick(() => {
    const el = document.getElementById(`edit-${r}-${c}`);
    if (el) {
       el.focus();
       if (typeof el.select === 'function') el.select();
    }
  });
}

function isSelected(r, c) {
  if (!selStart.value || !selEnd.value) return false;
  const rMin = Math.min(selStart.value.r, selEnd.value.r);
  const rMax = Math.max(selStart.value.r, selEnd.value.r);
  const cMin = Math.min(selStart.value.c, selEnd.value.c);
  const cMax = Math.max(selStart.value.c, selEnd.value.c);
  return r >= rMin && r <= rMax && c >= cMin && c <= cMax;
}

function isEditing(r, c) {
  return editingCell.value && editingCell.value.r === r && editingCell.value.c === c;
}

// Global key handlers for Copy and Delete
function handleGlobalKeydown(e) {
  if (editingCell.value) return; // Native logic
  
  if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    undoLastAction();
    return;
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!selStart.value || !selEnd.value) return;
      
      const rMin = Math.min(selStart.value.r, selEnd.value.r);
      const rMax = Math.max(selStart.value.r, selEnd.value.r);
      const cMin = Math.min(selStart.value.c, selEnd.value.c);
      const cMax = Math.max(selStart.value.c, selEnd.value.c);
      
      const itemsOnly = itemsOnlyGrid.value;
      const promises = [];
      const batchChanges = [];
      let updateCount = 0;
      
      for (let r = rMin; r <= rMax; r++) {
         if (r >= itemsOnly.length) break;
         const product = itemsOnly[r].product;
         const updates = {};
         let changed = false;
         
         for (let c = cMin; c <= cMax; c++) {
            const key = visibleColsKeys.value[c];
            if (key === 'updated_at') continue;
            
            let emptyVal = '';
            if (defaultCols[key].type === 'number') {
               emptyVal = 0;
            } else if (key === 'is_hidden') {
               emptyVal = false;
            }
            
            if (product[key] !== emptyVal) {
               batchChanges.push({ id: product.id, field: key, oldValue: product[key] });
               product[key] = emptyVal;
               updates[key] = emptyVal;
               changed = true;
            }
         }
         
         if (changed) {
            updates.updated_at = new Date().toISOString();
            promises.push(supabase.from('products').update(updates).eq('id', product.id));
            updateCount++;
         }
      }
      
      if (updateCount > 0) {
         pushToUndo(batchChanges);
         addToast(`${updateCount}개 데이터 삭제 반영 중...`);
         Promise.all(promises).then(() => {
            addToast('삭제 반영 완료');
         });
      }
      return;
  }
  
  if (e.key.toLowerCase() === 'c' && (e.ctrlKey || e.metaKey)) {
      if (!selStart.value || !selEnd.value) return;
      
      const rMin = Math.min(selStart.value.r, selEnd.value.r);
      const rMax = Math.max(selStart.value.r, selEnd.value.r);
      const cMin = Math.min(selStart.value.c, selEnd.value.c);
      const cMax = Math.max(selStart.value.c, selEnd.value.c);
      
      let clipLines = [];
      const itemsOnly = itemsOnlyGrid.value;
      
      for (let r = rMin; r <= rMax; r++) {
        let line = [];
        const product = itemsOnly[r].product;
        for (let c = cMin; c <= cMax; c++) {
          const key = visibleColsKeys.value[c];
          line.push(product[key] === null || product[key] === undefined ? '' : product[key]);
        }
        clipLines.push(line.join('\t'));
      }
      navigator.clipboard.writeText(clipLines.join('\n')).then(() => {
        addToast('클립보드에 복사되었습니다.');
      });
  }
}

// Global paste handler
async function handleGlobalPaste(e) {
   if (editingCell.value) return; // Native paste inside input
   
   e.preventDefault();
   const text = (e.clipboardData || window.clipboardData).getData('text');
   if (!text) return;
   
   if (!selStart.value || !selEnd.value) return;
   const rMin = Math.min(selStart.value.r, selEnd.value.r);
   const cMin = Math.min(selStart.value.c, selEnd.value.c);
   
   const lines = text.split(/\r?\n/).map(row => row.split('\t'));
   const itemsOnly = itemsOnlyGrid.value;
   const promises = [];
   const batchChanges = [];
   let updateCount = 0;
   
   for (let i = 0; i < lines.length; i++) {
      const tr = rMin + i;
      if (tr >= itemsOnly.length) break;
      const product = itemsOnly[tr].product;
      const updates = {};
      let changed = false;
      
      for (let j = 0; j < lines[i].length; j++) {
         const tc = cMin + j;
         if (tc >= visibleColsKeys.value.length) break;
         const key = visibleColsKeys.value[tc];
         
         // Can't edit updated_at directly via paste
         if (key === 'updated_at') continue;
         
         let val = lines[i][j];
         
         if (defaultCols[key].type === 'number') {
           val = Number(val) || 0;
         } else if (key === 'is_hidden') {
           val = (val === 'true' || val === '숨김' || val === '1');
         }
         
         if (product[key] !== val) {
           batchChanges.push({ id: product.id, field: key, oldValue: product[key] });
           product[key] = val; // Optimistic logic
           updates[key] = val;
           changed = true;
         }
      }
      
      if (changed) {
        updates.updated_at = new Date().toISOString();
        promises.push(supabase.from('products').update(updates).eq('id', product.id));
        updateCount++;
      }
   }
   
   if (updateCount > 0) {
     pushToUndo(batchChanges);
     addToast(`${updateCount}개 데이터 반영 중...`);
     await Promise.all(promises);
     addToast('붙여넣기 반영 완료');
   }
}

function closeAndSave(product, key, newVal) {
  if (editingCell.value) {
    editingCell.value = null; // hide input immediately
  }
  
  if (String(product[key]) !== String(newVal)) {
    updateField(product.id, key, newVal);
  }
}

async function updateField(id, field, value) {
  // Get old value for undo
  let oldValue = null;
  const active = activeTab.value;
  if (active && tabProducts.value[active]) {
    const p = tabProducts.value[active].find(p => p.id === id);
    if (p) oldValue = p[field];
  }

  const updates = {
    [field]: value,
    updated_at: new Date().toISOString()
  };
   
  const { error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", id);
    
  if (error) {
    console.error("Error updating:", error);
    alert("수정 실패: " + error.message);
  } else {
    markModified(id);
    pushToUndo([{ id, field, oldValue }]);
    if (active && tabProducts.value[active]) {
      const idx = tabProducts.value[active].findIndex(p => p.id === id);
      if (idx !== -1) {
        tabProducts.value[active][idx] = { ...tabProducts.value[active][idx], ...updates };
      }
    }
    const fieldLabel = defaultCols[field]?.label || field;
    addToast(`"${fieldLabel}" 수정됨`);
  }
}

function toggleGroup(prefix) {
  if (expandedGroups.value.has(prefix)) {
    expandedGroups.value.delete(prefix);
  } else {
    expandedGroups.value.add(prefix);
  }
  expandedGroups.value = new Set(expandedGroups.value);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '-';
  }
}

async function addProduct() {
  const now = new Date().toISOString();
  const { data: insertedProduct, error } = await supabase.from("products").insert([{
    ...newProduct.value,
    manage_name: newProduct.value.manage_name || '제목 없음',
    registered_at: now,
    updated_at: now
  }]);
  if (error) {
    console.error("Error adding product:", error);
    alert("추가 실패: " + error.message);
    return;
  }
  const code = newProduct.value.manage_code;
  if (code) {
    const firstChar = code[0].toUpperCase();
    const tab = /[A-Z]/.test(firstChar) ? firstChar : '#';
    if (tabProducts.value[tab]) {
      tabProducts.value[tab].push(insertedProduct[0]);
      tabProducts.value[tab].sort((a, b) => {
        if (a.manage_code < b.manage_code) return -1;
        if (a.manage_code > b.manage_code) return 1;
        return 0;
      });
    }
  }
  newProduct.value = { manage_code: "", manage_name: "", quantity: 0, purchase_price: 0 };
  if (activeTab.value) {
    await loadTab(activeTab.value);
  }
}

function selectTab(tab) {
  activeTab.value = tab;
  loadTab(tab);
}
</script>

<style>
nav { margin-bottom: 20px; gap: 10px; display: flex; }
nav button { padding: 10px 20px; background: #1976d2; color: white; border: none; cursor: pointer; }

.header-container { display: flex; justify-content: space-between; align-items: center; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.group-toggle { display: flex; align-items: center; gap: 8px; font-weight: bold; cursor: pointer; background: #f0f0f0; padding: 8px 16px; border-radius: 20px; }
.group-toggle input { width: 18px; height: 18px; cursor: pointer; }

/* Excel Download Button */
.excel-download-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  background: linear-gradient(135deg, #217346, #2e9e5c);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(33,115,70,0.35);
  transition: filter 0.15s, box-shadow 0.15s;
}
.excel-download-btn:hover { filter: brightness(1.1); box-shadow: 0 4px 12px rgba(33,115,70,0.45); }
.modified-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ff5252;
  color: #fff;
  border-radius: 10px;
  font-size: 11px;
  font-weight: bold;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
}

/* Modal */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000;
}
.modal-box {
  background: #fff;
  border-radius: 12px;
  padding: 32px;
  min-width: 420px;
  max-width: 560px;
  width: 90%;
  box-shadow: 0 8px 40px rgba(0,0,0,0.2);
}
.modal-title { margin: 0 0 24px; font-size: 20px; color: #1a1a2e; }
.modal-section { margin-bottom: 20px; }
.modal-label { display: block; font-weight: 600; font-size: 13px; color: #555; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.radio-group { display: flex; gap: 20px; flex-wrap: wrap; }
.radio-group label { display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; }
.radio-group label.disabled { opacity: 0.45; cursor: not-allowed; }
.badge { display: inline-block; background: #e8f4ff; color: #1976d2; border-radius: 10px; padding: 1px 8px; font-size: 12px; font-weight: 600; margin-left: 4px; }
.col-check-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.col-check-item { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; padding: 6px 10px; border: 1px solid #e0e0e0; border-radius: 6px; transition: background 0.15s; }
.col-check-item:hover { background: #f0f4ff; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
.btn-cancel { padding: 9px 20px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer; font-size: 14px; }
.btn-cancel:hover { background: #f5f5f5; }
.btn-download { padding: 9px 24px; border: none; border-radius: 6px; background: linear-gradient(135deg, #217346, #2e9e5c); color: #fff; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn-download:hover { filter: brightness(1.1); }

.column-visibility-container { background: #fdfdfd; border: 1px solid #ddd; padding: 10px; border-radius: 8px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.vis-label { display:flex; align-items:center; gap:4px; font-size:13px; cursor:pointer; padding: 4px 8px; background: #eee; border-radius: 4px; }
.draggable-col { cursor: grab; border: 1px solid #ccc; }
.draggable-col:active { cursor: grabbing; }

.add-product { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 8px; }
.add-product input { margin-right: 10px; padding: 8px; }
.add-product h2 { margin-top: 0; }

.tab-navigation { display: flex; flex-wrap: wrap; gap: 5px; margin: 20px 0; }
.tab-navigation button { padding: 8px 12px; background: #e0e0e0; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; position: relative; }
.tab-navigation button.active { background: #1976d2; color: white; }
.tab-navigation button.loading { opacity: 0.7; cursor: wait; }
.tab-navigation button.loading .loading-dot { position: absolute; right: -8px; top: 50%; transform: translateY(-50%); font-size: 10px; color: #1976d2; animation: blink 1s infinite; }
@keyframes blink { 0%, 50% { opacity: 0; } 51%, 100% { opacity: 1; } }

.search-container { display: flex; gap: 10px; margin-bottom: 20px; background: #fdfdfd; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
.search-container input { flex: 1; padding: 10px; border-radius: 4px; border: 1px solid #ccc; font-size: 16px; }
.search-container button { padding: 10px 24px; background: #1976d2; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; }

.loading-message { text-align: center; padding: 40px; color: #666; font-style: italic; }

.table-wrapper { overflow-x: auto; border: 1px solid #ddd; max-height: 80vh; }

.product-table { border-collapse: collapse; white-space: nowrap; user-select: none; table-layout: fixed; }
.product-table th, .product-table td { border: 1px solid #ddd; text-align: left; padding: 0; overflow: hidden; }
.product-table th { background: #f5f5f5; font-weight: bold; padding: 0; }
.th-no { width: 50px; min-width: 50px; padding: 8px !important; }

/* Resizable Column Header */
.resizable-th {
  position: relative;
  padding: 0;
  overflow: visible;
}
.th-label {
  display: block;
  padding: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.col-resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 3;
  background: transparent;
  transition: background 0.15s;
}
.col-resize-handle:hover, .col-resize-handle:active {
  background: rgba(25, 118, 210, 0.35);
}

.padding-cell { display: block; padding: 8px; min-height: 18px;}
.text-muted { color: #666; }

.group-row { cursor: pointer; background: #eaeff5; }
.group-row td { border-top: 2px solid #ccc; border-bottom: 2px solid #ccc; padding: 8px; }
.group-row:hover { background: #dce4f0; }

.item-row { background: #ffffff; }

/* Single items outside groups */
.single-item-row td { border-top: 2px solid #bbb; border-bottom: 2px solid #bbb; }

/* Excel Cell interactions */
.excel-cell {
  position: relative;
  cursor: cell;
}
.cell-selected {
  outline: 2px solid #1976d2;
  outline-offset: -2px;
  background-color: rgba(25, 118, 210, 0.1);
}

.full-input {
  width: 100%;
  height: 100%;
  min-height: 34px;
  box-sizing: border-box;
  padding: 8px;
  border: none;
  background: transparent;
  outline: none;
  font-family: inherit;
  font-size: inherit;
}
.full-input:focus { background: #fff; box-shadow: inset 0 0 0 2px #1976d2; cursor: text; }
.expand-icon { font-size: 12px; color: #666; }

.toast-container { position: fixed; bottom: 30px; right: 30px; display: flex; flex-direction: column; gap: 10px; z-index: 9999; }
.toast { background: rgba(0, 0, 0, 0.85); color: #fff; padding: 12px 24px; border-radius: 6px; font-size: 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); animation: slideIn 0.2s ease-out, fadeOut 0.2s ease-in 1.8s forwards; }
@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes fadeOut { to { opacity: 0; } }
</style>