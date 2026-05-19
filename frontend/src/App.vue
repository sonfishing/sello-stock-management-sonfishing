<template>
  <!-- Left Off-canvas Menu (Main Navigation) -->
  <div class="left-off-canvas-menu" :class="{ 'active': showLeftMenu }">
    <div class="left-menu-inner">
      <div class="left-menu-header">
        <h2>메뉴</h2>
        <button class="close-left-menu-btn" @click="showLeftMenu = false">&times;</button>
      </div>
      <nav class="left-nav-links">
        <a href="index.html" class="nav-link">
          <span class="icon">📦</span>재고
        </a>
        <a href="0stock.html" class="nav-link">
          <span class="icon">🚫</span>품절
        </a>
        <a href="getstock.html" class="nav-link">
          <span class="icon">📥</span>입고
        </a>
        <a href="outstock.html" class="nav-link">
          <span class="icon">📤</span>출고
        </a>
        <a href="todolist.html" class="nav-link">
          <span class="icon">📝</span>메모장
        </a>
      </nav>
    </div>
  </div>

  <!-- Top Off-canvas Menu (Settings/Columns) -->
  <div class="off-canvas-menu" :class="{ 'active': showOffCanvas }">
    <div class="menu-inner">
      <button class="close-menu-btn-top" @click="showOffCanvas = false">&times;</button>

      <div class="menu-section upload-section">
        <div class="button-row">
          <button class="menu-action-btn upload-btn-full" @click="showUploadModal = true; showOffCanvas = false;">
            <span class="icon">📤</span> 셀로 상품 엑셀 파일 업로드
          </button>
          <button class="menu-action-btn download-btn-side" @click="openDownloadModal(); showOffCanvas = false;">
            <span class="icon">📥</span> 다운로드
            <span v-if="modifiedIds.size > 0" class="modified-badge-inline">{{ modifiedIds.size }}</span>
          </button>
        </div>
      </div>

      <div class="menu-section columns-section" v-if="currentView === 'list'">
        <h3>📊 컬럼 표시 및 순서 (드래그)</h3>
        <div class="column-visibility-grid">
          <div 
            v-for="(key, index) in columnOrder" 
            :key="key" 
            class="vis-label draggable-col"
            :class="{ 
              active: columnVisibility[key].visible,
              'is-dragging': draggingColIdx === index 
            }"
            draggable="true"
            :data-index="index"
            @dragstart="onColDragStart(index)"
            @dragover.prevent
            @drop="onColDrop(index)"
            @click="toggleColVisibility(key)"
            @touchstart="onColTouchStart(index, $event)"
            @touchmove="onColTouchMove($event)"
            @touchend="onColTouchEnd($event)"
          >
            <span class="drag-handle">::</span> {{ defaultCols[key].label }}
          </div>
        </div>
      </div>
      
      
      <div class="menu-footer" style="display: none;">
        <button class="close-menu-btn" @click="showOffCanvas = false">닫기</button>
      </div>
    </div>
  </div>

  <!-- Add Product Off-canvas Menu (REMOVED) -->

  <div class="main-layout" :class="{ 'dimmed': showOffCanvas || showUploadModal || showSelloUploadModal || showDownloadModal || showLeftMenu }">
    <!-- Top Bar -->
    <header class="top-bar">
      <div class="left-actions">
        <button class="menu-btn hamburger-btn" @click="showLeftMenu = !showLeftMenu">
          <span class="icon">☰</span>
        </button>
        <button class="menu-btn" @click="showOffCanvas = !showOffCanvas">
          <span class="icon">⚙️</span><span class="btn-label"> 설정</span>
        </button>
        <button class="menu-btn" @click="showSelloUploadModal = true">
          <span class="icon">📦</span><span class="btn-label"> 재고업로드</span>
        </button>
        <button class="menu-btn sello-send-btn" @click="exportSelloStock">
          <span class="icon">📤</span>
          <span class="btn-label"> 셀로재고보내기</span>
          <span v-if="pendingSelloCount > 0" class="modified-badge sello-badge">{{ pendingSelloCount }}</span>
        </button>
        <label class="group-toggle">
          <input type="checkbox" v-model="isGroupView" />
          <span class="btn-label">그룹 보기</span>
        </label>
        <button class="menu-btn bulk-btn" :class="{ active: isBulkMode }" @click="toggleBulkMode">
          <span class="icon">📋</span><span class="btn-label"> 대량작업</span>
        </button>
        <button v-if="isBulkMode && selectedBulkIds.size > 0" class="menu-btn bulk-delete-btn" @click="deleteSelectedRows">
          <span class="icon">🗑️</span><span class="btn-label"> {{ selectedBulkIds.size }}개 삭제</span>
        </button>
      </div>
      <div></div>
      <div class="right-actions">
        <span v-if="modifiedIds.size > 0" class="status-badge modified">수정된 항목: {{ modifiedIds.size }}</span>
        <button class="menu-btn sidebar-toggle-btn" @click="showSidebar = !showSidebar">
          {{ showSidebar ? '◀' : '▶' }} 탭
        </button>
      </div>
    </header>

    <div class="workspace">
      <!-- Main Content Area -->
      <div class="content-area">
        <div class="list-view">
          <!-- Search Input Overlay -->
          <Transition name="slide-fade">
            <div v-if="activeTab === '🔍 검색'" class="floating-search">
              <input 
                v-model="searchQuery" 
                placeholder="검색어를 입력하고 Enter를 누르세요" 
                @keyup.enter="loadTab('🔍 검색', true)" 
                autofocus
              />
              <button @click="loadTab('🔍 검색', true)">검색</button>
            </div>
          </Transition>

          <!-- Table Wrapper -->
          <div class="table-container" v-if="activeTab">
            <div class="table-wrapper" @scroll="onTableScroll">
              <table class="product-table" @dragstart.prevent>
                <thead>
                  <tr>
                    <th style="z-index: 11;"></th>
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
                        @touchstart.stop.prevent="startColResize($event, key)"
                      ></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in renderRows" :key="row.isGroupRow ? row.node.id : row.product.id">
                    <!-- Group Row -->
                    <tr v-if="row.isGroupRow" class="group-row" @click="toggleGroup(row.node.prefix)" :style="{ backgroundColor: row.node.color }">
                      <td class="action-column" style="background: inherit; border-right: 1px solid var(--border-color);">
                        <span class="expand-icon">{{ expandedGroups.has(row.node.prefix) ? '▼' : '▶' }}</span>
                      </td>
                      <td v-for="(key, cIdx) in visibleColsKeys" :key="key" :style="{ backgroundColor: row.node.color }">
                        <template v-if="key === 'manage_code'">
                          <strong>{{ row.node.prefix }}</strong>
                        </template>
                        <template v-else-if="key === 'manage_name'">
                          <strong>{{ row.node.name }}</strong>
                        </template>
                      </td>
                    </tr>

                    <!-- Items / Flat Rows -->
                    <tr v-else class="item-row" 
                        :class="{ 
                          'single-item-row': !row.idxInGroup && row.idxInGroup !== 0,
                          'bulk-selected': selectedBulkIds.has(row.product.id),
                          'modified-row': modifiedIds.has(row.product.id) && !newEntriesIds.has(row.product.id)
                        }" 
                        :style="{ backgroundColor: row.color || '#fff' }"
                        @click="isBulkMode ? toggleBulkSelection(row.product.id) : null">
                      
                      <td class="excel-cell action-column" style="border-right: 1px solid var(--border-color); position: relative;">
                        <div class="cell-action-wrapper">
                          <button v-if="!isBulkMode" 
                                  class="add-row-btn" 
                                  @click.stop="quickAddRow(row.product)">
                            +
                          </button>
                          <span v-if="newEntriesIds.has(row.product.id)" class="new-badge">NEW</span>
                          <span v-else-if="modifiedIds.has(row.product.id)" class="update-badge">UPDATE</span>
                        </div>
                      </td>

                      <td v-for="(key, cIdx) in visibleColsKeys" :key="key"
                          @mousedown.stop="onMouseDown(row.rIdx, cIdx, $event)"
                          @mouseenter="onMouseEnter(row.rIdx, cIdx)"
                          @dblclick="onDoubleClick(row.rIdx, cIdx)"
                          :class="{ 
                            'cell-selected': isSelected(row.rIdx, cIdx),
                            'no-edit-cell': key === 'serial_number' || key === 'updated_at'
                          }"
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
                          <div class="padding-cell text-content" :class="{ 'image-cell': key === 'image_url' }">
                             <template v-if="key === 'is_hidden'">{{ row.product.is_hidden ? '숨김' : '노출' }}</template>
                             <template v-else-if="key === 'updated_at'">
                               <span class="text-muted">{{ formatDate(row.product.updated_at) }}</span>
                             </template>
                             <template v-else-if="key === 'manage_name' && row.idxInGroup !== undefined">
                               {{ getShortName(row.product.manage_name) }}
                             </template>
                             <template v-else-if="key === 'image_url'">
                               <img v-if="row.product.image_url" :src="row.product.image_url" style="max-height: 40px; max-width: 100%; object-fit: contain; border-radius: 4px; display: block;" alt="img" />
                               <span v-else class="text-muted">-</span>
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
          </div>
          <div v-else class="empty-state">
            탭을 선택하여 데이터를 확인하세요
          </div>
        </div>
      </div>

      <!-- Right Sidebar Tabs -->
      <aside v-if="showSidebar" class="sidebar-right">
        <div class="sidebar-scroll">
          <button 
            v-for="tab in allTabs()" 
            :key="tab"
            :class="{ 'active': activeTab === tab, 'loading': loadingTabs.has(tab) }"
            @click="selectTab(tab)"
            :disabled="loadingTabs.has(tab)"
          >
            <span class="tab-text">{{ tab }}</span>
            <span v-if="loadingTabs.has(tab)" class="loading-dot">●</span>
          </button>
        </div>
      </aside>
    </div>
  </div>
  <!-- Sello Stock Upload Modal -->
  <div v-if="showSelloUploadModal" class="modal-overlay" @click.self="showSelloUploadModal = false">
    <div class="modal-box" style="max-width: 1000px; max-height: 90vh; overflow: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 class="modal-title">📦 재고 수정 (엑셀 업로드)</h2>
        <button @click="showSelloUploadModal = false" style="background:none; border:none; font-size: 24px; cursor:pointer;">&times;</button>
      </div>
      <SelloStockUpload @onUploadSuccess="showSelloUploadModal = false; loadTab(activeTab, true); updatePendingSelloCount();" />
    </div>
  </div>

  <!-- Excel Upload Modal -->
  <div v-if="showUploadModal" class="modal-overlay" @click.self="showUploadModal = false">
    <div class="modal-box" style="max-width: 1000px; max-height: 90vh; overflow: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 class="modal-title">📤 엑셀 파일 업로드 (상품 등록/수정)</h2>
        <button @click="showUploadModal = false" style="background:none; border:none; font-size: 24px; cursor:pointer;">&times;</button>
      </div>
      <div class="upload-section">
        <ProductUpload @onUploadSuccess="showUploadModal = false; updatePendingSelloCount();" />
      </div>
    </div>
  </div>

  <!-- Excel Download Modal -->
  <div v-if="showDownloadModal" class="modal-overlay" @click.self="showDownloadModal = false">
    <div class="modal-box download-modal">
      <div class="modal-header-row">
        <h2 class="modal-title">📥 엑셀 다운로드</h2>
        <button class="modal-close-btn" @click="showDownloadModal = false">&times;</button>
      </div>

      <div class="modal-section">
        <label class="modal-label">다운로드 범위</label>
        <div class="dl-range-group">
          <button 
            class="dl-range-btn" 
            :class="{ active: downloadMode === 'all' }" 
            @click="downloadMode = 'all'"
          >📋 전체 (현재 탭)</button>
          <button 
            class="dl-range-btn" 
            :class="{ active: downloadMode === 'modified', disabled: modifiedIds.size === 0 }" 
            @click="modifiedIds.size > 0 && (downloadMode = 'modified')"
            :disabled="modifiedIds.size === 0"
          >✏️ 수정된 항목만 <span v-if="modifiedIds.size > 0" class="dl-badge">{{ modifiedIds.size }}</span></button>
        </div>
      </div>

      <div class="modal-section">
        <label class="modal-label">포함할 컬럼</label>
        <div class="dl-col-chips">
          <div 
            v-for="key in Object.keys(defaultCols)" 
            :key="key" 
            class="dl-col-chip"
            :class="{ active: downloadCols[key] }"
            @click="downloadCols[key] = !downloadCols[key]"
          >{{ defaultCols[key].label }}</div>
        </div>
      </div>

      <div class="modal-section" v-if="modifiedIds.size > 0">
        <button class="btn-clear-modified" @click="confirmClearModified">
          🗑️ 수정 내역 초기화 ({{ modifiedIds.size }}개)
        </button>
      </div>

      <div class="modal-actions">
        <button class="cancel-btn" @click="showDownloadModal = false">취소</button>
        <button class="submit-btn" @click="doDownloadExcel">📥 다운로드</button>
      </div>
    </div>
  </div>

</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { supabase } from "./supabaseClient";
import ProductUpload from "./components/ProductUpload.vue";
import SelloStockUpload from "./components/SelloStockUpload.vue";
import "./App.css";

const currentView = ref("list");
const isGroupView = ref(true);
const toastMessages = ref([]);
const showLeftMenu = ref(false);
const showOffCanvas = ref(false);
const showUploadModal = ref(false);
const showSelloUploadModal = ref(false);
const showDownloadModal = ref(false);
const showSidebar = ref(true);
const isBulkMode = ref(false);
const selectedBulkIds = ref(new Set());
const pendingSelloCount = ref(0);

async function updatePendingSelloCount() {
  const { count, error } = await supabase
    .from('sello_upload_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'PENDING');
  
  if (!error) {
    pendingSelloCount.value = count || 0;
  }
}

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
    const { id, field, oldValue, oldUpdatedAt } = change;
    const updates = { [field]: oldValue, updated_at: oldUpdatedAt || new Date().toISOString() };
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

  // 수정 항목 기록 해제 로직: 복구된 상품 중 더 이상 undo 스택에 남은 수정 사항이 없는 경우 mark 해제
  const affectedIds = [...new Set(lastChanges.map(c => c.id))];
  for (const id of affectedIds) {
    const isStillModified = undoStack.value.some(batch => batch.some(c => c.id === id));
    if (!isStillModified) {
      unmarkModified(id);
    }
  }
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
let touchMoved = false;

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

const onColTouchStart = (idx, event) => {
  draggingColIdx.value = idx;
  touchMoved = false;
};

const onColTouchMove = (event) => {
  if (draggingColIdx.value !== null) {
    touchMoved = true;
    if (event.cancelable) event.preventDefault();
  }
};

const onColTouchEnd = (event) => {
  if (draggingColIdx.value === null) return;
  
  if (touchMoved) {
    const touch = event.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const colEl = el?.closest('.draggable-col');
    if (colEl) {
      const targetIdx = parseInt(colEl.getAttribute('data-index'));
      if (!isNaN(targetIdx) && targetIdx !== draggingColIdx.value) {
        onColDrop(targetIdx);
      }
    }
  }
  
  draggingColIdx.value = null;
};

const toggleColVisibility = (key) => {
  if (touchMoved) return;
  columnVisibility.value[key].visible = !columnVisibility.value[key].visible;
};

const visibleColsKeys = computed(() => {
  return columnOrder.value.filter(k => columnVisibility.value[k].visible);
});

const visibleColCount = computed(() => visibleColsKeys.value.length);

// ─── Column Resize ───────────────────────────────────────────────────────────
const DEFAULT_COL_WIDTHS = Object.fromEntries(
  Object.entries(defaultCols).map(([k, v]) => [k, parseInt(v.width) || 120])
);
DEFAULT_COL_WIDTHS['No'] = 50;
const colWidths = ref({ ...DEFAULT_COL_WIDTHS });

let resizingKey = null;
let resizeStartX = 0;
let resizeStartW = 0;

function startColResize(event, key) {
  resizingKey = key;
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  resizeStartX = clientX;
  resizeStartW = colWidths.value[key];
  document.addEventListener('mousemove', onColResizeMove);
  document.addEventListener('mouseup', stopColResize);
  document.addEventListener('touchmove', onColResizeMove, { passive: false });
  document.addEventListener('touchend', stopColResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onColResizeMove(event) {
  if (!resizingKey) return;
  if (event.cancelable) event.preventDefault();
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const delta = clientX - resizeStartX;
  colWidths.value[resizingKey] = Math.max(40, resizeStartW + delta);
}

function stopColResize() {
  resizingKey = null;
  document.removeEventListener('mousemove', onColResizeMove);
  document.removeEventListener('mouseup', stopColResize);
  document.removeEventListener('touchmove', onColResizeMove);
  document.removeEventListener('touchend', stopColResize);
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
  modifiedIds.value = new Set(modifiedIds.value); // Trigger Vue reactivity
  localStorage.setItem(MODIFIED_KEY, JSON.stringify([...modifiedIds.value]));
}

function clearModified() {
  modifiedIds.value.clear();
  modifiedIds.value = new Set(); // Trigger Vue reactivity
  localStorage.removeItem(MODIFIED_KEY);
}

function unmarkModified(id) {
  modifiedIds.value.delete(id);
  modifiedIds.value = new Set(modifiedIds.value); // Trigger Vue reactivity
  localStorage.setItem(MODIFIED_KEY, JSON.stringify([...modifiedIds.value]));
}

// ─── New Session Entries Tracking (localStorage) ─────────────────────────────
const NEW_ENTRIES_KEY = 'newProductIds';
const newEntriesIds = ref(new Set(
  JSON.parse(localStorage.getItem(NEW_ENTRIES_KEY) || '[]')
));

function markAsNew(id) {
  newEntriesIds.value.add(id);
  newEntriesIds.value = new Set(newEntriesIds.value); // Trigger Vue reactivity
  localStorage.setItem(NEW_ENTRIES_KEY, JSON.stringify([...newEntriesIds.value]));
}

function unmarkNew(id) {
  newEntriesIds.value.delete(id);
  newEntriesIds.value = new Set(newEntriesIds.value); // Trigger Vue reactivity
  localStorage.setItem(NEW_ENTRIES_KEY, JSON.stringify([...newEntriesIds.value]));
}

function clearNewEntries() {
  newEntriesIds.value.clear();
  newEntriesIds.value = new Set(); // Trigger Vue reactivity
  localStorage.removeItem(NEW_ENTRIES_KEY);
}

// ─── Excel Download Modal ─────────────────────────────────────────────────────
const downloadMode = ref('all'); // 'all' | 'modified'
const DOWNLOAD_COLS_KEY = 'downloadCols';
const downloadCols = ref(
  JSON.parse(localStorage.getItem(DOWNLOAD_COLS_KEY)) || 
  Object.fromEntries(Object.keys(defaultCols).map(k => [
    k, k === 'serial_number' || k === 'manage_name'
  ]))
);

watch(downloadCols, (newVal) => {
  localStorage.setItem(DOWNLOAD_COLS_KEY, JSON.stringify(newVal));
}, { deep: true });

function openDownloadModal() {
  showDownloadModal.value = true;
  if (modifiedIds.value.size === 0) downloadMode.value = 'all';
}

function confirmClearModified() {
  if (confirm(`수정 내역 및 신규 상품 표시를 초기화하시겠습니까?`)) {
    clearModified();
    clearNewEntries();
    addToast('초기화되었습니다.');
    downloadMode.value = 'all';
  }
}

// Supabase 1000건 제한 우회를 위한 페이지네이션 헬퍼
async function fetchAllProducts(queryBuilder) {
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allData;
}

async function doDownloadExcel() {
  showDownloadModal.value = false;

  // Collect selected columns
  const selectedKeys = Object.keys(downloadCols.value).filter(k => downloadCols.value[k]);
  if (selectedKeys.length === 0) { addToast('최소 1개 컬럼을 선택하세요.'); return; }

  addToast('데이터 조회 중...');

  let products = [];
  try {
    if (downloadMode.value === 'modified' && modifiedIds.value.size > 0) {
      // 100% 안전하게 ID들을 숫자로 캐스팅하여 DB 타입 일치 처리 (Postgres bigint 대응)
      const ids = [...modifiedIds.value]
        .map(id => (typeof id === 'string' ? parseInt(id, 10) : id))
        .filter(id => !isNaN(id) && id !== null && id !== undefined);

      products = await fetchAllProducts((from, to) =>
        supabase
          .from('products')
          .select('*')
          .in('id', ids)
          .eq('is_deleted', false)
          .order('manage_code', { ascending: true })
          .range(from, to)
      );
    } else {
      // 현재 탭에 맞는 조건만 조회하도록 필터 적용 (현재 탭 다운로드 수정)
      const tab = activeTab.value;
      products = await fetchAllProducts((from, to) => {
        let query = supabase
          .from('products')
          .select('*')
          .eq('is_deleted', false)
          .order('manage_code', { ascending: true })
          .range(from, to);

        if (tab === '🔍 검색') {
          const term = `%${searchQuery.value.trim()}%`;
          query = query.or(`manage_code.ilike.${term},manage_name.ilike.${term}`);
        } else if (tab === '#') {
          query = query.or('manage_code.is.null,manage_code.eq.,manage_code.like.0%,manage_code.like.1%,manage_code.like.2%,manage_code.like.3%,manage_code.like.4%,manage_code.like.5%,manage_code.like.6%,manage_code.like.7%,manage_code.like.8%,manage_code.like.9%,manage_code.like.[%,manage_code.like.(%,manage_code.like.-%');
        } else if (tab) {
          query = query.ilike('manage_code', `${tab}%`);
        }
        return query;
      });
    }
  } catch (err) {
    addToast('조회 실패: ' + err.message);
    return;
  }

  if (products.length === 0) { addToast('다운로드할 데이터가 없습니다.'); return; }

  // 다운로드 전 자연 정렬 (Natural Sort)
  products.sort((a, b) => {
    const codeA = (a.manage_code || '').trim();
    const codeB = (b.manage_code || '').trim();
    return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Build CSV
  const headersRow = selectedKeys.map(k => `"${defaultCols[k].label.replace(/"/g, '""')}"`).join(',');
  const rows = products.map(p =>
    selectedKeys.map(k => {
      const val = p[k];
      if (val === null || val === undefined) return '';
      if (k === 'is_hidden') return val ? '숨김' : '노출';
      if (k === 'updated_at') return formatDate(val);
      return String(val).replace(/"/g, '""');
    }).map(v => `"${v}"`).join(',')
  );
  const csvContent = '\uFEFF' + [headersRow, ...rows].join('\n');

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

  if (modifiedIds.value.size > 0) {
    setTimeout(() => {
      if (confirm('수정한 항목 기록을 지울까요?')) {
        clearModified();
        clearNewEntries();
        addToast('기록이 삭제되었습니다.');
      }
    }, 500);
  }
}

async function exportSelloStock() {
  addToast('셀로 재고 데이터 조회 중...');
  
  // 1. Fetch PENDING items from sello_upload_queue
  const { data: queueItems, error: queueError } = await supabase
    .from('sello_upload_queue')
    .select('*')
    .eq('status', 'PENDING');

  if (queueError) {
    addToast('대기열 조회 실패: ' + queueError.message);
    return;
  }

  if (!queueItems || queueItems.length === 0) {
    addToast('보낼 재고 데이터가 없습니다.');
    return;
  }

  // 2. Fetch product names
  const serials = [...new Set(queueItems.map(item => item.serial_number))];
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('serial_number, manage_name')
    .in('serial_number', serials);

  if (prodError) {
    addToast('상품 정보 조회 실패: ' + prodError.message);
    return;
  }

  // 3. Fetch latest reasons from stock_adjustment_log
  const { data: logs, error: logError } = await supabase
    .from('stock_adjustment_log')
    .select('serial_number, reason, created_at')
    .in('serial_number', serials)
    .order('created_at', { ascending: false });

  // Map reasons: serial -> latest reason
  const reasonMap = {};
  if (logs) {
    logs.forEach(log => {
      if (!reasonMap[log.serial_number]) {
        reasonMap[log.serial_number] = log.reason;
      }
    });
  }

  const prodMap = {};
  if (products) {
    products.forEach(p => {
      prodMap[p.serial_number] = p.manage_name;
    });
  }

  // 4. Build CSV
  const headers = ['일련번호', '관리상품명', '재고증감값', '사유'];
  const headersRow = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');
  const rows = queueItems.map(item => {
    const name = prodMap[item.serial_number] || '';
    const reason = reasonMap[item.serial_number] || '';
    return [
      item.serial_number,
      name,
      item.delta_qty,
      reason
    ].map(v => `"${String(v !== null && v !== undefined ? v : '').replace(/"/g, '""')}"`).join(',');
  });

  const csvContent = '\uFEFF' + [headersRow, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  
  a.href = url;
  a.download = `셀로재고보내기_${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  addToast(`다운로드 완료 (${queueItems.length}개)`);
  
  if (confirm(`다운로드한 ${queueItems.length}개 항목을 '처리 완료'로 표시할까요?\n(대기열에서 제외됩니다)`)) {
    const ids = queueItems.map(item => item.id);
    const { error: updateError } = await supabase
      .from('sello_upload_queue')
      .update({ status: 'SUCCESS' })
      .in('id', ids);
    
    if (updateError) {
      addToast('상태 업데이트 실패: ' + updateError.message);
    } else {
      addToast('상태 업데이트 완료');
      updatePendingSelloCount();
    }
  }
}

async function quickAddRow(source) {
  // 관리코드 계산 로직 (숫자 자동 증가)
  let newManageCode = source.manage_code || '';
  const match = newManageCode.match(/(.+)-(\d+)$/);
  if (match) {
    const prefix = match[1];
    let num = parseInt(match[2], 10);
    const existingCodes = new Set();
    const currentTabProducts = tabProducts.value[activeTab.value] || [];
    currentTabProducts.forEach(p => {
      if (p.manage_code) existingCodes.add(p.manage_code);
    });
    
    while (true) {
      num++;
      const candidate = `${prefix}-${num}`;
      if (!existingCodes.has(candidate)) {
        newManageCode = candidate;
        break;
      }
    }
  } else {
    // -숫자 형태가 아니면 기본적으로 기존 로직 사용 ('-' 뒤의 값 제거)
    newManageCode = (source.manage_code || '').split('-')[0].trim();
  }

  // Extract base name (remove everything after ':', but keep ':')
  let baseName = (source.manage_name || '').split(':')[0].trim();
  if ((source.manage_name || '').includes(':')) {
    baseName += ':';
  }
  
  const newPrintName = `[${newManageCode}] ${baseName}`.trim();
  const newLocation = `[${newManageCode}]`;
  
  const newProduct = {
    manage_code: newManageCode,
    manage_name: baseName,
    purchase_price: source.purchase_price || 0,
    consumer_price: source.consumer_price || 0,
    quantity: 0,
    safety_quantity: source.safety_quantity || 0,
    location: newLocation,
    supplier: source.supplier || '',
    print_name: newPrintName,
    is_deleted: false
  };

  addToast('새 상품 등록 중...');

  const { data, error } = await supabase.from('products').insert([newProduct]).select();
  if (error) {
    addToast('추가 실패: ' + error.message);
    return;
  }
  
  const saved = data[0];
  markAsNew(saved.id);
  
  const tab = activeTab.value;
  if (tab && tabProducts.value[tab]) {
    const idx = tabProducts.value[tab].findIndex(p => p.id === source.id);
    if (idx !== -1) {
      tabProducts.value[tab].splice(idx + 1, 0, saved);
    } else {
      tabProducts.value[tab].push(saved);
    }
  }
  addToast('새 상품이 추가되었습니다.');
}

async function deleteRow(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  
  const { error } = await supabase
    .from('products')
    .update({ is_deleted: true })
    .eq('id', id);
    
  if (error) {
    addToast('삭제 실패: ' + error.message);
  } else {
    // Remove locally
    const tab = activeTab.value;
    if (tab && tabProducts.value[tab]) {
      tabProducts.value[tab] = tabProducts.value[tab].filter(p => p.id !== id);
    }
    selectedBulkIds.value.delete(id);
    unmarkNew(id);
    addToast('삭제되었습니다.');
  }
}

async function deleteSelectedRows() {
  const ids = [...selectedBulkIds.value];
  if (ids.length === 0) {
    addToast('선택된 상품이 없습니다.');
    return;
  }
  
  if (!confirm(`${ids.length}개의 상품을 삭제하시겠습니까?`)) return;
  
  addToast(`${ids.length}개 삭제 중...`);
  const { error } = await supabase
    .from('products')
    .update({ is_deleted: true })
    .in('id', ids);
    
  if (error) {
    addToast('삭제 실패: ' + error.message);
  } else {
    const tab = activeTab.value;
    if (tab && tabProducts.value[tab]) {
      tabProducts.value[tab] = tabProducts.value[tab].filter(p => !selectedBulkIds.value.has(p.id));
    }
    selectedBulkIds.value.clear();
    isBulkMode.value = false;
    addToast('선택한 상품들이 삭제되었습니다.');
  }
}

function toggleBulkMode() {
  isBulkMode.value = !isBulkMode.value;
  if (!isBulkMode.value) {
    selectedBulkIds.value.clear();
  }
}

function toggleBulkSelection(id) {
  if (selectedBulkIds.value.has(id)) {
    selectedBulkIds.value.delete(id);
  } else {
    selectedBulkIds.value.add(id);
  }
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
  
  updatePendingSelloCount();
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
const hasMoreData = ref({}); // 각 탭별로 추가로 불러올 데이터가 더 있는지 여부

// 테이블 스크롤 핸들러 (무한 스크롤)
function onTableScroll(e) {
  const el = e.target;
  // 바닥에서 100px 이내로 스크롤되면 다음 페이지 로딩
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
    const tab = activeTab.value;
    if (tab && !loadingTabs.value.has(tab) && hasMoreData.value[tab] !== false) {
      loadTab(tab, false, true);
    }
  }
}

async function loadTab(tab, forceSearch = false, loadMore = false) {
  if (tab === '🔍 검색' && !forceSearch) {
    if (!tabProducts.value[tab]) tabProducts.value[tab] = [];
    return;
  }
  
  // 이미 로딩 중이거나 더 이상 데이터가 없는 경우 차단
  if (!forceSearch && !loadMore && (tabProducts.value[tab] || loadingTabs.value.has(tab))) return;
  if (loadMore && (loadingTabs.value.has(tab) || hasMoreData.value[tab] === false)) return;
  
  loadingTabs.value.add(tab);
  
  if (!loadMore) {
    selStart.value = null; // 선택 영역 초기화
    selEnd.value = null;
  }

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
    
    const offset = loadMore ? (tabProducts.value[tab]?.length || 0) : 0;
    const limit = 1000;
    
    // Supabase 1000개 단위 페이징 쿼리 범위 적용
    query = query.range(offset, offset + limit - 1);
    
    const { data, error } = await query;
    if (error) throw error;
    
    // 불러온 데이터 수가 limit보다 적다면 마지막 데이터라고 간주
    if (!data || data.length < limit) {
      hasMoreData.value[tab] = false;
    } else {
      hasMoreData.value[tab] = true;
    }
    
    let combined = [];
    if (loadMore) {
      combined = [...(tabProducts.value[tab] || []), ...(data || [])];
    } else {
      combined = data || [];
    }
    
    // 자연 정렬 (Natural Sort): 알파벳과 숫자를 분리하여 숫자 크기대로 정렬 (1, 2, 10, 11...)
    combined.sort((a, b) => {
      const codeA = (a.manage_code || '').trim();
      const codeB = (b.manage_code || '').trim();
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    tabProducts.value[tab] = combined;
    
    if (loadMore && data && data.length > 0) {
      addToast(`추가 데이터 ${data.length}개 로드 완료`);
    }
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
  const key = visibleColsKeys.value[c];
  if (key === 'serial_number') {
    addToast('일련번호는 수동으로 수정할 수 없습니다. (엑셀 업로드 이용)');
    return;
  }
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
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  
  if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    undoLastAction();
    return;
  }

  // 엔터 키 입력 시 해당 셀 편집 모드로 전환 (엑셀 스타일 - 더블클릭 효과)
  if (e.key === 'Enter') {
    if (!selEnd.value) return;
    e.preventDefault();
    onDoubleClick(selEnd.value.r, selEnd.value.c);
    return;
  }

  // 화살표 방향키 이동 기능 (엑셀 스타일)
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    if (!selStart.value || !selEnd.value) return;
    
    e.preventDefault(); // 스크롤 방지
    
    const maxR = itemsOnlyGrid.value.length - 1;
    const maxC = visibleColsKeys.value.length - 1;
    
    let targetR = selEnd.value.r;
    let targetC = selEnd.value.c;
    
    if (e.key === 'ArrowUp') targetR = Math.max(0, targetR - 1);
    if (e.key === 'ArrowDown') targetR = Math.min(maxR, targetR + 1);
    if (e.key === 'ArrowLeft') targetC = Math.max(0, targetC - 1);
    if (e.key === 'ArrowRight') targetC = Math.min(maxC, targetC + 1);
    
    if (e.shiftKey) {
      selEnd.value = { r: targetR, c: targetC };
    } else {
      selStart.value = { r: targetR, c: targetC };
      selEnd.value = { r: targetR, c: targetC };
    }
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
               batchChanges.push({ 
                 id: product.id, 
                 field: key, 
                 oldValue: product[key],
                 oldUpdatedAt: product.updated_at 
               });
               product[key] = emptyVal;
               updates[key] = emptyVal;
               changed = true;
            }
         }
         
         if (changed) {
            updates.updated_at = new Date().toISOString();
            promises.push(supabase.from('products').update(updates).eq('id', product.id));
            updateCount++;
            
            // Only mark modified if non-quantity fields were changed
            const changedKeys = Object.keys(updates).filter(k => k !== 'updated_at');
            if (changedKeys.some(k => k !== 'quantity')) {
              markModified(product.id);
            }
         }
      }
      
      if (updateCount > 0) {
         pushToUndo(batchChanges);
         addToast(`${updateCount}개 데이터 삭제 반영 중...`);
         Promise.all(promises).then(() => {
            addToast('삭제 반영 완료');
            updatePendingSelloCount();
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
   if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
   if (editingCell.value) return; // Native paste inside input
   
   e.preventDefault();
   const text = (e.clipboardData || window.clipboardData).getData('text');
   if (!text) return;
   
   if (!selStart.value || !selEnd.value) return;
   const rMin = Math.min(selStart.value.r, selEnd.value.r);
   const rMax = Math.max(selStart.value.r, selEnd.value.r);
   const cMin = Math.min(selStart.value.c, selEnd.value.c);
   const cMax = Math.max(selStart.value.c, selEnd.value.c);
   
   let lines = text.split(/\r?\n/).map(row => row.split('\t'));
   // Excel이나 웹 클립보드 복사 시 끝에 생기는 개행 줄 제거 처리
   if (lines.length > 1 && lines[lines.length - 1].length === 1 && lines[lines.length - 1][0] === '') {
     lines.pop();
   }
   
   const itemsOnly = itemsOnlyGrid.value;
   const promises = [];
   const batchChanges = [];
   let updateCount = 0;
   
   // 단일 셀 값을 복사했는지 판정 (1x1 셀)
   const isSingleValue = (lines.length === 1 && lines[0].length === 1);
   
   if (isSingleValue) {
     const valToCopy = lines[0][0];
     
     // 선택한 드래그 범위 전체에 복사한 단일 값 복제 반영
     for (let tr = rMin; tr <= rMax; tr++) {
       if (tr >= itemsOnly.length) break;
       const product = itemsOnly[tr].product;
       const updates = {};
       let changed = false;
       
       for (let tc = cMin; tc <= cMax; tc++) {
         if (tc >= visibleColsKeys.value.length) break;
         const key = visibleColsKeys.value[tc];
         if (key === 'updated_at') continue;
         
         let val = valToCopy;
         if (defaultCols[key].type === 'number') {
           val = Number(val) || 0;
         } else if (key === 'is_hidden') {
           val = (val === 'true' || val === '숨김' || val === '1');
         }
         
         if (product[key] !== val) {
           batchChanges.push({ 
             id: product.id, 
             field: key, 
             oldValue: product[key],
             oldUpdatedAt: product.updated_at 
           });
           product[key] = val; // 화면 즉시(낙관적) 반영
           updates[key] = val;
           changed = true;
         }
       }
       
       if (changed) {
         updates.updated_at = new Date().toISOString();
         promises.push(supabase.from('products').update(updates).eq('id', product.id));
         updateCount++;
         
         const changedKeys = Object.keys(updates).filter(k => k !== 'updated_at');
         if (changedKeys.some(k => k !== 'quantity')) {
           markModified(product.id);
         }
       }
     }
   } else {
     // 여러 셀 데이터를 한 묶음으로 복사해온 경우 (기존 표준 매칭 붙여넣기)
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
           
           if (key === 'updated_at') continue;
           
           let val = lines[i][j];
           if (defaultCols[key].type === 'number') {
             val = Number(val) || 0;
           } else if (key === 'is_hidden') {
             val = (val === 'true' || val === '숨김' || val === '1');
           }
           
           if (product[key] !== val) {
             batchChanges.push({ 
               id: product.id, 
               field: key, 
               oldValue: product[key],
               oldUpdatedAt: product.updated_at 
             });
             product[key] = val;
             updates[key] = val;
             changed = true;
           }
        }
        
        if (changed) {
          updates.updated_at = new Date().toISOString();
          promises.push(supabase.from('products').update(updates).eq('id', product.id));
          updateCount++;
          
          const changedKeys = Object.keys(updates).filter(k => k !== 'updated_at');
          if (changedKeys.some(k => k !== 'quantity')) {
            markModified(product.id);
          }
        }
     }
   }
   
   if (updateCount > 0) {
     pushToUndo(batchChanges);
     addToast(`${updateCount}개 데이터 반영 중...`);
     await Promise.all(promises);
     addToast('붙여넣기 반영 완료');
     updatePendingSelloCount();
   }
}

function closeAndSave(product, key, newVal) {
  if (editingCell.value) {
    editingCell.value = null; // hide input immediately
  }
  
  // DB의 null/undefined 값을 빈 문자열로 간주하여 비교 오류 방지
  const oldVal = product[key];
  const oldStr = (oldVal === null || oldVal === undefined) ? "" : String(oldVal);
  const newStr = (newVal === null || newVal === undefined) ? "" : String(newVal);

  if (oldStr !== newStr) {
    updateField(product.id, key, newVal);
  }
}

async function updateField(id, field, value) {
  // Get old value for undo
  let oldValue = null;
  let oldUpdatedAt = null;
  let productCode = null;
  let productName = null;
  
  const active = activeTab.value;
  if (active && tabProducts.value[active]) {
    const p = tabProducts.value[active].find(p => p.id === id);
    if (p) {
      oldValue = p[field];
      oldUpdatedAt = p.updated_at;
      productCode = p.manage_code;
      productName = p.manage_name;
    }
  }

  const updates = {
    [field]: value,
    updated_at: new Date().toISOString()
  };

  // 상품명이나 관리코드를 수정하면 인쇄상품명과 위치 자동 업데이트
  if (field === 'manage_name' || field === 'manage_code') {
    const newCode = field === 'manage_code' ? value : productCode;
    const newName = field === 'manage_name' ? value : productName;
    
    const codeStr = newCode ? `[${newCode}] ` : '';
    updates.print_name = `${codeStr}${newName || ''}`.trim();
    updates.location = newCode ? `[${newCode}]` : '';
  }
   
  const { error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", id);
    
  if (error) {
    console.error("Error updating:", error);
    alert("수정 실패: " + error.message);
  } else {
    if (field !== 'quantity') {
      markModified(id);
    }
    pushToUndo([{ id, field, oldValue, oldUpdatedAt }]);
    if (active && tabProducts.value[active]) {
      const idx = tabProducts.value[active].findIndex(p => p.id === id);
      if (idx !== -1) {
        tabProducts.value[active][idx] = { ...tabProducts.value[active][idx], ...updates };
      }
    }
    const fieldLabel = defaultCols[field]?.label || field;
    addToast(`"${fieldLabel}" 수정됨`);
    
    // 재고 수량이 변경된 경우 셀로 대기열 카운트 업데이트
    if (field === 'quantity') {
      updatePendingSelloCount();
    }
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

function selectTab(tab) {
  activeTab.value = tab;
  loadTab(tab);
}
</script>