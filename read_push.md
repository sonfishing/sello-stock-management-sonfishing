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

이 저장소는 **GitHub와 Cloudflare Pages가 Git 연동**되어 있어, `main` 브랜치에 푸시하면 Cloudflare Pages가 자동으로 빌드(`cd frontend && npm run build`) 후 배포합니다.

**로컬에서 할 일은 Git 푸시까지**:
```powershell
git add -A
git commit -m "변경사항 설명"
git push
```

> 푸시 후 Cloudflare Pages 대시보드(https://dash.cloudflare.com)에서 배포 상태를 확인할 수 있습니다.
>
> Cloudflare Pages 빌드 설정:
> - **루트 디렉토리**: `/frontend`
> - **빌드 명령어**: `npm run build`
> - **배포 디렉토리**: `dist`
> - **환경변수**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (대시보드에 별도 설정)

---

## wrangler CLI로 배포 (대체 방법)

로컬에 wrangler가 설치되어 있지 않으므로 사용 전 설치 필요:
```powershell
npm install -g wrangler
wrangler login
cd frontend
npm run build
wrangler pages deploy dist --branch main
```
