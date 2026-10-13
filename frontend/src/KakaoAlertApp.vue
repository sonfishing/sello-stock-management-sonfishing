<template>
  <div class="left-off-canvas-menu" :class="{ 'active': showLeftMenu }">
    <div class="left-menu-inner">
      <div class="left-menu-header">
        <h2>메뉴</h2>
        <button class="close-left-menu-btn" @click="showLeftMenu = false">&times;</button>
      </div>
      <nav class="left-nav-links">
        <a href="index.html" class="nav-link"><span class="icon">📦</span>재고</a>
        <a href="0stock.html" class="nav-link"><span class="icon">🚫</span>품절</a>
        <a href="ss_code_stock.html" class="nav-link"><span class="icon">🏪</span>스마트스토어 재고변경</a>
        <a href="cs_todolist.html" class="nav-link"><span class="icon">📋</span>해야할일</a>
        <a href="kanban.html" class="nav-link"><span class="icon">💬</span>CS처리</a>
        <a href="todolist.html" class="nav-link"><span class="icon">📚</span>지식 라이브러리</a>
        <a href="kakao_alert.html" class="nav-link active"><span class="icon">🔔</span>카카오 알림</a>
      </nav>
    </div>
  </div>

  <div class="main-layout" :class="{ 'dimmed': showLeftMenu }">
    <header class="top-bar">
      <div class="left-actions">
        <button class="menu-btn hamburger-btn" @click="showLeftMenu = !showLeftMenu">
          <span class="icon">☰</span>
        </button>
        <h1 class="title">🔔 카카오 키워드 알림</h1>
        <span class="count-badge">{{ filteredItems.length }}건</span>
      </div>
      <div class="right-actions">
        <div class="search-box">
          <input
            v-model="searchQuery"
            class="clean-search-input"
            placeholder="방이름, 보낸사람, 내용 검색..."
          />
        </div>
        <button class="menu-btn" @click="sortAsc = !sortAsc">
          {{ sortAsc ? '시간순 ↑' : '최신순 ↓' }}
        </button>
        <button class="menu-btn" @click="load(false)" :disabled="loading">
          {{ loading ? '로딩...' : '새로고침' }}
        </button>
        <button class="menu-btn danger-btn" @click="clearAll">전체삭제</button>
      </div>
    </header>

    <div class="content-area">
      <div class="list-view">
        <div v-if="loading && !items.length" class="table-container">
          <div class="table-wrapper state-box">
            <span class="spinner"></span> 불러오는 중...
          </div>
        </div>

        <div v-else-if="error" class="table-container">
          <div class="table-wrapper state-box error">{{ error }}</div>
        </div>

        <div v-else-if="!filteredItems.length" class="table-container">
          <div class="table-wrapper state-box">
            {{ searchQuery ? '검색 결과가 없습니다.' : '저장된 메시지가 없습니다. (메신저봇R 키워드 감지 후 표시됩니다)' }}
          </div>
        </div>

        <div v-else class="table-container">
          <div class="table-wrapper">
            <table class="product-table alert-table">
              <thead>
                <tr>
                  <th style="width: 150px;">시간</th>
                  <th style="width: 180px;">방이름</th>
                  <th style="width: 130px;">보낸사람</th>
                  <th>메시지내용</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in filteredItems" :key="item.id">
                  <td class="cell-time">{{ item.time || item.receivedAt || '-' }}</td>
                  <td class="cell-room">{{ item.room || '-' }}</td>
                  <td class="cell-sender">{{ item.sender || '-' }}</td>
                  <td class="cell-msg">
                    <span v-if="item.keyword" class="keyword-badge" :title="'감지 키워드: ' + item.keyword">{{ item.keyword }}</span>
                    <span class="msg-text">{{ item.msg }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-if="toast" class="toast">{{ toast }}</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const items = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const sortAsc = ref(true) // true: 오래된 -> 최신 (시간순)
const showLeftMenu = ref(false)
const toast = ref('')
let toastTimer = null
let autoTimer = null

const API = '/api/kakao_alert'

const filteredItems = computed(() => {
  let list = items.value
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(m =>
      (m.msg || '').toLowerCase().includes(q) ||
      (m.sender || '').toLowerCase().includes(q) ||
      (m.room || '').toLowerCase().includes(q) ||
      (m.keyword || '').toLowerCase().includes(q)
    )
  }
  return sortAsc.value ? list : list.slice().reverse()
})

function showToast(msg, ms = 2500) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, ms)
}

async function load(silent = false) {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const res = await fetch(API + '?limit=2000', { cache: 'no-store' })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '조회 실패')
    items.value = data.data || []
  } catch (e) {
    error.value = '불러오기 실패: ' + e.message
  } finally {
    loading.value = false
  }
}

async function clearAll() {
  if (!confirm('저장된 메시지를 모두 삭제할까요?')) return
  try {
    const res = await fetch(API, { method: 'DELETE' })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '삭제 실패')
    items.value = []
    showToast('전체 삭제 완료')
  } catch (e) {
    showToast('삭제 실패: ' + e.message)
  }
}

onMounted(() => {
  load()
  autoTimer = setInterval(() => load(true), 30000) // 30초마다 자동 갱신
})

onUnmounted(() => {
  clearInterval(autoTimer)
  clearTimeout(toastTimer)
})
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
  width: 230px;
  background: var(--surface);
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s ease;
}
.clean-search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(27, 100, 218, 0.15);
}

.count-badge {
  background: var(--primary-light);
  color: var(--primary);
  font-size: 13px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 999px;
}

.danger-btn {
  color: #F04438 !important;
}
.danger-btn:hover {
  background: #FEF3F2 !important;
}

.state-box {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
  font-size: 14px;
}
.state-box.error {
  color: #F04438;
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top-color: var(--primary);
  animation: spin 1s ease-in-out infinite;
  margin-right: 8px;
  vertical-align: middle;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.alert-table td {
  padding: 9px 12px;
  vertical-align: top;
  line-height: 1.5;
}
.cell-time {
  white-space: nowrap;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.cell-room,
.cell-sender {
  word-break: break-all;
}
.cell-msg .msg-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.keyword-badge {
  display: inline-block;
  background: var(--primary-light);
  color: var(--primary);
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 6px;
  margin-right: 7px;
  vertical-align: 1px;
  white-space: nowrap;
}
</style>
