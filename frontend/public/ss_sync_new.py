import time
import sys

from supabase import create_client

from ss_extract_detailed import (
    CLIENT_ID, CLIENT_SECRET,
    get_access_token,
    get_all_product_ids,
    get_product_detail,
    parse_product_rows,
)
from txt_to_supabase import SUPABASE_URL, SUPABASE_SERVICE_KEY, TABLE_NAME

# Windows 콘솔에서 인코딩 오류가 발생하지 않도록 설정
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PRODUCT_LIST_FILE = "product_list.txt"
DETAIL_LIST_FILE = "product_detail_list.txt"
DETAIL_HEADERS = ["원상품코드", "구분", "옵션ID", "상품명", "옵션명", "기본가격", "추가금액",
                  "재고수량", "판매상태", "관리코드", "태그", "display_status"]
BATCH_SIZE = 500


def get_supabase_origin_nos(supabase):
    """Supabase smartstore_products 에 저장된 원상품코드 전체를 페이지네이션으로 읽어옵니다."""
    ids = set()
    page_size = 1000
    start = 0
    while True:
        resp = (supabase.table(TABLE_NAME)
                .select("origin_product_no")
                .range(start, start + page_size - 1)
                .execute())
        data = resp.data or []
        if not data:
            break
        for r in data:
            ids.add(str(r["origin_product_no"]).strip())
        if len(data) < page_size:
            break
        start += page_size
    return ids


def rows_to_db_dicts(rows):
    """parse_product_rows 결과를 Supabase insert 용 딕셔너리로 변환합니다."""
    dicts = []
    for parts in rows:
        parts = [str(p) for p in parts]
        while len(parts) < 12:
            parts.append("")
        try:
            base_price = int(parts[5].strip())
        except ValueError:
            base_price = 0
        try:
            add_price = int(parts[6].strip())
        except ValueError:
            add_price = 0
        try:
            stock = int(parts[7].strip())
        except ValueError:
            stock = 0

        dicts.append({
            "origin_product_no": parts[0].strip(),
            "category": parts[1].strip(),
            "option_id": parts[2].strip(),
            "name": parts[3].strip(),
            "option_name": parts[4].strip(),
            "base_price": base_price,
            "additional_price": add_price,
            "stock_quantity": stock,
            "status": parts[8].strip(),
            "seller_code": parts[9].strip(),
            "tags": parts[10].strip(),
            "display_status": parts[11].strip(),
        })
    return dicts


def main():
    start_time = time.time()

    print("🔑 API 토큰을 발급합니다...")
    token = get_access_token(CLIENT_ID, CLIENT_SECRET)
    if not token:
        print("토큰 발급 실패로 종료합니다.")
        return

    # [1단계] 스토어 전체 상품번호 조회
    print("\n🔍 [1/3단계] 스토어 전체 상품 목록을 조회합니다...")
    api_ids = get_all_product_ids(token)

    # [2단계] Supabase 저장된 원상품코드와 비교하여 신규만 추출
    print("\n🗄️ [2/3단계] Supabase 에서 기존 원상품코드를 조회합니다...")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    saved_ids = get_supabase_origin_nos(supabase)

    new_ids = [i for i in api_ids if i not in saved_ids]
    print(f"\n📊 스토어 전체: {len(api_ids)}개 | Supabase 저장됨: {len(saved_ids & set(api_ids))}개 | 신규: {len(new_ids)}개")

    if not new_ids:
        print("✅ 새로 추가된 상품이 없습니다. 종료합니다.")
        return

    # 신규 상품번호를 product_list.txt 에도 추가 (전체 재수집 대비)
    listed_ids = set()
    try:
        with open(PRODUCT_LIST_FILE, "r", encoding="utf-8") as f:
            for line in f:
                p = line.split(",")[0].strip()
                if p:
                    listed_ids.add(p)
    except FileNotFoundError:
        pass

    missing_in_list = [i for i in new_ids if i not in listed_ids]
    if missing_in_list:
        with open(PRODUCT_LIST_FILE, "a", encoding="utf-8") as f:
            for pid in missing_in_list:
                f.write(pid + "\n")
        print(f"📝 product_list.txt 에 {len(missing_in_list)}개 상품번호를 추가했습니다.")

    # [3단계] 신규 상품 상세 수집 -> txt 추가 + Supabase 직접 삽입
    print(f"\n🚀 [3/3단계] 신규 {len(new_ids)}개 상품의 상세 정보를 수집합니다...")
    total_rows = 0
    db_rows = []
    fail_ids = []

    # 기존 txt 파일에 헤더가 있는지 확인
    has_header = False
    try:
        with open(DETAIL_LIST_FILE, "r", encoding="utf-8") as f:
            first = f.readline()
            has_header = first.startswith("원상품코드")
    except FileNotFoundError:
        pass

    mode = "a" if has_header else "w"
    with open(DETAIL_LIST_FILE, mode, encoding="utf-8") as f:
        if not has_header:
            f.write("\t".join(DETAIL_HEADERS) + "\n")

        for idx, pid in enumerate(new_ids, start=1):
            pdata = get_product_detail(token, pid)
            if not pdata:
                print(f"⚠️ [{idx}/{len(new_ids)}] {pid} 상세 정보 조회 실패")
                fail_ids.append(pid)
                continue

            rows = parse_product_rows(pid, pdata)
            for r in rows:
                f.write("\t".join(r) + "\n")
            db_rows.extend(rows_to_db_dicts(rows))
            total_rows += len(rows)

            name = rows[0][3][:25] if rows else "-"
            price = rows[0][5] if rows else "-"
            print(f"  - [{idx}/{len(new_ids)}] {pid} | {len(rows)}행 | {name} | 기본가격 {price}")
            time.sleep(0.6)

    # Supabase 배치 삽입 (신규 행만)
    inserted = 0
    for i in range(0, len(db_rows), BATCH_SIZE):
        batch = db_rows[i:i + BATCH_SIZE]
        supabase.table(TABLE_NAME).insert(batch).execute()
        inserted += len(batch)
        print(f"  ☁️ Supabase {inserted}/{len(db_rows)}행 삽입 완료")

    elapsed = time.time() - start_time
    print(f"\n✨ 완료! 신규 {len(new_ids) - len(fail_ids)}개 상품에서 {total_rows}행 처리되었습니다.")
    if fail_ids:
        print(f"⚠️ 조회 실패: {', '.join(fail_ids)}")
    print(f"💾 '{DETAIL_LIST_FILE}' 추가 및 Supabase 삽입 모두 완료되었습니다.")
    print(f"⏱️ 소요시간: {elapsed:.2f}초")


if __name__ == "__main__":
    main()
