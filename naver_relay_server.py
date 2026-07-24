import time
import bcrypt
import requests
import base64
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

CLIENT_ID = "6qGLtWWL2ryrsoLgpvWdDd"
CLIENT_SECRET = "$2a$04$ONp/Q938mpD/LfX/Bzhl4O"

app = Flask(__name__)
CORS(app)


def get_access_token(client_id, client_secret):
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

    res = requests.post(url, data=payload)
    if res.status_code == 200:
        return res.json().get("access_token")
    else:
        raise Exception(f"토큰 발급 실패: {res.status_code} - {res.text}")


def update_naver_stock(token, product, new_stock_quantity):
    category = product.get("category", "")
    origin_product_no = product.get("origin_product_no")
    option_id = product.get("option_id")

    if category == "일반옵션":
        if not origin_product_no or not option_id:
            raise Exception("일반옵션: origin_product_no, option_id 필요")
        url = f"https://api.commerce.naver.com/external/v1/products/{origin_product_no}/options/{option_id}/stock"
    elif category == "추가옵션":
        if not origin_product_no or not option_id:
            raise Exception("추가옵션: origin_product_no, option_id 필요")
        url = f"https://api.commerce.naver.com/external/v1/products/{origin_product_no}/supplement-products/{option_id}/stock"
    elif category == "원상품":
        if not origin_product_no:
            raise Exception("원상품: origin_product_no 필요")
        url = f"https://api.commerce.naver.com/external/v1/products/{origin_product_no}/stock"
    else:
        raise Exception(f"알 수 없는 category: {category}")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    body = {"stockQuantity": new_stock_quantity}

    res = requests.put(url, headers=headers, json=body)
    if res.status_code != 200:
        raise Exception(f"스마트스토어 재고 업데이트 실패: {res.status_code} - {res.text}")
    return res.json()


@app.route("/update-stock", methods=["POST"])
def update_stock():
    try:
        data = request.get_json()
        if not data or "product" not in data or "newStockQuantity" not in data:
            return jsonify({"success": False, "message": "필수 파라미터 누락"}), 400

        token = get_access_token(CLIENT_ID, CLIENT_SECRET)
        result = update_naver_stock(token, data["product"], data["newStockQuantity"])
        return jsonify({"success": True, "data": result})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    print("=" * 50)
    print("Naver SmartStore Relay Server")
    print("=" * 50)
    print("서버 실행 중: http://localhost:5000")
    print("\nngrok 사용 시:")
    print("  ngrok http 5000")
    print("  → 생성된 https://xxxx.ngrok.io 주소를 사용")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5000, debug=True)
