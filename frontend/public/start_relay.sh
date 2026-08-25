#!/bin/bash
# Termux 세션 유지 및 릴레이 서버 자동 시작 스크립트

# 화면 꺼짐 방지
termux-wake-lock 2>/dev/null

# 기존 프로세스 정리
pkill -f naver_relay_server.py 2>/dev/null
pkill -f cloudflared 2>/dev/null
sleep 2

# 현재 디렉토리로 이동
cd /data/data/com.termux/files/home

# 릴레이 서버 시작
nohup python naver_relay_server.py > ~/relay.log 2>&1 &
sleep 2

# Cloudflare 터널 시작
nohup cloudflared tunnel run phone-relay > ~/tunnel.log 2>&1 &

echo "[$(date)] 서비스 시작됨" >> ~/relay.log
