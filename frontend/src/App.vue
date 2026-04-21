<template>
  <div id="app">
    <nav>
      <button @click="currentView = 'list'">상품 목록</button>
      <button @click="currentView = 'upload'">엑셀 업로드</button>
    </nav>
    
    <ProductUpload v-if="currentView === 'upload'" />
    
    <div v-if="currentView === 'list'">
      <h1>재고 대시보드</h1>
      
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

      <!-- Products Table for Active Tab -->
      <table v-if="activeTab" class="product-table">
        <thead>
          <tr>
            <th style="width: 50px"></th>
            <th>관리코드</th>
            <th>관리상품명</th>
            <th>재고</th>
            <th>수정일시</th>
            <th style="width: 80px">관리</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="product in displayedProducts" :key="product.id">
            <!-- Main Row (always visible) -->
            <tr class="main-row" @click="toggleExpand(product.id)" :class="{ 'deleted-row': product.is_deleted }">
              <td style="text-align: center;">
                <span class="expand-icon">{{ expandedIds.has(product.id) ? '▼' : '▶' }}</span>
              </td>
              <td>{{ product.manage_code }}</td>
              <td>{{ product.manage_name }}</td>
              <td>
                <input 
                  type="number" 
                  :value="product.quantity" 
                  @input="updateField(product.id, 'quantity', $event.target.valueAsNumber)"
                  @click.stop
                  class="inline-input"
                />
              </td>
              <td>{{ formatDate(product.updated_at) }}</td>
              <td @click.stop>
              </td>
            </tr>
            <!-- Expanded Detail Row -->
            <tr v-if="expandedIds.has(product.id)" class="detail-row">
              <td colspan="6">
                <div class="detail-content">
                  <div class="detail-grid">
                    <div class="detail-field">
                      <label>일련번호</label>
                      <input 
                        type="number" 
                        :value="product.serial_number" 
                        @change="updateField(product.id, 'serial_number', $event.target.valueAsNumber)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>이미지URL</label>
                      <input 
                        type="text" 
                        :value="product.image_url" 
                        @change="updateField(product.id, 'image_url', $event.target.value)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>인쇄상품명</label>
                      <input 
                        type="text" 
                        :value="product.print_name" 
                        @change="updateField(product.id, 'print_name', $event.target.value)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>메모</label>
                      <input 
                        type="text" 
                        :value="product.memo" 
                        @change="updateField(product.id, 'memo', $event.target.value)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>사입처</label>
                      <input 
                        type="text" 
                        :value="product.supplier" 
                        @change="updateField(product.id, 'supplier', $event.target.value)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>사입단가</label>
                      <input 
                        type="number" 
                        :value="product.purchase_price" 
                        @change="updateField(product.id, 'purchase_price', $event.target.valueAsNumber)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>소비자가</label>
                      <input 
                        type="number" 
                        :value="product.consumer_price" 
                        @change="updateField(product.id, 'consumer_price', $event.target.valueAsNumber)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>위치</label>
                      <input 
                        type="text" 
                        :value="product.location" 
                        @change="updateField(product.id, 'location', $event.target.value)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>안전재고</label>
                      <input 
                        type="number" 
                        :value="product.safety_quantity" 
                        @change="updateField(product.id, 'safety_quantity', $event.target.valueAsNumber)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>바코드</label>
                      <input 
                        type="text" 
                        :value="product.barcode" 
                        @change="updateField(product.id, 'barcode', $event.target.value)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>바코드포멧</label>
                      <input 
                        type="text" 
                        :value="product.barcode_format" 
                        @change="updateField(product.id, 'barcode_format', $event.target.value)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>무게</label>
                      <input 
                        type="text" 
                        :value="product.weight" 
                        @change="updateField(product.id, 'weight', $event.target.value)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>운임금액</label>
                      <input 
                        type="text" 
                        :value="product.freight_amount" 
                        @change="updateField(product.id, 'freight_amount', $event.target.value)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>규격</label>
                      <input 
                        type="text" 
                        :value="product.spec" 
                        @change="updateField(product.id, 'spec', $event.target.value)"
                      />
                    </div>
                    <div class="detail-field">
                      <label>등록일시</label>
                      <input 
                        type="text" 
                        :value="formatDate(product.registered_at)" 
                        disabled
                      />
                    </div>
                    <div class="detail-field">
                      <label>숨김여부</label>
                      <select 
                        :value="product.is_hidden ? 'true' : 'false'" 
                        @change="updateField(product.id, 'is_hidden', $event.target.value === 'true')"
                      >
                        <option value="false">노출</option>
                        <option value="true">숨김</option>
                      </select>
                    </div>
                    <div class="detail-field delete-action">
                      <label>관리</label>
                      <button @click="deleteProduct(product.id)" class="delete-btn" title="삭제">
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <!-- Loading indicator when no tab active or loading -->
      <div v-else class="loading-message">
        탭을 선택하여 상품을 확인하세요
      </div>
    </div>


  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { supabase } from "./supabaseClient";
import ProductUpload from "./components/ProductUpload.vue";

const newProduct = ref({
  manage_code: "",
  manage_name: "",
  quantity: 0,
  purchase_price: 0,
});
const currentView = ref("list");
const expandedIds = ref(new Set());
// Tab caching: key = first letter (A-Z or #), value = array of products
const tabProducts = ref({});
const activeTab = ref(null);
const loadingTabs = ref(new Set());

// Tab keys: A-Z plus # for others
function allTabs() {
  const tabs = [];
  for (let i = 65; i <= 90; i++) { // A-Z
    tabs.push(String.fromCharCode(i));
  }
  tabs.push('#');
  return tabs;
}

// Load products for a given tab (first letter)
async function loadTab(tab) {
  // If already loaded or currently loading, skip
  if (tabProducts.value[tab] || loadingTabs.value.has(tab)) return;
  loadingTabs.value.add(tab);
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .ilike('manage_code', `${tab}%`)
      .eq('is_deleted', false)
      .order('manage_code', { ascending: false });
    if (error) throw error;
    tabProducts.value[tab] = data;
  } finally {
    loadingTabs.value.delete(tab);
  }
}

// Get products for active tab (empty array if none)
const displayedProducts = computed(() => {
  return tabProducts.value[activeTab.value] || [];
});

function toggleExpand(id) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id);
  } else {
    expandedIds.value.add(id);
  }
  // Trigger reactivity by creating a new Set
  expandedIds.value = new Set(expandedIds.value);
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
      // Insert and keep sorted descending by manage_code
      tabProducts.value[tab].push(insertedProduct[0]);
      tabProducts.value[tab].sort((a, b) => {
        if (a.manage_code < b.manage_code) return 1;
        if (a.manage_code > b.manage_code) return -1;
        return 0;
      });
    }
    // If tab not loaded yet, we could optionally load it, but for simplicity we ignore.
  }
  // Reset form
  newProduct.value = { manage_code: "", manage_name: "", quantity: 0, purchase_price: 0 };
  // Re-fetch active tab to reflect any server-side changes? Not needed as we added optimistically.
  // However, to ensure consistency we could reload the active tab:
  if (activeTab.value) {
    await loadTab(activeTab.value);
  }
}

async function deleteProduct(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  const { error } = await supabase
    .from("products")
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq("id", id);
    
  if (error) {
    console.error("Error deleting product:", error);
    alert("삭제 실패: " + error.message);
    return;
  }
  // Remove from active tab cache
  const active = activeTab.value;
  if (active && tabProducts.value[active]) {
    const idx = tabProducts.value[active].findIndex(p => p.id === id);
    if (idx !== -1) {
      tabProducts.value[active].splice(idx, 1);
    }
  }
}

function selectTab(tab) {
  activeTab.value = tab;
  loadTab(tab);
}

// No initial tab load; user must select a tab to see products
</script>

<style>
nav { margin-bottom: 20px; gap: 10px; display: flex; }
nav button { padding: 10px 20px; background: #1976d2; color: white; border: none; cursor: pointer; }
.add-product { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 8px; }
.add-product input { margin-right: 10px; padding: 8px; }
.add-product h2 { margin-top: 0; }

/* Tab Navigation */
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

/* Loading Message */
.loading-message {
  text-align: center;
  padding: 40px;
  color: #666;
  font-style: italic;
}

.product-table { width: 100%; border-collapse: collapse; }
.product-table th, .product-table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
.product-table th { background: #f5f5f5; font-weight: bold; }

.main-row { cursor: pointer; }
.main-row:hover { background: #f9f9f9; }
.expand-icon { font-size: 12px; color: #666; }

.detail-row { background: #fafafa; }
.detail-row td { padding: 0; }

.detail-content { padding: 15px; }

.detail-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
}

.detail-field { }
.detail-field label { 
  display: block; 
  font-size: 12px; 
  color: #666; 
  margin-bottom: 4px; 
}
.detail-field input, .detail-field select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}
.detail-field input:disabled { background: #eee; }

.inline-input {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.delete-btn {
  padding: 4px 10px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

@media (max-width: 1200px) {
  .detail-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 800px) {
  .detail-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>