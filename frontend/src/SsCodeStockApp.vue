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
    </header>

    <div class="content-area">
      <div class="list-view" style="display: flex; align-items: center; justify-content: center; height: 60vh;">
        <p style="color: var(--text-secondary); font-size: 18px;">준비 중입니다.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const showLeftMenu = ref(false)
</script>
