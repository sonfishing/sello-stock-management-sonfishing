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
        <label class="group-toggle">
          <input type="checkbox" v-model="isGroupView" />
          <span>그룹으로 묶어보기</span>
        </label>
      </div>
      
      <!-- Field Visibility Checklist -->
      <div class="column-visibility-container">
        <strong>표시 항목: </strong>
        <label v-for="(col, key) in columnVisibility" :key="key" class="vis-label">
          <input type="checkbox" v-model="col.visible" /> {{ defaultCols[key].label }}
        </label>
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
              <th style="min-width: 50px; position: sticky; left: 0; z-index: 2; background: #f5f5f5;">No</th>
              <th v-for="key in visibleColsKeys" :key="key" :style="{ minWidth: defaultCols[key].width }">
                {{ defaultCols[key].label }}
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

const visibleColsKeys = computed(() => {
  return Object.keys(defaultCols).filter(k => columnVisibility.value[k].visible);
});

const visibleColCount = computed(() => visibleColsKeys.value.length);

onMounted(() => {
  selectTab('🔍 검색');

  const saved = localStorage.getItem('columnVisibility');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      for (const key in columnVisibility.value) {
        if (parsed[key] !== undefined && parsed[key].visible !== undefined) {
          columnVisibility.value[key].visible = parsed[key].visible;
        }
      }
    } catch {
      // suppress
    }
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
  
  if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!selStart.value || !selEnd.value) return;
      
      const rMin = Math.min(selStart.value.r, selEnd.value.r);
      const rMax = Math.max(selStart.value.r, selEnd.value.r);
      const cMin = Math.min(selStart.value.c, selEnd.value.c);
      const cMax = Math.max(selStart.value.c, selEnd.value.c);
      
      const itemsOnly = itemsOnlyGrid.value;
      const promises = [];
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
    const active = activeTab.value;
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
.group-toggle { display: flex; align-items: center; gap: 8px; font-weight: bold; cursor: pointer; background: #f0f0f0; padding: 8px 16px; border-radius: 20px; }
.group-toggle input { width: 18px; height: 18px; cursor: pointer; }

.column-visibility-container { background: #fdfdfd; border: 1px solid #ddd; padding: 10px; border-radius: 8px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.vis-label { display:flex; align-items:center; gap:4px; font-size:13px; cursor:pointer; }

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

.product-table { border-collapse: collapse; white-space: nowrap; user-select: none; }
.product-table th, .product-table td { border: 1px solid #ddd; text-align: left; padding: 0; }
.product-table th { background: #f5f5f5; font-weight: bold; padding: 8px; }

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