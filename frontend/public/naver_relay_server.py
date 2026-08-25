import time
import bcrypt
import requests
import base64
import json
import subprocess
import sys
import threading
import os
from flask import Flask, request, jsonify
from flask_cors import CORS

CLIENT_ID = "6qGLtWWL2ryrsoLgpvWdDd"
CLIENT_SECRET = "$2a$04$ONp/Q938mpD/LfX/Bzhl4O"

# 신규 상품 동기화 스크립트(ss_sync_new.py)는 이 파일과 같은 디렉토리에 위치한다고 가정
# (Windows PC, Termux 폰 모두 경로에 구애받지 않도록 __file__ 기준으로 해석)
_HERE = os.path.dirname(os.path.abspath(__file__))
SYNC_SCRIPT_PATH = os.path.join(_HERE, "ss_sync_new.py")
SYNC_WORK_DIR = _HERE
_sync_lock = threading.Lock()

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

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    if category == "일반옵션":
        if not origin_product_no or not option_id:
            raise Exception("일반옵션: origin_product_no, option_id 필요")
        url = f"https://api.commerce.naver.com/external/v1/products/origin-products/{origin_product_no}/option-stock"
        body = {
            "productSalePrice": {"salePrice": product.get("base_price", 0)},
            "optionInfo": {
                "optionCombinations": [{
                    "id": option_id,
                    "stockQuantity": new_stock_quantity,
                    "usable": True
                }]
            }
        }
        res = requests.put(url, headers=headers, json=body)
        if res.status_code != 200:
            raise Exception(f"스마트스토어 재고 업데이트 실패: {res.status_code} - 요청URL: {url} - {res.text}")
        return res.json()

    elif category == "추가옵션":
        if not origin_product_no or not option_id:
            raise Exception("추가옵션: origin_product_no, option_id 필요")

        get_url = f"https://api.commerce.naver.com/external/v2/products/origin-products/{origin_product_no}"
        get_res = requests.get(get_url, headers=headers, timeout=15)
        if get_res.status_code != 200:
            raise Exception(f"상품 조회 실패: {get_res.status_code} - {get_res.text}")

        product_data = get_res.json()
        origin = product_data.get("originProduct", {})
        detail = origin.get("detailAttribute", {})
        supplement_info = detail.get("supplementProductInfo", {})
        supplements = supplement_info.get("supplementProducts", [])

        found = False
        for sp in supplements:
            if str(sp.get("id")) == str(option_id):
                sp["stockQuantity"] = new_stock_quantity
                sp["usable"] = True if new_stock_quantity > 0 else False
                found = True
                break

        if not found:
            raise Exception(f"추가옵션 ID {option_id}를 찾을 수 없습니다")

        put_url = f"https://api.commerce.naver.com/external/v2/products/origin-products/{origin_product_no}"
        detail_attr = origin.get("detailAttribute", {})
        put_body = {
            "originProduct": {
                **origin,
                "detailAttribute": {
                    **detail_attr,
                    "supplementProductInfo": supplement_info
                }
            }
        }
        put_res = requests.put(put_url, headers=headers, json=put_body, timeout=15)
        if put_res.status_code != 200:
            raise Exception(f"추가옵션 재고 업데이트 실패: {put_res.status_code} - {put_res.text}")
        return put_res.json()

    elif category == "원상품":
        if not origin_product_no:
            raise Exception("원상품: origin_product_no 필요")
        url = f"https://api.commerce.naver.com/external/v1/products/{origin_product_no}/stock"
        body = {"stockQuantity": new_stock_quantity}
        res = requests.put(url, headers=headers, json=body)
        if res.status_code != 200:
            raise Exception(f"스마트스토어 재고 업데이트 실패: {res.status_code} - 요청URL: {url} - {res.text}")
        return res.json()
    else:
        raise Exception(f"알 수 없는 category: {category}")


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


@app.route("/test-naver", methods=["GET"])
def test_naver():
    try:
        token = get_access_token(CLIENT_ID, CLIENT_SECRET)

        url = "https://api.commerce.naver.com/external/v1/products/search"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {"page": 1, "size": 10}

        res = requests.post(url, headers=headers, json=payload, timeout=15)
        if res.status_code != 200:
            raise Exception(f"상품 조회 실패: {res.status_code} - {res.text}")

        data = res.json()
        products = data.get("contents", [])
        sample = None
        if products:
            prod = products[0]
            prod_id = prod.get("originProductNo")
            prod_name = prod.get("name")
            if not prod_name:
                channels = prod.get("channelProducts", [])
                if channels:
                    prod_name = channels[0].get("name")
            if not prod_name:
                prod_name = prod.get("originProduct", {}).get("name")
            sample = {"originProductNo": prod_id, "name": prod_name}

        return jsonify({
            "success": True,
            "totalCount": len(products),
            "sample": sample
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/product/<product_id>", methods=["GET"])
def get_product(product_id):
    try:
        token = get_access_token(CLIENT_ID, CLIENT_SECRET)
        url = f"https://api.commerce.naver.com/external/v1/products/{product_id}"
        headers = {"Authorization": f"Bearer {token}"}
        res = requests.get(url, headers=headers, timeout=15)
        return jsonify({"success": res.status_code == 200, "status": res.status_code, "data": res.json() if res.status_code == 200 else res.text})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/sync-new-products", methods=["POST"])
def sync_new_products():
    """ss_sync_new.py 를 실행하여 신규 상품만 수집/동기화합니다."""
    if not _sync_lock.acquire(blocking=False):
        return jsonify({"success": False, "message": "이미 동기화가 실행 중입니다. 잠시 후 다시 시도하세요."}), 409

    try:
        proc = subprocess.run(
            [sys.executable, "-X", "utf8", SYNC_SCRIPT_PATH],
            cwd=SYNC_WORK_DIR,
            capture_output=True,
            timeout=600,
        )
        output = proc.stdout.decode("utf-8", errors="replace")
        err_output = proc.stderr.decode("utf-8", errors="replace")
        ok = proc.returncode == 0
        return jsonify({
            "success": ok,
            "returncode": proc.returncode,
            "output": output[-4000:],
            "error": err_output[-2000:] if err_output else "",
            "message": "완료" if ok else "스크립트 실행 오류",
        })
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "message": "실행 시간이 초과되었습니다(10분)."}), 500
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        _sync_lock.release()


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    print("Naver SmartStore Relay Server - http://0.0.0.0:5800")
    app.run(host="0.0.0.0", port=5800, debug=False)
