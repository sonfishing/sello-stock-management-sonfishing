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
        <a href="cs_todolist.html" class="nav-link"><span class="icon">💬</span>CS 투두리스트</a>
        <a href="kanban.html" class="nav-link active"><span class="icon">📋</span>칸반 보드</a>
      </nav>
    </div>
  </div>

  <button class="left-menu-toggle" @click="showLeftMenu = true">☰</button>

  <div class="kanban-app">
    <div class="kanban-header">
      <h1>📋 칸반 보드</h1>
      <div class="header-actions">
        <span class="card-count">전체 {{ allCards.length }}개</span>
        <button class="refresh-btn" @click="loadCards" :disabled="loading">
          {{ loading ? '로딩...' : '새로고침' }}
        </button>
      </div>
    </div>

    <div v-if="usingSupabase === false && allCards.length === 0 && !loading" class="setup-notice">
      <p>💡 Supabase 연결이 필요합니다.</p>
      <p style="font-size:13px; color:#888; margin-top:8px;">
        Supabase 대시보드에서 아래 SQL을 실행하세요:
      </p>
      <pre class="sql-block">{{ sampleSql }}</pre>
    </div>

    <div class="kanban-board" v-else>
      <div
        v-for="col in columns"
        :key="col.id"
        class="kanban-column"
        :class="{ 'drag-over': dragOverColumn === col.id }"
        @dragover.prevent="onDragOver(col.id)"
        @dragleave="onDragLeave"
        @drop="onDrop(col.id)"
      >
        <div class="column-header" :style="{ borderColor: col.color }">
          <span class="col-dot" :style="{ background: col.color }"></span>
          <span class="col-title">{{ col.title }}</span>
          <span class="col-count">{{ getColumnCards(col.id).length }}</span>
        </div>

        <div class="column-body">
          <div
            v-for="card in getColumnCards(col.id)"
            :key="card.id"
            class="kanban-card"
            :class="{ dragging: dragCardId === card.id }"
            draggable="true"
            @dragstart="onDragStart(card.id)"
            @dragend="onDragEnd"
            @dblclick="startEdit(card)"
          >
            <template v-if="editingCardId === card.id">
              <textarea
                ref="editInput"
                v-model="editTitle"
                class="card-edit-input"
                rows="2"
                @keydown.enter.exact.prevent="saveEdit(card)"
                @keydown.escape="cancelEdit"
                @blur="saveEdit(card)"
                placeholder="할일을 입력하세요..."
              ></textarea>
            </template>
            <template v-else>
              <div class="card-title">{{ card.title }}</div>
              <div class="card-actions">
                <button class="card-btn move-btn" @click.stop="moveCard(card, getNextColumn(col.id))" title="다음 컬럼으로 이동">
                  →
                </button>
                <button class="card-btn delete-btn" @click.stop="deleteCard(card.id)" title="삭제">
                  ×
                </button>
              </div>
            </template>
          </div>

          <div class="add-card-area">
            <input
              v-model="newCardTitles[col.id]"
              :placeholder="col.placeholder"
              class="add-card-input"
              @keydown.enter="addCard(col.id)"
            />
            <button
              v-if="newCardTitles[col.id]?.trim()"
              class="add-card-btn"
              @click="addCard(col.id)"
            >+</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { supabase } from './supabaseClient'

const columns = [
  { id: 'todo', title: '할 일', color: '#f59e0b', placeholder: '+ 할일 입력 후 Enter' },
  { id: 'in_progress', title: '진행 중', color: '#3b82f6', placeholder: '+ 진행 중인 일 입력' },
  { id: 'done', title: '완료', color: '#10b981', placeholder: '+ 완료된 일 기록' }
]

const allCards = ref([])
const loading = ref(false)
const showLeftMenu = ref(false)
const toast = ref('')
const usingSupabase = ref(true)

const newCardTitles = ref({ todo: '', in_progress: '', done: '' })

const dragCardId = ref(null)
const dragOverColumn = ref(null)

const editingCardId = ref(null)
const editTitle = ref('')
const editInput = ref(null)

const sampleSql = `-- Supabase SQL Editor에서 실행하세요
CREATE TABLE IF NOT EXISTS kanban_cards (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE kanban_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON kanban_cards
  FOR ALL USING (true) WITH CHECK (true);`

const sortedCards = computed(() => {
  return [...allCards.value].sort((a, b) => {
    if (a.status !== b.status) {
      const order = { todo: 0, in_progress: 1, done: 2 }
      return (order[a.status] || 0) - (order[b.status] || 0)
    }
    return (a.position || 0) - (b.position || 0)
  })
})

function getColumnCards(colId) {
  return sortedCards.value.filter(c => c.status === colId)
}

function getNextColumn(currentId) {
  const idx = columns.findIndex(c => c.id === currentId)
  return idx < columns.length - 1 ? columns[idx + 1].id : null
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, 2000)
}

async function loadCards() {
  loading.value = true
  try {
    if (usingSupabase.value) {
      const { data, error } = await supabase
        .from('kanban_cards')
        .select('*')
        .order('position', { ascending: true })
      if (error) throw error
      allCards.value = data || []
    } else {
      const saved = localStorage.getItem('kanban_cards')
      allCards.value = saved ? JSON.parse(saved) : []
    }
  } catch (e) {
    if (e.message?.includes('does not exist') || e.message?.includes('relation') || e.code === '42P01') {
      usingSupabase.value = false
      const saved = localStorage.getItem('kanban_cards')
      allCards.value = saved ? JSON.parse(saved) : []
      showToast('Supabase 테이블이 없어 로컬 저장 모드로 동작합니다.')
    } else {
      showToast('로딩 실패: ' + e.message)
    }
  } finally {
    loading.value = false
  }
}

function saveLocal() {
  localStorage.setItem('kanban_cards', JSON.stringify(allCards.value))
}

async function addCard(status) {
  const title = (newCardTitles.value[status] || '').trim()
  if (!title) return

  const maxPos = allCards.value
    .filter(c => c.status === status)
    .reduce((max, c) => Math.max(max, c.position || 0), 0)

  const newCard = {
    title,
    status,
    position: maxPos + 1,
    created_at: new Date().toISOString()
  }

  try {
    if (usingSupabase.value) {
      const { data, error } = await supabase
        .from('kanban_cards')
        .insert([newCard])
        .select()
      if (error) throw error
      allCards.value.push(data[0])
    } else {
      newCard.id = Date.now()
      allCards.value.push(newCard)
      saveLocal()
    }
  } catch (e) {
    if (e.message?.includes('does not exist') || e.message?.includes('relation') || e.code === '42P01') {
      usingSupabase.value = false
      newCard.id = Date.now()
      allCards.value.push(newCard)
      saveLocal()
    } else {
      showToast('추가 실패: ' + e.message)
      return
    }
  }

  newCardTitles.value[status] = ''
  showToast('추가되었습니다.')
}

async function deleteCard(id) {
  try {
    if (usingSupabase.value) {
      const { error } = await supabase.from('kanban_cards').delete().eq('id', id)
      if (error) throw error
    }
    allCards.value = allCards.value.filter(c => c.id !== id)
    if (!usingSupabase.value) saveLocal()
    showToast('삭제되었습니다.')
  } catch (e) {
    showToast('삭제 실패: ' + e.message)
  }
}

async function moveCard(card, newStatus) {
  if (!newStatus) return

  const maxPos = allCards.value
    .filter(c => c.status === newStatus)
    .reduce((max, c) => Math.max(max, c.position || 0), 0)

  card.status = newStatus
  card.position = maxPos + 1

  try {
    if (usingSupabase.value) {
      const { error } = await supabase
        .from('kanban_cards')
        .update({ status: newStatus, position: card.position, updated_at: new Date().toISOString() })
        .eq('id', card.id)
      if (error) throw error
    } else {
      saveLocal()
    }
  } catch (e) {
    showToast('이동 실패: ' + e.message)
  }
}

function startEdit(card) {
  editingCardId.value = card.id
  editTitle.value = card.title
  nextTick(() => {
    const inputs = document.querySelectorAll('.card-edit-input')
    if (inputs.length > 0) inputs[inputs.length - 1].focus()
  })
}

function cancelEdit() {
  editingCardId.value = null
  editTitle.value = ''
}

async function saveEdit(card) {
  const newTitle = editTitle.value.trim()
  if (!newTitle || newTitle === card.title) {
    cancelEdit()
    return
  }

  card.title = newTitle
  try {
    if (usingSupabase.value) {
      const { error } = await supabase
        .from('kanban_cards')
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq('id', card.id)
      if (error) throw error
    } else {
      saveLocal()
    }
  } catch (e) {
    showToast('수정 실패: ' + e.message)
  }
  cancelEdit()
}

function onDragStart(cardId) {
  dragCardId.value = cardId
}

function onDragOver(colId) {
  dragOverColumn.value = colId
}

function onDragLeave() {
  dragOverColumn.value = null
}

function onDrop(colId) {
  dragOverColumn.value = null
  if (!dragCardId.value) return

  const card = allCards.value.find(c => c.id === dragCardId.value)
  if (card && card.status !== colId) {
    moveCard(card, colId)
  }
  dragCardId.value = null
}

function onDragEnd() {
  dragCardId.value = null
  dragOverColumn.value = null
}

onMounted(loadCards)
</script>

<style scoped>
.kanban-app {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.kanban-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.kanban-header h1 { margin: 0; font-size: 1.5rem; }
.header-actions { display: flex; gap: 12px; align-items: center; }
.card-count { color: #6b7280; font-size: 14px; }
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

.setup-notice {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  padding: 24px;
  text-align: center;
}
.sql-block {
  text-align: left;
  background: #1e293b;
  color: #e2e8f0;
  padding: 16px;
  border-radius: 8px;
  font-size: 12px;
  overflow-x: auto;
  margin-top: 12px;
  white-space: pre;
}

.kanban-board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  align-items: start;
}

.kanban-column {
  background: #f9fafb;
  border-radius: 12px;
  min-height: 300px;
  transition: background 0.2s;
}
.kanban-column.drag-over { background: #e0e7ff; }

.column-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 3px solid;
  font-weight: 600;
  font-size: 14px;
}
.col-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.col-title { flex: 1; }
.col-count {
  background: #e5e7eb;
  color: #6b7280;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.column-body {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kanban-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: grab;
  transition: box-shadow 0.2s, opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 42px;
}
.kanban-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.kanban-card.dragging { opacity: 0.4; }

.card-title {
  flex: 1;
  font-size: 14px;
  color: #1f2937;
  line-height: 1.4;
  word-break: break-word;
}

.card-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}
.kanban-card:hover .card-actions { opacity: 1; }

.card-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
  border-radius: 4px;
  color: #9ca3af;
  line-height: 1;
}
.card-btn:hover { background: #f3f4f6; color: #374151; }
.delete-btn:hover { background: #fee2e2; color: #dc2626; }

.card-edit-input {
  width: 100%;
  border: 2px solid #3b82f6;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  outline: none;
  line-height: 1.4;
}

.add-card-area {
  display: flex;
  gap: 4px;
  padding: 4px;
}
.add-card-input {
  flex: 1;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
  background: transparent;
  transition: border-color 0.2s;
}
.add-card-input:focus { border-color: #3b82f6; border-style: solid; }
.add-card-input::placeholder { color: #9ca3af; }

.add-card-btn {
  width: 32px;
  height: 32px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}
.add-card-btn:hover { background: #2563eb; }

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

.left-off-canvas-menu {
  position: fixed;
  top: 0; left: -260px;
  width: 260px; height: 100vh;
  background: white;
  box-shadow: 2px 0 12px rgba(0,0,0,0.1);
  z-index: 200;
  transition: left 0.3s;
}
.left-off-canvas-menu.active { left: 0; }
.left-menu-inner { padding: 20px; }
.left-menu-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 20px;
}
.left-menu-header h2 { margin: 0; font-size: 1.2rem; }
.close-left-menu-btn {
  background: none; border: none; font-size: 24px; cursor: pointer; color: #666;
}
.left-nav-links { display: flex; flex-direction: column; gap: 4px; }
.nav-link {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px;
  text-decoration: none; color: #374151; font-size: 14px;
  transition: background 0.15s;
}
.nav-link:hover { background: #f3f4f6; }
.nav-link.active { background: #eff6ff; color: #2563eb; font-weight: 600; }
.nav-link .icon { font-size: 16px; }

@media (max-width: 768px) {
  .kanban-board { grid-template-columns: 1fr; }
}
</style>
