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
        <a href="cs_todolist.html" class="nav-link">
          <span class="icon">💬</span>CS 투두리스트
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
        <button class="menu-btn test-btn" @click="testRelay" :disabled="testingRelay">
          {{ testingRelay ? '조회 중...' : '📋 스마트스토어 상품 조회' }}
        </button>
        <button class="menu-btn sync-new-btn" @click="syncNewProducts" :disabled="syncingNew">
          {{ syncingNew ? '업데이트 중...' : '스마트스토어 최신 상품 업데이트' }}
        </button>
      </div>
      <div class="right-actions">
        <div class="search-box">
          <input
            type="text"
            v-model="searchQuery"
            placeholder="상품명, 옵션명, seller_code 검색..."
            @keyup.enter="searchProducts"
            class="clean-search-input"
          />
          <select v-model="filterStockStatus" class="filter-select">
            <option value="">재고상태(전체)</option>
            <option value="판매중">판매중</option>
            <option value="품절">품절</option>
          </select>
          <select v-model="filterDisplayStatus" class="filter-select">
            <option value="">진열상태(전체)</option>
            <option value="Y">Y</option>
            <option value="N">N</option>
            <option value="전시중">전시중</option>
            <option value="전시대기">전시대기</option>
            <option value="전시중지">전시중지</option>
          </select>
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
                  <th style="width: 22%;">상품명</th>
                  <th style="width: 18%;">옵션명</th>
                  <th style="width: 7%; text-align: center;">기본가</th>
                  <th style="width: 7%; text-align: center;">옵션가</th>
                  <th style="width: 9%;">분류</th>
                  <th style="width: 7%; text-align: center;">재고</th>
                  <th style="width: 8%;">상태</th>
                  <th style="width: 10%;">진열</th>
                  <th style="width: 8%;">스토어</th>
                  <th style="width: 6%;">관리</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="product in products" :key="product.id"
                    class="premium-row"
                    :class="{ 'row-modified': modifiedRows.has(product.id), 'row-completed': completedRows.has(product.id) }">
                  <td>
                    <div class="padding-cell text-content">{{ product.name || '-' }}</div>
                  </td>
                  <td>
                    <div class="padding-cell">{{ product.option_name || '-' }}</div>
                  </td>
                  <td style="text-align: center;">
                    <div class="padding-cell">{{ product.base_price?.toLocaleString() || '-' }}</div>
                  </td>
                  <td style="text-align: center;">
                    <div class="padding-cell">{{ product.additional_price?.toLocaleString() || '-' }}</div>
                  </td>
                  <td>
                    <div class="padding-cell">{{ product.category || '-' }}</div>
                  </td>
                  <td style="text-align: center;">
                    <div class="padding-cell">
                      <input
                        type="number"
                        class="qty-input"
                        :value="editQuantities[product.id] ?? product.stock_quantity ?? 0"
                        @input="onQtyInput(product.id, $event)"
                      />
                    </div>
                  </td>
                  <td>
                    <div class="padding-cell">{{ product.status || '-' }}</div>
                  </td>
                  <td>
                    <select
                      class="display-select"
                      :value="editDisplayStatuses[product.id] ?? product.display_status ?? ''"
                      @change="onDisplayStatusChange(product.id, $event)"
                    >
                      <template v-if="product.category === '원상품'">
                        <option value="전시중">전시중</option>
                        <option value="전시대기">전시대기</option>
                        <option value="전시중지">전시중지</option>
                      </template>
                      <template v-else>
                        <option value="Y">Y</option>
                        <option value="N">N</option>
                      </template>
                    </select>
                  </td>
                  <td>
                    <div class="padding-cell">{{ product.seller_code || '-' }}</div>
                  </td>
                  <td style="text-align: center;">
                    <button
                      class="update-btn"
                      :disabled="updating.has(product.id)"
                      @click="updateStock(product)"
                    >
                      {{ updating.has(product.id) ? '처리중...' : '수정' }}
                    </button>
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

  <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>
  <div v-if="testResult" class="test-result" :class="{ success: testResult.success, fail: !testResult.success }">
    <strong>연결 테스트</strong><br>
    {{ testResult.message }}
  </div>
  <div v-if="syncResult" class="test-result sync-result" :class="{ success: syncResult.success, fail: !syncResult.success }">
    <strong>스마트스토어 최신 상품 업데이트</strong><br>
    {{ syncResult.message }}
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { supabase } from './supabaseClient'

const showLeftMenu = ref(false)
const searchQuery = ref('')
const filterStockStatus = ref('')
const filterDisplayStatus = ref('')
const products = ref([])
const loading = ref(false)
const error = ref('')
const searched = ref(false)
const editQuantities = reactive({})
const editDisplayStatuses = reactive({})
const modifiedRows = ref(new Set())
const completedRows = ref(new Set())
const updating = ref(new Set())
const toastMessage = ref('')
const testingRelay = ref(false)
const testResult = ref(null)
const syncingNew = ref(false)
const syncResult = ref(null)

function showToast(msg) {
  toastMessage.value = msg
  setTimeout(() => { toastMessage.value = '' }, 3000)
}

function onQtyInput(id, event) {
  editQuantities[id] = parseInt(event.target.value, 10) || 0
  markModified(id)
}

function onDisplayStatusChange(id, event) {
  editDisplayStatuses[id] = event.target.value
  markModified(id)
}

function markModified(id) {
  const product = products.value.find(p => p.id === id)
  if (!product) return
  const qtyChanged = editQuantities[id] !== product.stock_quantity
  const displayChanged = editDisplayStatuses[id] !== product.display_status
  const s = new Set(modifiedRows.value)
  if (qtyChanged || displayChanged) {
    s.add(id)
  } else {
    s.delete(id)
  }
  modifiedRows.value = s
}

async function searchProducts() {
  const query = searchQuery.value.trim()
  const stockStatus = filterStockStatus.value
  const displayStatus = filterDisplayStatus.value

  if (!query && !stockStatus && !displayStatus) {
    showToast('하나 이상의 조건을 입력하세요.')
    return
  }

  loading.value = true
  error.value = ''
  searched.value = true

  try {
    let queryBuilder = supabase
      .from('smartstore_products')
      .select('*')

    if (query) {
      queryBuilder = queryBuilder.or(`name.ilike.%${query}%,option_name.ilike.%${query}%,seller_code.ilike.%${query}%`)
    }

    if (stockStatus) {
      queryBuilder = queryBuilder.eq('status', stockStatus)
    }

    if (displayStatus) {
      queryBuilder = queryBuilder.eq('display_status', displayStatus)
    }

    const { data, error: err } = await queryBuilder

    if (err) throw err
    products.value = data || []
    modifiedRows.value = new Set()
    completedRows.value = new Set()
    products.value.forEach(p => {
      editQuantities[p.id] = p.stock_quantity ?? 0
      editDisplayStatuses[p.id] = p.display_status ?? ''
    })
  } catch (e) {
    error.value = '조회 실패: ' + e.message
    products.value = []
  } finally {
    loading.value = false
  }
}

async function updateStock(product) {
  const newQty = editQuantities[product.id]
  const newDisplayStatus = editDisplayStatuses[product.id]
  const oldQty = product.stock_quantity
  const oldDisplayStatus = product.display_status

  const qtyChanged = newQty !== undefined && newQty !== product.stock_quantity
  const displayChanged = newDisplayStatus !== undefined && newDisplayStatus !== product.display_status

  if (!qtyChanged && !displayChanged) {
    showToast('변경된 내용이 없습니다.')
    return
  }

  const id = product.id
  updating.value = new Set([...updating.value, id])

  try {
    const updatePayload = {}
    if (qtyChanged) updatePayload.stock_quantity = newQty
    if (displayChanged) updatePayload.display_status = newDisplayStatus

    const { error: dbError } = await supabase
      .from('smartstore_products')
      .update(updatePayload)
      .eq('id', id)

    if (dbError) throw new Error('DB 업데이트 실패: ' + dbError.message)

    if (qtyChanged) {
      const res = await fetch('/api/update-smartstore-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, newStockQuantity: newQty })
      })

      const result = await res.json()

      if (!result.success) {
        await supabase.from('smartstore_products').update({ stock_quantity: oldQty, display_status: oldDisplayStatus }).eq('id', id)
        showToast('스마트스토어 업데이트 실패: ' + (result.message || '알 수 없는 오류'))
        return
      }

      const newStatus = newQty === 0 ? '품절' : '판매중'
      await supabase.from('smartstore_products').update({ status: newStatus }).eq('id', id)
    }

    const { data: refreshed } = await supabase
      .from('smartstore_products')
      .select('*')
      .eq('id', id)
      .single()

    if (refreshed) {
      const idx = products.value.findIndex(p => p.id === id)
      if (idx !== -1) products.value[idx] = refreshed
      editQuantities[id] = refreshed.stock_quantity ?? 0
      editDisplayStatuses[id] = refreshed.display_status ?? ''
    }
    const ms = new Set(modifiedRows.value)
    ms.delete(id)
    modifiedRows.value = ms
    const cs = new Set(completedRows.value)
    cs.add(id)
    completedRows.value = cs
    setTimeout(() => {
      const c = new Set(completedRows.value)
      c.delete(id)
      completedRows.value = c
    }, 2000)
    showToast('수정되었습니다.')
  } catch (e) {
    await supabase.from('smartstore_products').update({ stock_quantity: oldQty, display_status: oldDisplayStatus }).eq('id', id)
    showToast('오류: ' + e.message)
  } finally {
    const s = new Set(updating.value)
    s.delete(id)
    updating.value = s
  }
}

async function syncNewProducts() {
  syncingNew.value = true
  syncResult.value = null
  try {
    const res = await fetch('/api/sync-new-products', { method: 'POST' })
    const data = await res.json()

    if (data.success) {
      const output = data.output || ''
      const lines = output
        .split('\n')
        .map(s => s.trim())
        .filter(s =>
          s.includes('스토어 전체:') ||
          s.includes('완료!') ||
          s.includes('새로 추가된 상품이 없습니다') ||
          s.includes('product_list.txt 에') ||
          s.includes('조회 실패:')
        )
      let msg = lines.length > 0 ? lines.join('\n') : (data.message || '완료되었습니다.')
      if (!res.ok && data.error) {
        msg += '\n[오류] ' + data.error.split('\n')[0]
      }
      syncResult.value = { success: res.ok, message: msg }
    } else {
      syncResult.value = { success: false, message: '업데이트 실패: ' + (data.message || data.error || '알 수 없는 오류') }
    }
  } catch (e) {
    syncResult.value = { success: false, message: '요청 실패: ' + e.message }
  } finally {
    syncingNew.value = false
    setTimeout(() => { syncResult.value = null }, 15000)
  }
}

async function testRelay() {
  testingRelay.value = true
  testResult.value = null
  try {
    const res = await fetch('/api/test-relay')
    const data = await res.json()
    if (data.success) {
      const sample = data.data?.sample
      let msg = `✅ 스마트스토어 API 연결 성공 (응답시간: ${data.elapsed})`
      if (data.data?.totalCount !== undefined) {
        msg += `\n📦 전체 상품 수: ${data.data.totalCount}개`
      }
      if (sample?.name) {
        msg += `\n📌 샘플 상품: ${sample.name}`
      }
      testResult.value = { success: true, message: msg }
    } else {
      testResult.value = { success: false, message: `❌ API 조회 실패: ${data.message || data.data?.message}` }
    }
  } catch (e) {
    testResult.value = { success: false, message: `❌ 요청 실패: ${e.message}` }
  } finally {
    testingRelay.value = false
    setTimeout(() => { testResult.value = null }, 8000)
  }
}
</script>

<style scoped>
.search-box {
  display: flex;
  gap: 8px;
  align-items: center;
}

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

.filter-select {
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-size: 13px;
  background: var(--surface);
  color: var(--text-primary);
  outline: none;
  cursor: pointer;
}
.filter-select:focus {
  border-color: var(--primary);
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
.premium-row.row-modified {
  background-color: #fef2f2;
}
.premium-row.row-completed {
  background-color: #f0fdf4;
}

.text-content {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.qty-input {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 14px;
  font-family: 'Consolas', 'Courier New', monospace;
  text-align: center;
  outline: none;
  background: var(--surface);
  color: var(--text-primary);
  transition: border-color 0.2s ease;
}
.qty-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(27, 100, 218, 0.15);
}

.display-select {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  background: var(--surface);
  color: var(--text-primary);
  cursor: pointer;
}
.display-select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(27, 100, 218, 0.15);
}

.update-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: var(--primary, #1B64DA);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, opacity 0.2s ease;
}
.update-btn:hover:not(:disabled) {
  background: #1552b3;
}
.update-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%) translateY(-100%);
  background: #333;
  color: #fff;
  padding: 10px 24px;
  border-radius: 10px;
  font-size: 14px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  animation: slideDown 0.3s ease forwards;
}

@keyframes slideDown {
  from {
    transform: translateX(-50%) translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

.test-btn {
  margin-left: 12px;
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: #10b981;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
  white-space: nowrap;
}
.test-btn:hover:not(:disabled) {
  background: #059669;
}
.test-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sync-new-btn {
  margin-left: 12px;
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: #f59e0b;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
  white-space: nowrap;
}
.sync-new-btn:hover:not(:disabled) {
  background: #d97706;
}
.sync-new-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.test-result {
  position: fixed;
  bottom: 70px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 14px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  max-width: 500px;
  text-align: center;
  line-height: 1.5;
  white-space: pre-line;
}
.test-result.success {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #6ee7b7;
}
.test-result.fail {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}


</style>
