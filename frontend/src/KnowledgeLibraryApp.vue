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
        <a href="todolist.html" class="nav-link active"><span class="icon">📚</span>지식 라이브러리</a>
        <a href="ss_code_stock.html" class="nav-link"><span class="icon">🏪</span>스마트스토어 재고변경</a>
        <a href="cs_todolist.html" class="nav-link"><span class="icon">📋</span>해야할일</a>
        <a href="kanban.html" class="nav-link"><span class="icon">💬</span>CS처리</a>
      </nav>
    </div>
  </div>

  <button class="left-menu-toggle" @click="showLeftMenu = true">☰</button>

  <div class="library-app">
    <div class="library-header">
      <h1>📚 지식 라이브러리</h1>
      <div class="header-actions">
        <div class="search-box">
          <input
            v-model="searchQuery"
            class="search-input"
            placeholder="메모를 검색하세요..."
          />
          <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">×</button>
        </div>
        <button class="new-btn" @click="showCreate = !showCreate">
          {{ showCreate ? '✕ 닫기' : '+ 새 메모' }}
        </button>
        <button class="refresh-btn" @click="loadMemos" :disabled="loading">
          {{ loading ? '로딩...' : '새로고침' }}
        </button>
      </div>
    </div>

    <div v-if="showCreate" class="create-form">
      <input
        v-model="newTitle"
        class="create-title"
        placeholder="제목을 입력하세요"
        @keydown.enter="addMemo"
      />
      <textarea
        v-model="newContent"
        class="create-content"
        rows="4"
        placeholder="내용을 입력하세요..."
      ></textarea>
      <div class="create-footer">
        <input
          v-model="newTag"
          class="create-tag"
          placeholder="태그 (예: CS, 배송, 상품)"
          @keydown.enter="addMemo"
        />
        <button class="create-submit" @click="addMemo" :disabled="!newTitle.trim()">
          저장
        </button>
      </div>
    </div>

    <div class="stats-bar">
      <span class="stat">전체 {{ filteredMemos.length }}개</span>
      <span class="stat" v-if="searchQuery.trim()">검색 결과</span>
    </div>

    <div v-if="loading" class="loading">로딩 중...</div>
    <div v-else-if="filteredMemos.length === 0 && !showCreate" class="empty">
      {{ searchQuery.trim() ? '검색 결과가 없습니다.' : '메모가 없습니다. 새 메모를 작성해보세요.' }}
    </div>

    <div v-else class="memo-list">
      <div
        v-for="memo in filteredMemos"
        :key="memo.id"
        class="memo-card"
      >
        <div v-if="editingId === memo.id" class="memo-edit">
          <input
            v-model="editTitle"
            class="edit-title"
            placeholder="제목"
            @keydown.enter.exact="saveEdit(memo)"
            @keydown.escape="cancelEdit"
          />
          <textarea
            v-model="editContent"
            class="edit-content"
            rows="4"
            placeholder="내용"
            @keydown.escape.exact="cancelEdit"
          ></textarea>
          <div class="edit-footer">
            <input
              v-model="editTag"
              class="edit-tag"
              placeholder="태그"
              @keydown.enter.exact="saveEdit(memo)"
            />
            <div class="edit-actions">
              <button class="btn-save" @click="saveEdit(memo)">저장</button>
              <button class="btn-cancel" @click="cancelEdit">취소</button>
            </div>
          </div>
        </div>
        <template v-else>
          <div class="memo-header">
            <div class="memo-tags" v-if="memo.tag">
              <span class="tag" v-for="t in memo.tag.split(',')" :key="t">{{ t.trim() }}</span>
            </div>
            <span class="memo-date">{{ formatDate(memo.created_at) }}</span>
          </div>
          <div class="memo-title" @dblclick="startEdit(memo)">{{ memo.title }}</div>
          <div class="memo-content" @dblclick="startEdit(memo)">{{ memo.content }}</div>
          <div class="memo-actions">
            <button class="btn-edit" @click="startEdit(memo)">수정</button>
            <button class="btn-delete" @click="deleteMemo(memo.id)">삭제</button>
          </div>
        </template>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from './supabaseClient'

const memos = ref([])
const loading = ref(false)
const showLeftMenu = ref(false)
const showCreate = ref(false)
const toast = ref('')
const usingSupabase = ref(true)
const searchQuery = ref('')

const newTitle = ref('')
const newContent = ref('')
const newTag = ref('')

const editingId = ref(null)
const editTitle = ref('')
const editContent = ref('')
const editTag = ref('')

const filteredMemos = computed(() => {
  let result = [...memos.value].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    result = result.filter(m =>
      (m.title || '').toLowerCase().includes(q) ||
      (m.content || '').toLowerCase().includes(q) ||
      (m.tag || '').toLowerCase().includes(q)
    )
  }
  return result
})

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${d.getFullYear()}.${month}.${day} ${hours}:${minutes}`
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, 2000)
}

function isAuthError(e) {
  const msg = e.message || ''
  return msg.includes('No API key') || msg.includes('token') || msg.includes('403') || msg.includes('auth')
}

function isTableError(e) {
  const msg = e.message || ''
  return msg.includes('does not exist') || msg.includes('relation') || e.code === '42P01' || isAuthError(e)
}

async function loadMemos() {
  loading.value = true
  try {
    if (usingSupabase.value) {
      const { data, error } = await supabase
        .from('knowledge_memos')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      memos.value = data || []
    } else {
      const saved = localStorage.getItem('knowledge_memos')
      memos.value = saved ? JSON.parse(saved) : []
    }
  } catch (e) {
    if (isTableError(e)) {
      usingSupabase.value = false
      const saved = localStorage.getItem('knowledge_memos')
      memos.value = saved ? JSON.parse(saved) : []
      showToast('Supabase 연결 실패 → 로컬 모드로 동작합니다.')
    } else {
      showToast('로딩 실패: ' + e.message)
    }
  } finally {
    loading.value = false
  }
}

function saveLocal() {
  localStorage.setItem('knowledge_memos', JSON.stringify(memos.value))
}

async function addMemo() {
  if (!newTitle.value.trim()) return
  const memo = {
    title: newTitle.value.trim(),
    content: newContent.value.trim(),
    tag: newTag.value.trim(),
    created_at: new Date().toISOString()
  }
  try {
    if (usingSupabase.value) {
      const { data, error } = await supabase
        .from('knowledge_memos')
        .insert([memo])
        .select()
      if (error) throw error
      memos.value.unshift(data[0])
    } else {
      memo.id = Date.now()
      memos.value.unshift(memo)
      saveLocal()
    }
  } catch (e) {
    if (isTableError(e)) {
      usingSupabase.value = false
      memo.id = Date.now()
      memos.value.unshift(memo)
      saveLocal()
    } else {
      showToast('추가 실패: ' + e.message)
      return
    }
  }
  newTitle.value = ''
  newContent.value = ''
  newTag.value = ''
  showCreate.value = false
  showToast('메모가 추가되었습니다.')
}

async function deleteMemo(id) {
  if (!confirm('삭제하시겠습니까?')) return
  try {
    if (usingSupabase.value) {
      const { error } = await supabase.from('knowledge_memos').delete().eq('id', id)
      if (error) throw error
    }
    memos.value = memos.value.filter(m => m.id !== id)
    if (!usingSupabase.value) saveLocal()
    showToast('삭제되었습니다.')
  } catch (e) {
    if (isAuthError(e)) {
      usingSupabase.value = false
      memos.value = memos.value.filter(m => m.id !== id)
      saveLocal()
      showToast('삭제되었습니다.')
    } else {
      showToast('삭제 실패: ' + e.message)
    }
  }
}

function startEdit(memo) {
  editingId.value = memo.id
  editTitle.value = memo.title || ''
  editContent.value = memo.content || ''
  editTag.value = memo.tag || ''
}

function cancelEdit() {
  editingId.value = null
  editTitle.value = ''
  editContent.value = ''
  editTag.value = ''
}

async function saveEdit(memo) {
  if (!editTitle.value.trim()) { cancelEdit(); return }
  memo.title = editTitle.value.trim()
  memo.content = editContent.value.trim()
  memo.tag = editTag.value.trim()
  try {
    if (usingSupabase.value) {
      const { error } = await supabase
        .from('knowledge_memos')
        .update({ title: memo.title, content: memo.content, tag: memo.tag, updated_at: new Date().toISOString() })
        .eq('id', memo.id)
      if (error) throw error
    } else {
      saveLocal()
    }
  } catch (e) {
    if (isAuthError(e)) {
      usingSupabase.value = false
      saveLocal()
    } else {
      showToast('수정 실패: ' + e.message)
    }
  }
  cancelEdit()
  showToast('수정되었습니다.')
}

onMounted(loadMemos)
</script>

<style scoped>
.library-app {
  padding: 20px;
  max-width: 900px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}
.library-header h1 { margin: 0; font-size: 1.5rem; }
.header-actions { display: flex; gap: 10px; align-items: center; }
.search-box {
  display: flex; align-items: center;
  background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 0 8px;
  transition: border-color 0.2s;
}
.search-box:focus-within { border-color: #3b82f6; background: white; }
.search-input {
  border: none; background: transparent; padding: 6px 8px;
  font-size: 13px; outline: none; width: 200px; color: #1f2937; font-family: inherit;
}
.search-input::placeholder { color: #9ca3af; }
.search-clear {
  background: none; border: none; cursor: pointer; font-size: 16px;
  color: #9ca3af; padding: 2px 4px; border-radius: 4px; line-height: 1;
}
.search-clear:hover { background: #e5e7eb; color: #374151; }
.new-btn {
  padding: 6px 14px; background: #10b981; color: white;
  border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
  white-space: nowrap;
}
.new-btn:hover { background: #059669; }
.refresh-btn {
  padding: 6px 14px; background: #3b82f6; color: white;
  border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
}
.refresh-btn:disabled { opacity: 0.5; }

.create-form {
  background: white; border: 2px solid #3b82f6; border-radius: 12px;
  padding: 20px; margin-bottom: 20px;
}
.create-title {
  width: 100%; border: none; border-bottom: 2px solid #e5e7eb;
  padding: 8px 4px; font-size: 16px; font-weight: 600; outline: none;
  font-family: inherit; margin-bottom: 12px;
}
.create-title:focus { border-bottom-color: #3b82f6; }
.create-content {
  width: 100%; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 10px; font-size: 14px; font-family: inherit;
  resize: vertical; outline: none; line-height: 1.6; margin-bottom: 12px;
}
.create-content:focus { border-color: #3b82f6; }
.create-footer { display: flex; gap: 8px; align-items: center; }
.create-tag {
  flex: 1; border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 6px 10px; font-size: 13px; outline: none; font-family: inherit;
}
.create-tag:focus { border-color: #3b82f6; }
.create-submit {
  padding: 6px 16px; background: #3b82f6; color: white;
  border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
}
.create-submit:disabled { opacity: 0.5; cursor: not-allowed; }

.stats-bar {
  display: flex; gap: 12px; margin-bottom: 16px; font-size: 14px;
}
.stat { color: #6b7280; }
.loading, .empty {
  text-align: center; padding: 40px; color: #9ca3af; font-size: 16px;
}
.memo-list { display: flex; flex-direction: column; gap: 10px; }
.memo-card {
  background: white; border: 1px solid #e5e7eb; border-radius: 10px;
  padding: 16px; transition: box-shadow 0.2s;
}
.memo-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.memo-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
}
.memo-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.tag {
  background: #eff6ff; color: #2563eb; font-size: 11px; padding: 2px 8px;
  border-radius: 10px; font-weight: 500;
}
.memo-date { font-size: 11px; color: #9ca3af; }
.memo-title {
  font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 6px; cursor: pointer;
  word-break: break-word;
}
.memo-content {
  font-size: 14px; color: #4b5563; line-height: 1.6; white-space: pre-wrap;
  word-break: break-word; cursor: pointer;
}
.memo-actions {
  display: flex; gap: 6px; margin-top: 12px;
}
.btn-edit {
  padding: 4px 12px; background: #f3f4f6; color: #374151;
  border: none; border-radius: 6px; cursor: pointer; font-size: 12px;
}
.btn-edit:hover { background: #e5e7eb; }
.btn-delete {
  padding: 4px 12px; background: #fee2e2; color: #991b1b;
  border: none; border-radius: 6px; cursor: pointer; font-size: 12px;
  margin-left: auto;
}
.btn-delete:hover { background: #fecaca; }

.memo-edit { display: flex; flex-direction: column; gap: 10px; }
.edit-title {
  width: 100%; border: 2px solid #3b82f6; border-radius: 6px;
  padding: 8px 10px; font-size: 16px; font-weight: 600; outline: none; font-family: inherit;
}
.edit-content {
  width: 100%; border: 2px solid #3b82f6; border-radius: 6px;
  padding: 10px; font-size: 14px; font-family: inherit;
  resize: vertical; outline: none; line-height: 1.6;
}
.edit-footer { display: flex; gap: 8px; align-items: center; }
.edit-tag {
  flex: 1; border: 2px solid #3b82f6; border-radius: 6px;
  padding: 6px 10px; font-size: 13px; outline: none; font-family: inherit;
}
.edit-actions { display: flex; gap: 6px; }
.btn-save {
  padding: 4px 14px; background: #3b82f6; color: white;
  border: none; border-radius: 6px; cursor: pointer; font-size: 13px;
}
.btn-cancel {
  padding: 4px 14px; background: #f3f4f6; color: #374151;
  border: none; border-radius: 6px; cursor: pointer; font-size: 13px;
}

.toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: #1f2937; color: white; padding: 10px 20px;
  border-radius: 8px; font-size: 14px; z-index: 9999;
}
.left-menu-toggle {
  position: fixed; top: 10px; left: 10px; z-index: 100;
  background: white; border: 1px solid #ccc; border-radius: 6px;
  padding: 6px 10px; font-size: 18px; cursor: pointer;
}
.left-off-canvas-menu {
  position: fixed; top: 0; left: -260px;
  width: 260px; height: 100vh; background: white;
  box-shadow: 2px 0 12px rgba(0,0,0,0.1); z-index: 200; transition: left 0.3s;
}
.left-off-canvas-menu.active { left: 0; }
.left-menu-inner { padding: 20px; }
.left-menu-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
}
.left-menu-header h2 { margin: 0; font-size: 1.2rem; }
.close-left-menu-btn {
  background: none; border: none; font-size: 24px; cursor: pointer; color: #666;
}
.left-nav-links { display: flex; flex-direction: column; gap: 4px; }
.nav-link {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px;
  text-decoration: none; color: #374151; font-size: 14px; transition: background 0.15s;
}
.nav-link:hover { background: #f3f4f6; }
.nav-link.active { background: #eff6ff; color: #2563eb; font-weight: 600; }
.nav-link .icon { font-size: 16px; }
</style>
