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
        <a href="getstock.html" class="nav-link"><span class="icon">📥</span>입고</a>
        <a href="outstock.html" class="nav-link"><span class="icon">📤</span>출고</a>
        <a href="todolist.html" class="nav-link"><span class="icon">📝</span>메모장</a>
        <a href="ss_code_stock.html" class="nav-link"><span class="icon">🏪</span>스마트스토어 재고변경</a>
        <a href="cs_todolist.html" class="nav-link active"><span class="icon">💬</span>CS 투두리스트</a>
      </nav>
    </div>
  </div>

  <button class="left-menu-toggle" @click="showLeftMenu = true">☰</button>

  <div class="page-header">
    <h1>💬 CS 투두리스트</h1>
    <div class="header-actions">
      <select v-model="filterStatus" class="filter-select">
        <option value="">전체</option>
        <option value="pending">대기중</option>
        <option value="done">완료</option>
      </select>
      <button class="refresh-btn" @click="loadMessages" :disabled="loading">
        {{ loading ? '로딩...' : '새로고침' }}
      </button>
    </div>
  </div>

  <div class="stats-bar">
    <span class="stat">전체: {{ messages.length }}</span>
    <span class="stat pending">대기: {{ messages.filter(m => m.status === 'pending').length }}</span>
    <span class="stat done">완료: {{ messages.filter(m => m.status === 'done').length }}</span>
  </div>

  <div v-if="loading" class="loading">로딩 중...</div>
  <div v-else-if="filteredMessages.length === 0" class="empty">메시지가 없습니다.</div>

  <div v-else class="message-list">
    <div v-for="msg in filteredMessages" :key="msg.id" class="message-card" :class="msg.status">
      <div class="msg-header">
        <span class="msg-sender">{{ msg.sender }}</span>
        <span class="msg-room" v-if="msg.room">[{{ msg.room }}]</span>
        <span class="msg-time">{{ formatTime(msg.timestamp || msg.createdAt) }}</span>
      </div>
      <div class="msg-body">{{ msg.msg }}</div>
      <div class="msg-actions">
        <button v-if="msg.status === 'pending'" class="btn-done" @click="updateStatus(msg.id, 'done')">
          ✅ 완료
        </button>
        <button v-else class="btn-undo" @click="updateStatus(msg.id, 'pending')">
          ↩️ 되돌리기
        </button>
        <button class="btn-delete" @click="deleteMessage(msg.id)">🗑️ 삭제</button>
      </div>
    </div>
  </div>

  <div v-if="toast" class="toast">{{ toast }}</div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const messages = ref([])
const loading = ref(false)
const filterStatus = ref('')
const toast = ref('')
const showLeftMenu = ref(false)

const filteredMessages = computed(() => {
  if (!filterStatus.value) return messages.value
  return messages.value.filter(m => m.status === filterStatus.value)
})

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(typeof ts === 'number' ? ts : ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, 2000)
}

async function loadMessages() {
  loading.value = true
  try {
    const res = await fetch('/api/cs_messages')
    const data = await res.json()
    if (data.success) messages.value = data.data
  } catch (e) {
    showToast('로딩 실패: ' + e.message)
  } finally {
    loading.value = false
  }
}

async function updateStatus(id, status) {
  try {
    await fetch('/api/cs_messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    })
    const msg = messages.value.find(m => m.id === id)
    if (msg) msg.status = status
    showToast('상태가 변경되었습니다.')
  } catch (e) {
    showToast('실패: ' + e.message)
  }
}

async function deleteMessage(id) {
  if (!confirm('삭제하시겠습니까?')) return
  try {
    await fetch(`/api/cs_messages?id=${id}`, { method: 'DELETE' })
    messages.value = messages.value.filter(m => m.id !== id)
    showToast('삭제되었습니다.')
  } catch (e) {
    showToast('삭제 실패: ' + e.message)
  }
}

onMounted(loadMessages)
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h1 { margin: 0; font-size: 1.4rem; }
.header-actions { display: flex; gap: 8px; align-items: center; }

.filter-select {
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
}

.refresh-btn {
  padding: 6px 14px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.refresh-btn:disabled { opacity: 0.5; }

.stats-bar {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  font-size: 14px;
}
.stat { color: #666; }
.stat.pending { color: #f59e0b; font-weight: bold; }
.stat.done { color: #10b981; font-weight: bold; }

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: #999;
  font-size: 16px;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
  transition: box-shadow 0.2s;
}
.message-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.message-card.done { border-left: 4px solid #10b981; opacity: 0.7; }
.message-card.pending { border-left: 4px solid #f59e0b; }

.msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}
.msg-sender { font-weight: bold; color: #374151; }
.msg-room { color: #9ca3af; }
.msg-time { margin-left: auto; color: #9ca3af; }

.msg-body {
  font-size: 15px;
  line-height: 1.5;
  color: #1f2937;
  white-space: pre-wrap;
  word-break: break-word;
}

.msg-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.btn-done, .btn-undo, .btn-delete {
  padding: 5px 12px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.btn-done { background: #d1fae5; color: #065f46; }
.btn-undo { background: #fef3c7; color: #92400e; }
.btn-delete { background: #fee2e2; color: #991b1b; margin-left: auto; }

.toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #1f2937;
  color: white;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 9999;
}

.left-menu-toggle {
  position: fixed;
  top: 10px;
  left: 10px;
  z-index: 100;
  background: white;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 18px;
  cursor: pointer;
}
</style>
