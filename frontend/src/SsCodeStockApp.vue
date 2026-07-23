<template>
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
        <a href="ss_code_stock.html" class="nav-link active">
          <span class="icon">🏪</span>스마트스토어 재고변경
        </a>
      </nav>
    </div>
  </div>

  <div class="main-layout" :class="{ 'dimmed': showLeftMenu }">
    <header class="top-bar">
      <div class="left-actions">
        <button class="menu-btn hamburger-btn" @click="showLeftMenu = !showLeftMenu">
          <span class="icon">☰</span>
        </button>
        <h1 class="title">🏪 스마트스토어 재고변경</h1>
      </div>
      <div class="right-actions">
        <div class="search-box">
          <input
            type="text"
            v-model="searchQuery"
            placeholder="seller_code 입력 후 Enter..."
            @keyup.enter="searchProducts"
            class="clean-search-input"
          />
        </div>
      </div>
    </header>

    <div class="content-area">
      <div class="list-view">
        <div v-if="loading" class="table-container">
          <div class="table-wrapper" style="text-align: center; padding: 40px; color: var(--text-secondary);">
            <span class="spinner"></span> 검색 중...
          </div>
        </div>

        <div v-else-if="error" class="table-container">
          <div class="table-wrapper" style="text-align: center; padding: 40px; color: #FF4D4F;">
            {{ error }}
          </div>
        </div>

        <div v-else-if="products.length === 0 && searched" class="table-container">
          <div class="table-wrapper" style="text-align: center; padding: 40px; color: var(--text-secondary);">
            검색 결과가 없습니다.
          </div>
        </div>

        <div v-else-if="products.length > 0" class="table-container">
          <div class="table-wrapper">
            <table class="product-table">
              <thead>
                <tr>
                  <th>name</th>
                  <th>category</th>
                  <th style="text-align: center;">stock_quantity</th>
                  <th>status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="product in products" :key="product.id" class="premium-row">
                  <td>
                    <div class="padding-cell text-content">{{ product.name || '-' }}</div>
                  </td>
                  <td>
                    <div class="padding-cell">{{ product.category || '-' }}</div>
                  </td>
                  <td style="text-align: center;">
                    <div class="padding-cell font-mono">{{ product.stock_quantity ?? '-' }}</div>
                  </td>
                  <td>
                    <div class="padding-cell">{{ product.status || '-' }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="zero-stock-footer">
            <div class="footer-stat">
              <span class="stat-label">검색 결과:</span>
              <span class="stat-value">{{ products.length }}개</span>
            </div>
          </div>
        </div>

        <div v-else class="table-container">
          <div class="table-wrapper" style="text-align: center; padding: 60px; color: var(--text-secondary); font-size: 16px;">
            seller_code를 입력하고 Enter를 누르세요.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { supabase } from './supabaseClient'

const showLeftMenu = ref(false)
const searchQuery = ref('')
const products = ref([])
const loading = ref(false)
const error = ref('')
const searched = ref(false)

async function searchProducts() {
  const query = searchQuery.value.trim()
  if (!query) return

  loading.value = true
  error.value = ''
  searched.value = true

  try {
    const { data, error: err } = await supabase
      .from('smartstore_products')
      .select('*')
      .eq('seller_code', query)

    if (err) throw err
    products.value = data || []
  } catch (e) {
    error.value = '조회 실패: ' + e.message
    products.value = []
  } finally {
    loading.value = false
  }
}
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

.premium-row {
  transition: background-color 0.2s ease;
}
.premium-row:hover {
  background-color: #F8FAFC;
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
  color: var(--primary);
  font-size: 18px;
}

.font-mono {
  font-family: 'Consolas', 'Courier New', monospace;
}
</style>
