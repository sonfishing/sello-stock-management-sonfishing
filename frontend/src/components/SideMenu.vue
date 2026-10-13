<template>
  <div class="left-off-canvas-menu" :class="{ active: modelValue }">
    <div class="left-menu-inner">
      <div class="left-menu-header">
        <h2>메뉴</h2>
        <button class="close-left-menu-btn" @click="emit('update:modelValue', false)">&times;</button>
      </div>
      <nav class="left-nav-links">
        <a
          v-for="link in links"
          :key="link.href"
          :href="link.href"
          class="nav-link"
          :class="{ active: link.href === active }"
          @click="onLinkClick(link)"
        >
          <span class="icon">{{ link.icon }}</span>{{ link.label }}
          <span v-if="link.href === 'kakao_alert.html' && alertBadge > 0" class="nav-badge">
            {{ alertBadge > 99 ? '99+' : alertBadge }}
          </span>
        </a>
      </nav>
    </div>
  </div>

  <button
    v-if="floatingToggle"
    class="left-menu-toggle"
    @click="emit('update:modelValue', true)"
  >☰</button>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

defineProps({
  modelValue: { type: Boolean, default: false },
  active: { type: String, default: '' },
  floatingToggle: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const links = [
  { href: 'index.html', icon: '📦', label: '재고' },
  { href: '0stock.html', icon: '🚫', label: '품절' },
  { href: 'getstock.html', icon: '📥', label: '입고' },
  { href: 'outstock.html', icon: '📤', label: '출고' },
  { href: 'todolist.html', icon: '📚', label: '지식 라이브러리' },
  { href: 'ss_code_stock.html', icon: '🏪', label: '스마트스토어 재고변경' },
  { href: 'cs_todolist.html', icon: '📋', label: '해야할일' },
  { href: 'kanban.html', icon: '💬', label: 'CS처리' },
  { href: 'kakao_alert.html', icon: '🔔', label: '카카오 알림' }
]

/* 카카오 알림 미확인 배지 (localStorage에 마지막 확인 시각 저장) */
const SEEN_KEY = 'kakao_alert_seen'
const isAlertPage = typeof location !== 'undefined' && location.pathname.includes('kakao_alert')
const alertBadge = ref(0)
let badgeTimer = null

async function pollBadge() {
  try {
    const since = localStorage.getItem(SEEN_KEY) || '1970-01-01T00:00:00.000Z'
    const res = await fetch('/api/kakao_alert?since=' + encodeURIComponent(since), { cache: 'no-store' })
    const data = await res.json()
    if (data && data.success) alertBadge.value = data.count || 0
  } catch (e) { /* 배지 조회 실패는 무시 */ }
}

function onLinkClick(link) {
  if (link.href === 'kakao_alert.html') {
    try { localStorage.setItem(SEEN_KEY, new Date().toISOString()) } catch (e) {}
    alertBadge.value = 0
  }
}

onMounted(() => {
  if (isAlertPage) return // 알림 페이지 자체에서는 배지 불필요
  pollBadge()
  badgeTimer = setInterval(pollBadge, 15000)
})

onUnmounted(() => {
  clearInterval(badgeTimer)
})
</script>

<style scoped>
/* Left Off-canvas Menu (App.css에서 이동. CSS 변수는 페이지와 무관하게 동작하도록 fallback 포함) */
.left-off-canvas-menu {
  position: fixed;
  top: 0;
  left: 0;
  width: 280px;
  height: 100vh;
  background: var(--surface, #ffffff);
  box-shadow: 10px 0 30px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  transform: translateX(-100%);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
}
.left-off-canvas-menu.active {
  transform: translateX(0);
}
.left-menu-inner {
  padding: 24px;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.left-menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  border-bottom: 1px solid var(--border-color, #e5e8eb);
  padding-bottom: 15px;
}
.left-menu-header h2 {
  margin: 0;
  font-size: 20px;
  color: var(--text-primary, #333d4b);
}
.close-left-menu-btn {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--text-tertiary, #8b95a1);
  cursor: pointer;
  line-height: 1;
}
.close-left-menu-btn:hover {
  color: var(--text-primary, #333d4b);
}
.left-nav-links {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  text-decoration: none;
  color: var(--text-secondary, #4e5968);
  font-size: 16px;
  font-weight: 600;
  border-radius: 12px;
  background: var(--bg-main, #f9fafb);
  transition: all 0.2s ease;
}
.nav-link:hover {
  background: var(--primary-light, #e8f3ff);
  color: var(--primary, #3182f6);
  transform: translateX(5px);
}
.nav-link.active {
  background: var(--primary-light, #e8f3ff);
  color: var(--primary, #3182f6);
  font-weight: 600;
}
.nav-link .icon {
  font-size: 16px;
}
.nav-badge {
  margin-left: auto;
  background: #F04438;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  line-height: 1;
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
