import time
import bcrypt
import requests
import base64

# --------------------------------------------------
# [설정] 여기에 네이버에서 발급받은 인증 정보를 넣으세요
# --------------------------------------------------
CLIENT_ID = "6qGLtWWL2ryrsoLgpvWdDd"
CLIENT_SECRET = "$2a$04$ONp/Q938mpD/LfX/Bzhl4O"

def get_access_token(client_id, client_secret):
    """네이버 커머스 API 요구 규격에 맞춰 서명을 생성하고 토큰을 발급받습니다."""
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
        print(f"❌ 토큰 발급 실패: {response.status_code} - {response.text}")
        return None

def get_product_list(token):
    """네이버 공식 스펙에 맞춰 상품 목록을 검색 조회합니다."""
    url = "https://api.commerce.naver.com/external/v1/products/search"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "page": 1,
        "size": 10
    }
    
    response = requests.post(url, headers=headers, json=payload)
    
    if response.status_code == 200:
        return response.json()
    else:
        print(f"❌ 상품 목록 조회 실패: {response.status_code} - {response.text}")
        return None

# --------------------------------------------------
# 메인 실행부 (들여쓰기가 철저히 계산된 안전 지대입니다)
# --------------------------------------------------
if __name__ == "__main__":
    print("🔄 1단계: 네이버 규격 서명 생성 및 토큰 발급 요청 중...")
    token = get_access_token(CLIENT_ID, CLIENT_SECRET)
    
    if token:
        print("✅ 토큰 발급 성공!")
        print("🔄 2단계: 상품 목록 조회 중...")
        
        product_data = get_product_list(token)
        
        if product_data:
            print("\n🎉 [조회 성공] 내 스토어 상품 요약 리스트:")
            print("-" * 50)
            
            products = product_data.get("contents", [])
            
            if not products:
                print("스토어에 등록된 상품이 없거나 다른 구조로 응답되었습니다.")
                print(product_data)
            
            # 💡 아래 반복문 내부의 모든 들여쓰기를 완벽하게 수동 조율했습니다.
            for index, prod in enumerate(products, 1):
                prod_id = prod.get("originProductNo")  # 원상품 번호
                
                # 네이버 최신 데이터 포맷 분석 결과 상품명 추출 우선순위 적용
                prod_name = None
                
                # 1단계: 최상위 name 필드가 직접 들어있는 경우
                if "name" in prod and prod["name"]:
                    prod_name = prod["name"]
                
                # 2단계: channelProducts 리스트 안에 묶여있는 경우
                if not prod_name:
                    channels = prod.get("channelProducts", [])
                    if channels and isinstance(channels, list):
                        prod_name = channels[0].get("name")
                        
                # 3단계: 복합 originProduct 객체 내부에 숨어있는 경우
                if not prod_name:
                    prod_name = prod.get("originProduct", {}).get("name")
                
                # 최종 안전장치
                if not prod_name:
                    prod_name = "상품명 파싱 불가 (데이터 구조 예외)"
                
                print(f"{index}. [{prod_id}] {prod_name}")
                
            print("-" * 50)
    else:
        print("⚠ 인증에 실패하여 상품 조회를 진행할 수 없습니다.")