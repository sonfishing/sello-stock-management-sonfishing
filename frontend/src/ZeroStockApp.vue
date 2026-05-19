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
        <a href="0stock.html" class="nav-link active">
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

  <div class="main-layout" :class="{ 'dimmed': showLeftMenu }">
    <!-- Top Bar -->
    <header class="top-bar">
      <div class="left-actions">
        <button class="menu-btn hamburger-btn" @click="showLeftMenu = !showLeftMenu">
          <span class="icon">☰</span>
        </button>
        <h1 class="title">🚫 품절 확인 현황</h1>
      </div>
      <div class="right-actions">
        <!-- Search bar -->
        <div class="search-box">
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="상품명 또는 관리코드 검색..."
            @input="filterProducts"
            class="clean-search-input"
          />
        </div>
      </div>
    </header>

    <!-- Content Area -->
    <div class="content-area">
      <div class="list-view">
        <div class="table-container">
          <div class="table-wrapper">
            <table class="product-table">
              <thead>
                <tr>
                  <th style="width: 120px;">관리코드</th>
                  <th style="width: 250px;">관리상품명</th>
                  <th style="width: 120px;">일련번호</th>
                  <th style="width: 140px;">공급처</th>
                  <th style="width: 90px; text-align: center;">현재고</th>
                  <th style="width: 90px; text-align: center;">안전재고</th>
                  <th style="width: 120px;">위치</th>
                  <th style="width: 160px;">최근 수정일</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading" class="placeholder-row">
                  <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <span class="spinner"></span> 품절 상품 데이터를 불러오는 중...
                  </td>
                </tr>
                <tr v-else-if="filteredProducts.length === 0" class="placeholder-row">
                  <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    품절된 상품이 존재하지 않거나 검색 결과가 없습니다. 🎉
                  </td>
                </tr>
                <tr 
                  v-else 
                  v-for="product in filteredProducts" 
                  :key="product.id"
                  class="premium-row"
                >
                  <td>
                    <div class="padding-cell font-mono">{{ product.manage_code || '-' }}</div>
                  </td>
                  <td>
                    <div class="padding-cell text-content font-semibold">{{ product.manage_name }}</div>
                  </td>
                  <td>
                    <div class="padding-cell text-muted font-mono">{{ product.serial_number || '-' }}</div>
                  </td>
                  <td>
                    <div class="padding-cell">{{ product.supplier || '-' }}</div>
                  </td>
                  <td style="text-align: center;">
                    <div class="padding-cell">
                      <span class="badge-zero">품절 (0)</span>
                    </div>
                  </td>
                  <td style="text-align: center;">
                    <div class="padding-cell text-muted">{{ product.safety_quantity }}</div>
                  </td>
                  <td>
                    <div class="padding-cell">{{ product.location || '-' }}</div>
                  </td>
                  <td>
                    <div class="padding-cell text-muted">{{ formatDate(product.updated_at) }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        
        <!-- Summary Stats Footer -->
        <div class="zero-stock-footer">
          <div class="footer-stat">
            <span class="stat-label">🔴 총 품절 상품 수:</span>
            <span class="stat-value">{{ products.length }}개</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from './supabaseClient'

const showLeftMenu = ref(false)
const searchQuery = ref('')
const loading = ref(true)
const products = ref([])

async function fetchZeroStockProducts() {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_deleted', false)
      .eq('quantity', 0)
      .order('manage_code', { ascending: true })

    if (error) throw error
    
    // Alphanumeric natural sort
    if (data) {
      data.sort((a, b) => {
        const codeA = (a.manage_code || '').trim()
        const codeB = (b.manage_code || '').trim()
        return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' })
      })
      products.value = data
    }
  } catch (err) {
    console.error('Error fetching out-of-stock products:', err)
  } finally {
    loading.value = false
  }
}

const filteredProducts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return products.value
  
  return products.value.filter(p => {
    const name = (p.manage_name || '').toLowerCase()
    const code = (p.manage_code || '').toLowerCase()
    return name.includes(query) || code.includes(query)
  })
})

function formatDate(dateStr) {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr)
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '-'
  }
}

onMounted(() => {
  fetchZeroStockProducts()
})
</script>

<style scoped>
.clean-search-input {
  border: 1px solid var(--border-color);
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 14px;
  width: 250px;
  background: var(--surface);
  color: var(--text-primary);
  transition: all 0.2s ease;
  outline: none;
}
.clean-search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(27, 100, 218, 0.15);
}

.badge-zero {
  background: #FFEBEB;
  color: #FF4D4F;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  border: 1px solid #FFA39E;
  display: inline-block;
}

.premium-row {
  transition: background-color 0.2s ease;
}
.premium-row:hover {
  background-color: #F8FAFC;
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0,0,0,0.1);
  border-radius: 50%;
  border-top-color: var(--primary);
  animation: spin 1s ease-in-out infinite;
  margin-right: 8px;
  vertical-align: middle;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.zero-stock-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 16px 24px;
  background: var(--surface);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow);
  margin-top: 16px;
}
.footer-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}
.stat-label {
  font-weight: 600;
  color: var(--text-secondary);
}
.stat-value {
  font-weight: 700;
  color: #FF4D4F;
  font-size: 18px;
}

.font-semibold {
  font-weight: 600;
}
</style>
