<template>
  <SideMenu v-model="showLeftMenu" active="kakao_alert.html" />

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
        <button class="menu-btn" @click="toggleSettings">⚙️ 설정</button>
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

    <div v-if="showSettings" class="settings-panel">
      <div class="settings-note">
        감시할 방과 검색 키워드 쌍을 여러 개 만들 수 있습니다. 저장하면 메신저봇R이 최대 10분 내 새 설정을 받아옵니다.
        규칙이 없으면 봇 스크립트의 기본값(방·키워드)이 사용됩니다.
      </div>

      <div v-if="cfgRules.length" class="rules-list">
        <div v-for="(rule, i) in cfgRules" :key="i" class="rule-row">
          <span class="rule-num">{{ i + 1 }}</span>
          <div class="settings-field">
            <label>감시 방 이름</label>
            <input v-model="rule.room" placeholder="예: 우리방 단톡방 (정확히 일치)" />
          </div>
          <div class="settings-field">
            <label>검색 키워드 (쉼표 구분)</label>
            <input v-model="rule.keywords" placeholder="예: 공지, 긴급, 모집" />
          </div>
          <button class="menu-btn danger-btn rule-remove" @click="removeRule(i)" title="이 규칙 삭제">×</button>
        </div>
      </div>
      <div v-else class="rules-empty">추가된 규칙이 없습니다.</div>

      <div class="settings-actions">
        <button class="menu-btn" @click="addRule">＋ 규칙 추가</button>
        <button class="menu-btn save-btn" @click="saveConfig" :disabled="savingConfig">
          {{ savingConfig ? '저장 중...' : '💾 설정 저장' }}
        </button>
        <button class="menu-btn danger-btn" @click="clearConfig" :disabled="savingConfig">설정 삭제</button>
        <span class="config-state" :class="{ active: hasServerConfig }">
          {{ hasServerConfig ? `서버 설정 사용 중 (${configRuleCount}개 규칙)` : '서버 설정 없음 → 스크립트 기본값' }}
        </span>
      </div>
    </div>

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
            <div v-for="group in groupedItems" :key="group.room" class="room-group">
              <div class="room-group-header">
                <span class="room-group-name">💬 {{ group.room }}</span>
                <span class="room-group-count">{{ group.list.length }}건</span>
              </div>
              <table class="product-table alert-table">
                <thead>
                  <tr>
                    <th style="width: 150px;">시간</th>
                    <th style="width: 130px;">보낸사람</th>
                    <th>메시지내용</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in group.list" :key="item.id">
                    <td class="cell-time">{{ item.time || item.receivedAt || '-' }}</td>
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
  </div>

  <div v-if="toast" class="toast">{{ toast }}</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import SideMenu from './components/SideMenu.vue'

const items = ref([])
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const sortAsc = ref(true) // true: 오래된 -> 최신 (시간순)
const showLeftMenu = ref(false)
const toast = ref('')
let toastTimer = null
let autoTimer = null

const showSettings = ref(false)
const cfgRules = ref([]) // [{ room: '', keywords: '쉼표문자열' }]
const configRuleCount = ref(0)
const savingConfig = ref(false)
const hasServerConfig = ref(false)

const API = '/api/kakao_alert'
const CONFIG_API = '/api/kakao_config'

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

// 방별로 그룹화 (표시 순서: 필터/정렬 결과의 첫 등장 순서 = 최신 또는 최오래된 방 우선)
const groupedItems = computed(() => {
  const groups = new Map()
  for (const item of filteredItems.value) {
    const key = (item.room || '').trim() || '(방 이름 없음)'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.entries()].map(([room, list]) => ({ room, list }))
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

function toRows(rules) {
  return (rules || []).map(r => ({
    room: r.room || '',
    keywords: (r.keywords || []).join(', ')
  }))
}

function addRule() {
  cfgRules.value.push({ room: '', keywords: '' })
}

function removeRule(i) {
  cfgRules.value.splice(i, 1)
}

async function loadConfig() {
  try {
    const res = await fetch(CONFIG_API, { cache: 'no-store' })
    const data = await res.json()
    if (!data.success) return
    cfgRules.value = toRows(data.data.rules)
    configRuleCount.value = cfgRules.value.length
    hasServerConfig.value = cfgRules.value.length > 0
    if (!cfgRules.value.length) addRule() // 편집 편의를 위해 빈 행 1개
  } catch (e) {
    /* 설정 조회 실패는 무시 (표시만 기본값으로) */
  }
}

function toggleSettings() {
  showSettings.value = !showSettings.value
  if (showSettings.value) loadConfig()
}

async function saveConfig() {
  savingConfig.value = true
  try {
    const rules = cfgRules.value
      .map(r => ({
        room: r.room.trim(),
        keywords: r.keywords.split(',').map(s => s.trim()).filter(Boolean)
      }))
      .filter(r => r.room || r.keywords.length)

    const res = await fetch(CONFIG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules })
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '저장 실패')

    cfgRules.value = toRows(data.data.rules)
    if (!cfgRules.value.length) addRule()
    configRuleCount.value = data.data.rules.length
    hasServerConfig.value = data.data.rules.length > 0
    showToast(`설정 저장 완료 (${data.data.rules.length}개 규칙, 봇에 최대 10분 내 반영)`)
  } catch (e) {
    showToast('저장 실패: ' + e.message, 4000)
  } finally {
    savingConfig.value = false
  }
}

async function clearConfig() {
  if (!confirm('서버 설정을 삭제할까요? (봇은 스크립트 기본값으로 돌아갑니다)')) return
  savingConfig.value = true
  try {
    const res = await fetch(CONFIG_API, { method: 'DELETE' })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || '삭제 실패')
    cfgRules.value = [{ room: '', keywords: '' }]
    configRuleCount.value = 0
    hasServerConfig.value = false
    showToast('설정 삭제됨 (봇은 스크립트 기본값 사용)')
  } catch (e) {
    showToast('삭제 실패: ' + e.message, 4000)
  } finally {
    savingConfig.value = false
  }
}

onMounted(() => {
  load()
  loadConfig()
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

.settings-panel {
  background: var(--surface);
  border-bottom: 1px solid var(--border-color);
  padding: 16px 24px;
}
.settings-note {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 12px;
}
.settings-grid {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.settings-field {
  flex: 1;
  min-width: 260px;
}
.settings-field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.settings-field input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  padding: 9px 14px;
  border-radius: 10px;
  font-size: 14px;
  background: var(--bg-main);
  color: var(--text-primary);
  outline: none;
}
.settings-field input:focus {
  border-color: var(--primary);
  background: var(--surface);
}
.settings-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.save-btn {
  background: var(--primary) !important;
  color: #fff !important;
}
.config-state {
  font-size: 12px;
  color: var(--text-tertiary);
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  padding: 5px 12px;
  border-radius: 999px;
}
.config-state.active {
  color: var(--primary);
  background: var(--primary-light);
  border-color: var(--primary-light);
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

/* 방별 그룹 표시 */
.room-group + .room-group {
  border-top: 1px solid var(--border-color);
}
.room-group-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  background: var(--bg-main);
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.room-group-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.room-group-count {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--surface);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 1px 9px;
}
</style>
