import time
import bcrypt
import requests
import base64
import json
import sys

# Windows 콘솔에서 인코딩 오류가 발생하지 않도록 설정
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# --------------------------------------------------
# [설정] 네이버 스마트스토어 API 인증 정보
# --------------------------------------------------
CLIENT_ID = "6qGLtWWL2ryrsoLgpvWdDd"
CLIENT_SECRET = "$2a$04$ONp/Q938mpD/LfX/Bzhl4O"

def get_access_token(client_id, client_secret):
    """네이버 커머스 API 토큰 발급"""
    url = "https://api.commerce.naver.com/external/v1/oauth2/token"
    timestamp = str(int(time.time() * 1000))
    password = f"{client_id}_{timestamp}"
    hashed = bcrypt.hashpw(password.encode('utf-8'), client_secret.encode('utf-8'))
    client_secret_sign = base64.b64encode(hashed).decode('utf-8')
    
    payload = {
        "client_id": client_id,
        "timestamp": timestamp,
        "client_secret_sign": client_secret_sign,
        "grant_type": "client_credentials",
        "type": "SELF"
    }
    
    response = requests.post(url, data=payload)
    if response.status_code == 200:
        return response.json().get("access_token")
    else:
        print(f"[FAIL] 토큰 발급 실패: {response.status_code} - {response.text}")
        return None

def get_all_product_ids(token):
    """검색 API를 사용하여 전체 상품 번호 목록을 수집합니다."""
    url = "https://api.commerce.naver.com/external/v1/products/search"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    origin_nos = []
    page = 1
    size = 100
    
    print("🔍 [1/2단계] 전체 상품 목록 조회를 시작합니다...")
    
    while True:
        payload = {"page": page, "size": size}
        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code != 200:
            print(f"❌ {page}페이지 조회 실패: {response.status_code} - {response.text}")
            break
            
        data = response.json()
        contents = data.get("contents", [])
        if not contents:
            break
            
        for prod in contents:
            origin_no = prod.get("originProductNo")
            if origin_no:
                origin_nos.append(str(origin_no))
                
        print(f"  - {page}페이지 수집 완료 ({len(contents)}개 상품)")
        time.sleep(0.3)
        page += 1
        
    print(f"✅ 총 {len(origin_nos)}개 상품 번호 수집 완료!\n")
    return origin_nos

def get_product_detail(token, origin_product_no):
    """원상품 상세 정보 API 호출"""
    url = f"https://api.commerce.naver.com/external/v2/products/origin-products/{origin_product_no}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json()
    
    # 404 시 채널 상품 시도
    url_ch = f"https://api.commerce.naver.com/external/v2/products/channel-products/{origin_product_no}"
    response_ch = requests.get(url_ch, headers=headers)
    if response_ch.status_code == 200:
        return response_ch.json()
    return None

def parse_product_rows(origin_no, product_data):
    """
    상품 상세 JSON 데이터를 분석하여 요청된 탭 구분 행 데이터 목록을 반환합니다.
    행 구조: [원상품코드, 구분, 옵션ID, 상품명, 옵션명, 기본가격, 추가금액, 재고수량, 판매상태, 관리코드, 태그, display_status]
    """
    rows = []
    origin_prod = product_data.get("originProduct", product_data)
    
    # 기본 상품 정보
    prod_name = str(origin_prod.get("name", "N/A")).replace("\n", " ").replace("\r", " ").replace("\t", " ")
    sale_price = origin_prod.get("salePrice", 0)

    def calc_discounted(price):
        """즉시할인(customerBenefit.immediateDiscountPolicy)이 반영된 최종 판매가 반환"""
        cb = origin_prod.get("customerBenefit") or {}
        disc = (cb.get("immediateDiscountPolicy") or {}).get("discountMethod") or {}
        val = disc.get("value", 0)
        unit = disc.get("unitType", "WON")
        if not isinstance(val, (int, float)) or val <= 0 or not isinstance(price, (int, float)):
            return price
        if unit == "PERCENT":
            return max(int(round(price * (100 - val) / 100)), 0)
        return max(int(price - val), 0)

    # 기본가격 = 즉시할인까지 계산된 금액 (할인 없으면 판매가 그대로)
    base_price = calc_discounted(sale_price)
    base_stock = origin_prod.get("stockQuantity", 0)
    seller_code = origin_prod.get("sellerManagementCode", "")
    
    status_type_map = {
        "SALE": "판매중",
        "OUT_OF_STOCK": "품절",
        "SUSPENSION": "판매중지",
        "UNAPPROVED": "승인대기",
        "CLOSE": "전시중지"
    }
    raw_status = origin_prod.get("statusType", "SALE")
    base_status = status_type_map.get(raw_status, raw_status)

    # 원상품 전시상태 (채널 상품 전시 상태 필드)
    display_status_map = {
        "ON": "전시중",
        "WAIT": "전시대기",
        "SUSPENSION": "전시중지"
    }
    channel_prod = product_data.get("smartstoreChannelProduct", {})
    raw_display = channel_prod.get("channelProductDisplayStatusType", "")
    base_display = display_status_map.get(raw_display, raw_display)

    detail_attr = origin_prod.get("detailAttribute", {})
    
    # 태그 추출
    seo_info = detail_attr.get("seoInfo", {})
    seller_tags = seo_info.get("sellerTags", [])
    tag_list = [tag.get("text") for tag in seller_tags if isinstance(tag, dict) and tag.get("text")]
    tags_str = ", ".join(tag_list) if tag_list else ""
    
    # 옵션 및 추가옵션 정보
    option_info = detail_attr.get("optionInfo", {})
    option_combinations = option_info.get("optionCombinations", [])
    
    supp_info = detail_attr.get("supplementProductInfo", {})
    supp_products = supp_info.get("supplementProducts", [])
    
    # 1. 일반 옵션 처리
    if option_combinations:
        for item in option_combinations:
            opt_id = str(item.get("id", ""))
            opt_names = [item.get(f"optionName{i}") for i in range(1, 4) if item.get(f"optionName{i}")]
            opt_name_str = " / ".join(opt_names)  # 옵션명만 별도 추출
            opt_price = item.get("price", 0)  # 추가/차감 금액
            stock = item.get("stockQuantity", 0)
            usable = item.get("usable", True)
            opt_status = "판매중" if usable and stock > 0 else ("품절" if stock == 0 else "사용불가")
            opt_code = item.get("sellerManagerCode", "")
            
            rows.append([
                origin_no,
                "일반옵션",
                opt_id,
                prod_name,        # 상품명
                opt_name_str,     # 옵션명
                str(base_price),  # 기본가격 (할인 반영 원상품 기본가)
                str(opt_price),   # 추가금액 (옵션 추가/차감 금액)
                str(stock),
                opt_status,
                opt_code,
                tags_str,
                "Y" if usable else "N"  # display_status (사용여부)
            ])
            
    # 2. 추가 옵션 처리
    if supp_products:
        for supp in supp_products:
            supp_id = str(supp.get("id", ""))
            group_n = supp.get("groupName", "추가상품")
            name_val = supp.get("name", "")
            supp_opt_name = f"[{group_n}] {name_val}"  # 추가옵션명
            supp_price = supp.get("price", 0)  # 추가옵션 자체의 가격
            supp_stock = supp.get("stockQuantity", 0)
            usable = supp.get("usable", True)
            supp_status = "판매중" if usable and supp_stock > 0 else ("품절" if supp_stock == 0 else "사용불가")
            supp_code = supp.get("sellerManagementCode", "")
            
            rows.append([
                origin_no,
                "추가옵션",
                supp_id,
                prod_name,        # 상품명 (원상품명)
                supp_opt_name,    # 옵션명 ([그룹명] 항목명)
                str(supp_price),  # 기본가격 (추가옵션 자체 가격, 할인 미적용)
                "0",              # 추가금액
                str(supp_stock),
                supp_status,
                supp_code,
                tags_str,
                "Y" if usable else "N"  # display_status (사용여부)
            ])
            
    # 3. 둘 다 없는 경우 (단일 상품 원상품 행 1개)
    if not option_combinations and not supp_products:
        rows.append([
            origin_no,
            "원상품",
            "",
            prod_name,        # 상품명
            "",               # 옵션명 (없음)
            str(base_price),  # 기본가격 (할인 반영 원상품 판매가)
            "0",              # 추가금액
            str(base_stock),
            base_status,
            seller_code,
            tags_str,
            base_display  # display_status (전시상태)
        ])
        
    return rows

def get_product_ids_from_file(filepath):
    """product_list.txt 파일에서 원상품 코드 목록을 읽어옵니다."""
    origin_nos = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(",")
            origin_no = parts[0].strip()
            if origin_no:
                origin_nos.append(origin_no)
    return origin_nos

def main():
    token = get_access_token(CLIENT_ID, CLIENT_SECRET)
    if not token:
        print("토큰 발급 실패로 종료합니다.")
        return

    origin_nos = get_product_ids_from_file("product_list.txt")
    if not origin_nos:
        origin_nos = get_all_product_ids(token)
    total_products = len(origin_nos)
    
    output_filename = "product_detail_list.txt"
    headers_list = ["원상품코드", "구분", "옵션ID", "상품명", "옵션명", "기본가격", "추가금액", "재고수량", "판매상태", "관리코드", "태그", "display_status"]
    
    print(f"📦 [2/2단계] {total_products}개 상품의 상세 옵션 정보를 조회를 시작합니다...")
    start_time = time.time()
    total_written_rows = 0
    
    try:
        with open(output_filename, "w", encoding="utf-8") as f:
            # 헤더 출력
            f.write("\t".join(headers_list) + "\n")
            
            for idx, origin_no in enumerate(origin_nos, start=1):
                pdata = get_product_detail(token, origin_no)
                if pdata:
                    rows = parse_product_rows(origin_no, pdata)
                    for r in rows:
                        f.write("\t".join(r) + "\n")
                    total_written_rows += len(rows)
                else:
                    print(f"⚠️ [{idx}/{total_products}] {origin_no} 상세 정보 조회 실패")
                    
                if idx % 50 == 0 or idx == total_products:
                    print(f"  - 진행률: {idx}/{total_products} ({idx/total_products*100:.1f}%) | 누적 추출 행: {total_written_rows}개")
                    
                time.sleep(0.6)
                
        end_time = time.time()
        print(f"\n✨ 조회가 완료되었습니다!")
        print(f"📊 총 {total_products}개 상품에서 {total_written_rows}개 데이터 행이 생성되었습니다.")
        print(f"💾 결과가 '{output_filename}' 파일에 탭 구분(TSV) 형식으로 저장되었습니다.")
        print(f"⏱️ 소요시간: {end_time - start_time:.2f}초")
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")

if __name__ == "__main__":
    main()
