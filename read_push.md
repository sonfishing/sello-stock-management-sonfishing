# 프로젝트 정보 & 푸시 가이드

## Git 저장소

- **원격 주소**: `https://github.com/sonfishing/sello-stock-management-sonfishing.git`
- **브랜치**: `main` (단일 브랜치)
- **로컬 폴더**: `C:\code\total_stock_manage`

## 작업 & 푸시 순서

```powershell
# 1. 작업 전: 현재 상태 확인
git status
git log --oneline -5

# 2. 수정할 파일은 frontend/src/ 아래 Vue 파일들
#    (App.vue, ZeroStockApp.vue, components/*.vue, App.css 등)

# 3. 변경사항 스테이징
git add -A

# 4. 커밋
git commit -m "원하는 커밋 메시지"

# 5. 푸시
git push
```

## 주요 파일 구조

| 파일 | 설명 |
|------|------|
| `frontend/src/App.vue` | 메인 재고 테이블, 모든 CRUD 로직 |
| `frontend/src/App.css` | 스타일 |
| `frontend/src/ZeroStockApp.vue` | 품절 페이지 |
| `frontend/src/components/ProductUpload.vue` | 엑셀 업로드 |
| `frontend/src/components/SelloStockUpload.vue` | 셀로 재고 업로드 |
| `frontend/src/supabaseClient.js` | Supabase 클라이언트 |

## 중요한 규칙

- **`dist/` 폴더는 `.gitignore`에 포함되어 있어서 커밋되지 않음**
- **`.env` 파일도 커밋되지 않음** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 포함)
- **Node.js 기반 Vue 3 + Vite 프로젝트**

## 배포 (Cloudflare Pages)

로컬에 Cloudflare Pages 설정 파일은 없으며, 현재는 `frontend/dist/` 폴더를 Cloudflare Pages 대시보드에 직접 업로드하여 배포하는 것으로 보입니다.

**배포 방법 (수동)**:
```powershell
cd frontend
npm run build
```
→ 생성된 `frontend/dist/` 폴더를 Cloudflare Pages 대시보드에 업로드

> 참고: .env의 Supabase 키는 Cloudflare Pages 환경변수에도 별도로 설정되어 있음 (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
