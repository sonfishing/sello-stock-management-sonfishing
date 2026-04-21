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
          <input type="checkbox" v-model="col.visible" /> {{ col.label }}
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

      <!-- Search Input (Only visible when Search tab is active) -->
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
        <table class="product-table">
          <thead>
            <tr>
              <th style="min-width: 50px; position: sticky; left: 0; z-index: 2; background: #f5f5f5;">No</th>
              <th v-if="columnVisibility.manage_code.visible" style="min-width: 120px">관리코드</th>
              <th v-if="columnVisibility.manage_name.visible" style="min-width: 250px">관리상품명</th>
              <th v-if="columnVisibility.print_name.visible" style="min-width: 250px">인쇄상품명</th>
              <th v-if="columnVisibility.memo.visible" style="min-width: 250px">메모</th>
              <th v-if="columnVisibility.quantity.visible" style="min-width: 80px">재고</th>
              <th v-if="columnVisibility.safety_quantity.visible" style="min-width: 80px">안전재고</th>
              <th v-if="columnVisibility.supplier.visible" style="min-width: 120px">사입처</th>
              <th v-if="columnVisibility.purchase_price.visible" style="min-width: 100px">사입단가</th>
              <th v-if="columnVisibility.consumer_price.visible" style="min-width: 100px">소비자가</th>
              <th v-if="columnVisibility.location.visible" style="min-width: 120px">위치</th>
              <th v-if="columnVisibility.barcode.visible" style="min-width: 120px">바코드</th>
              <th v-if="columnVisibility.barcode_format.visible" style="min-width: 100px">바코드포멧</th>
              <th v-if="columnVisibility.weight.visible" style="min-width: 80px">무게</th>
              <th v-if="columnVisibility.freight_amount.visible" style="min-width: 100px">운임금액</th>
              <th v-if="columnVisibility.spec.visible" style="min-width: 100px">규격</th>
              <th v-if="columnVisibility.serial_number.visible" style="min-width: 100px">일련번호</th>
              <th v-if="columnVisibility.image_url.visible" style="min-width: 150px">이미지URL</th>
              <th v-if="columnVisibility.is_hidden.visible" style="min-width: 80px">숨김여부</th>
              <th v-if="columnVisibility.updated_at.visible" style="min-width: 150px">수정일시</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="node in groupedProducts" :key="node.id || node.product?.id">
              <!-- Group Row -->
              <template v-if="node.isGroup">
                <tr class="group-row" @click="toggleGroup(node.prefix)" :style="{ backgroundColor: node.color }">
                  <td :style="{ backgroundColor: node.color, textAlign: 'center', position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid #ddd' }">
                    <span class="expand-icon">{{ expandedGroups.has(node.prefix) ? '▼' : '▶' }}</span>
                  </td>
                  <td v-if="columnVisibility.manage_code.visible"><strong>{{ node.prefix }}</strong></td>
                  <td :colspan="visibleColCount - (columnVisibility.manage_code.visible ? 1 : 0)"><strong>{{ node.name }}</strong></td>
                </tr>

                <!-- Items in Group -->
                <template v-if="expandedGroups.has(node.prefix)">
                  <tr v-for="(product, idx) in node.items" :key="product.id" class="item-row" :style="{ backgroundColor: node.color }">
                     <td :style="{ backgroundColor: node.color, textAlign: 'center', color: '#888', fontSize: '11px', position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid #ddd' }">
                      {{ idx + 1 }}
                    </td>
                    <td v-if="columnVisibility.manage_code.visible"><input class="full-input" :value="product.manage_code" @change="updateField(product.id, 'manage_code', $event.target.value)" /></td>
                    <td v-if="columnVisibility.manage_name.visible"><input class="full-input" :value="product.manage_name" @change="updateField(product.id, 'manage_name', $event.target.value)" /></td>
                    <td v-if="columnVisibility.print_name.visible"><input class="full-input" :value="product.print_name" @change="updateField(product.id, 'print_name', $event.target.value)" /></td>
                    <td v-if="columnVisibility.memo.visible"><input class="full-input" :value="product.memo" @change="updateField(product.id, 'memo', $event.target.value)" /></td>
                    <td v-if="columnVisibility.quantity.visible"><input class="full-input" type="number" :value="product.quantity" @change="updateField(product.id, 'quantity', $event.target.valueAsNumber)" /></td>
                    <td v-if="columnVisibility.safety_quantity.visible"><input class="full-input" type="number" :value="product.safety_quantity" @change="updateField(product.id, 'safety_quantity', $event.target.valueAsNumber)" /></td>
                    <td v-if="columnVisibility.supplier.visible"><input class="full-input" :value="product.supplier" @change="updateField(product.id, 'supplier', $event.target.value)" /></td>
                    <td v-if="columnVisibility.purchase_price.visible"><input class="full-input" type="number" :value="product.purchase_price" @change="updateField(product.id, 'purchase_price', $event.target.valueAsNumber)" /></td>
                    <td v-if="columnVisibility.consumer_price.visible"><input class="full-input" type="number" :value="product.consumer_price" @change="updateField(product.id, 'consumer_price', $event.target.valueAsNumber)" /></td>
                    <td v-if="columnVisibility.location.visible"><input class="full-input" :value="product.location" @change="updateField(product.id, 'location', $event.target.value)" /></td>
                    <td v-if="columnVisibility.barcode.visible"><input class="full-input" :value="product.barcode" @change="updateField(product.id, 'barcode', $event.target.value)" /></td>
                    <td v-if="columnVisibility.barcode_format.visible"><input class="full-input" :value="product.barcode_format" @change="updateField(product.id, 'barcode_format', $event.target.value)" /></td>
                    <td v-if="columnVisibility.weight.visible"><input class="full-input" :value="product.weight" @change="updateField(product.id, 'weight', $event.target.value)" /></td>
                    <td v-if="columnVisibility.freight_amount.visible"><input class="full-input" :value="product.freight_amount" @change="updateField(product.id, 'freight_amount', $event.target.value)" /></td>
                    <td v-if="columnVisibility.spec.visible"><input class="full-input" :value="product.spec" @change="updateField(product.id, 'spec', $event.target.value)" /></td>
                    <td v-if="columnVisibility.serial_number.visible"><input class="full-input" type="number" :value="product.serial_number" @change="updateField(product.id, 'serial_number', $event.target.valueAsNumber)" /></td>
                    <td v-if="columnVisibility.image_url.visible"><input class="full-input" :value="product.image_url" @change="updateField(product.id, 'image_url', $event.target.value)" /></td>
                    <td v-if="columnVisibility.is_hidden.visible">
                      <select class="full-input" :value="product.is_hidden ? 'true' : 'false'" @change="updateField(product.id, 'is_hidden', $event.target.value === 'true')">
                        <option value="false">노출</option>
                        <option value="true">숨김</option>
                      </select>
                    </td>
                    <td v-if="columnVisibility.updated_at.visible"><span class="padding-cell text-muted">{{ formatDate(product.updated_at) }}</span></td>
                  </tr>
                </template>
              </template>

              <!-- Flat Item Row -->
              <template v-else>
                <tr class="item-row" :key="node.product.id" :style="{ backgroundColor: node.color || '#fff' }">
                  <td :style="{ backgroundColor: node.color || '#fff', textAlign: 'center', color: '#888', fontSize: '11px', position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid #ddd' }">
                    -
                  </td>
                  <td v-if="columnVisibility.manage_code.visible"><input class="full-input" :value="node.product.manage_code" @change="updateField(node.product.id, 'manage_code', $event.target.value)" /></td>
                  <td v-if="columnVisibility.manage_name.visible"><input class="full-input" :value="node.product.manage_name" @change="updateField(node.product.id, 'manage_name', $event.target.value)" /></td>
                  <td v-if="columnVisibility.print_name.visible"><input class="full-input" :value="node.product.print_name" @change="updateField(node.product.id, 'print_name', $event.target.value)" /></td>
                  <td v-if="columnVisibility.memo.visible"><input class="full-input" :value="node.product.memo" @change="updateField(node.product.id, 'memo', $event.target.value)" /></td>
                  <td v-if="columnVisibility.quantity.visible"><input class="full-input" type="number" :value="node.product.quantity" @change="updateField(node.product.id, 'quantity', $event.target.valueAsNumber)" /></td>
                  <td v-if="columnVisibility.safety_quantity.visible"><input class="full-input" type="number" :value="node.product.safety_quantity" @change="updateField(node.product.id, 'safety_quantity', $event.target.valueAsNumber)" /></td>
                  <td v-if="columnVisibility.supplier.visible"><input class="full-input" :value="node.product.supplier" @change="updateField(node.product.id, 'supplier', $event.target.value)" /></td>
                  <td v-if="columnVisibility.purchase_price.visible"><input class="full-input" type="number" :value="node.product.purchase_price" @change="updateField(node.product.id, 'purchase_price', $event.target.valueAsNumber)" /></td>
                  <td v-if="columnVisibility.consumer_price.visible"><input class="full-input" type="number" :value="node.product.consumer_price" @change="updateField(node.product.id, 'consumer_price', $event.target.valueAsNumber)" /></td>
                  <td v-if="columnVisibility.location.visible"><input class="full-input" :value="node.product.location" @change="updateField(node.product.id, 'location', $event.target.value)" /></td>
                  <td v-if="columnVisibility.barcode.visible"><input class="full-input" :value="node.product.barcode" @change="updateField(node.product.id, 'barcode', $event.target.value)" /></td>
                  <td v-if="columnVisibility.barcode_format.visible"><input class="full-input" :value="node.product.barcode_format" @change="updateField(node.product.id, 'barcode_format', $event.target.value)" /></td>
                  <td v-if="columnVisibility.weight.visible"><input class="full-input" :value="node.product.weight" @change="updateField(node.product.id, 'weight', $event.target.value)" /></td>
                  <td v-if="columnVisibility.freight_amount.visible"><input class="full-input" :value="node.product.freight_amount" @change="updateField(node.product.id, 'freight_amount', $event.target.value)" /></td>
                  <td v-if="columnVisibility.spec.visible"><input class="full-input" :value="node.product.spec" @change="updateField(node.product.id, 'spec', $event.target.value)" /></td>
                  <td v-if="columnVisibility.serial_number.visible"><input class="full-input" type="number" :value="node.product.serial_number" @change="updateField(node.product.id, 'serial_number', $event.target.valueAsNumber)" /></td>
                  <td v-if="columnVisibility.image_url.visible"><input class="full-input" :value="node.product.image_url" @change="updateField(node.product.id, 'image_url', $event.target.value)" /></td>
                  <td v-if="columnVisibility.is_hidden.visible">
                    <select class="full-input" :value="node.product.is_hidden ? 'true' : 'false'" @change="updateField(node.product.id, 'is_hidden', $event.target.value === 'true')">
                      <option value="false">노출</option>
                      <option value="true">숨김</option>
                    </select>
                  </td>
                  <td v-if="columnVisibility.updated_at.visible"><span class="padding-cell text-muted">{{ formatDate(node.product.updated_at) }}</span></td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Loading indicator when no tab active or loading -->
      <div v-else class="loading-message">
        탭을 선택하여 상품을 확인하세요
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { supabase } from "./supabaseClient";
import ProductUpload from "./components/ProductUpload.vue";

const newProduct = ref({
  manage_code: "",
  manage_name: "",
  quantity: 0,
  purchase_price: 0,
});
const currentView = ref("list");
const isGroupView = ref(true); // Switch for group view
const toastMessages = ref([]);

function addToast(message) {
  const id = Date.now() + Math.random();
  toastMessages.value.push({ id, text: message });
  setTimeout(() => {
    toastMessages.value = toastMessages.value.filter(t => t.id !== id);
  }, 2000);
}

const expandedGroups = ref(new Set()); // Group expansion state
const tabProducts = ref({}); // Tab caching
const activeTab = ref('🔍 검색');
const loadingTabs = ref(new Set());

// Columns Setup
const defaultCols = {
  manage_code: { label: '관리코드', visible: true },
  manage_name: { label: '관리상품명', visible: true },
  print_name: { label: '인쇄상품명', visible: true },
  memo: { label: '메모', visible: true },
  quantity: { label: '재고', visible: true },
  safety_quantity: { label: '안전재고', visible: true },
  supplier: { label: '사입처', visible: false },
  purchase_price: { label: '사입단가', visible: true },
  consumer_price: { label: '소비자가', visible: true },
  location: { label: '위치', visible: true },
  barcode: { label: '바코드', visible: false },
  barcode_format: { label: '바코드포멧', visible: false },
  weight: { label: '무게', visible: false },
  freight_amount: { label: '운임금액', visible: false },
  spec: { label: '규격', visible: false },
  serial_number: { label: '일련번호', visible: false },
  image_url: { label: '이미지URL', visible: false },
  is_hidden: { label: '숨김여부', visible: false },
  updated_at: { label: '수정일시', visible: false }
};

const columnVisibility = ref(defaultCols);

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
      // suppress warning
    }
  }
});

watch(columnVisibility, (newVal) => {
  localStorage.setItem('columnVisibility', JSON.stringify(newVal));
}, { deep: true });

const visibleColCount = computed(() => {
  return Object.values(columnVisibility.value).filter(c => c.visible).length;
});

// Tab keys: Search, A-Z plus # for others
function allTabs() {
  const tabs = ['🔍 검색'];
  for (let i = 65; i <= 90; i++) { // A-Z
    tabs.push(String.fromCharCode(i));
  }
  tabs.push('#');
  return tabs;
}

const searchQuery = ref('');

// Load products for a given tab (first letter)
async function loadTab(tab, forceSearch = false) {
  if (tab === '🔍 검색' && !forceSearch) {
    if (!tabProducts.value[tab]) tabProducts.value[tab] = [];
    return;
  }

  if (!forceSearch && (tabProducts.value[tab] || loadingTabs.value.has(tab))) return;
  loadingTabs.value.add(tab);
  try {
    let query = supabase
      .from("products")
      .select("*")
      .eq('is_deleted', false)
      .order('manage_code', { ascending: true }); // Ascending order
      
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

// Get grouped/flat products for active tab
const groupedProducts = computed(() => {
  const products = tabProducts.value[activeTab.value] || [];
  
  const groupsMap = new Map();
  const pastelColors = ['#ffebeb', '#fff3e6', '#fffae6', '#ecfced', '#e6f7ff', '#f0f0ff', '#f9f0ff'];
  let colorIdx = 0;

  products.forEach((product, idx) => {
    const code = (product.manage_code || '').trim();
    let prefix = code.split('-')[0];
    
    // For empty codes, generate a unique prefix so they are treated individually
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
    // Flat list mode with colors
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
    // Single items are not grouped
    if (group.items.length === 1) {
      result.push({ isItem: true, product: group.items[0], color: group.color });
    } else {
      result.push(group);
    }
  });

  return result;
});

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
    // Update local cache if product is in active tab
    const active = activeTab.value;
    if (active && tabProducts.value[active]) {
      const idx = tabProducts.value[active].findIndex(p => p.id === id);
      if (idx !== -1) {
        tabProducts.value[active][idx] = { ...tabProducts.value[active][idx], ...updates };
      }
    }
    const fieldLabel = defaultCols[field]?.label || field;
    addToast(`"${fieldLabel}" 항목이 수정되었습니다.`);
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
  // Add to appropriate tab cache if loaded
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

.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.group-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  cursor: pointer;
  background: #f0f0f0;
  padding: 8px 16px;
  border-radius: 20px;
}
.group-toggle input {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.column-visibility-container {
  background: #fdfdfd;
  border: 1px solid #ddd;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.vis-label {
  display:flex; 
  align-items:center; 
  gap:4px; 
  font-size:13px; 
  cursor:pointer;
}

.add-product { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 8px; }
.add-product input { margin-right: 10px; padding: 8px; }
.add-product h2 { margin-top: 0; }

.tab-navigation {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 20px 0;
}
.tab-navigation button {
  padding: 8px 12px;
  background: #e0e0e0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  position: relative;
}
.tab-navigation button.active {
  background: #1976d2;
  color: white;
}
.tab-navigation button.loading {
  opacity: 0.7;
  cursor: wait;
}
.tab-navigation button.loading .loading-dot {
  position: absolute;
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: #1976d2;
  animation: blink 1s infinite;
}
@keyframes blink {
  0%, 50% { opacity: 0; }
  51%, 100% { opacity: 1; }
}

.search-container {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  background: #fdfdfd;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
}
.search-container input {
  flex: 1;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #ccc;
  font-size: 16px;
}
.search-container button {
  padding: 10px 24px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
}

.loading-message {
  text-align: center;
  padding: 40px;
  color: #666;
  font-style: italic;
}

.table-wrapper {
  overflow-x: auto;
  border: 1px solid #ddd;
  max-height: 80vh;
}

.product-table { 
  border-collapse: collapse; 
  white-space: nowrap;
}
.product-table th, .product-table td { 
  border: 1px solid #ddd; 
  text-align: left; 
  padding: 0; /* Remove default padding for full width inputs */
}
.product-table th { 
  background: #f5f5f5; 
  font-weight: bold; 
  padding: 8px; /* Header gets padding */
}

/* Base class for cells that just show text */
.padding-cell {
  display: block;
  padding: 8px;
}
.text-muted {
  color: #666;
}

.group-row { cursor: pointer; background: #eaeff5; }
.group-row td { border-top: 2px solid #ccc; border-bottom: 2px solid #ccc; padding: 8px; } /* Override padding removal for group */
.group-row:hover { background: #dce4f0; }

.item-row { background: #ffffff; }
.item-row:focus-within { background: #fdfcee; }

/* The new full-width input style */
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

.full-input:hover {
  background: #f9f9f9;
}

.full-input:focus {
  background: #fff;
  box-shadow: inset 0 0 0 2px #1976d2;
}

.expand-icon { font-size: 12px; color: #666; }

.toast-container {
  position: fixed;
  bottom: 30px;
  right: 30px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 9999;
}
.toast {
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 14px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  animation: slideIn 0.2s ease-out, fadeOut 0.2s ease-in 1.8s forwards;
}

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes fadeOut {
  to { opacity: 0; }
}
</style>