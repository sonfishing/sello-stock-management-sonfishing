#!/data/data/com.termux/files/usr/bin/bash
echo "=== Naver Relay Server 시작 ==="

# 기존 프로세스 정리
pkill -9 -f naver_relay_server 2>/dev/null

# Flask 실행 (백그라운드)
python naver_relay_server.py &
sleep 2

# 터널 실행
echo "cloudflared tunnel 연결 중..."
cloudflared tunnel run phone-relay
