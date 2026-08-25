import requests, bcrypt, base64, time, json

CLIENT_ID = "6qGLtWWL2ryrsoLgpvWdDd"
CLIENT_SECRET = "$2a$04$ONp/Q938mpD/LfX/Bzhl4O"

def get_access_token():
    url = "https://api.commerce.naver.com/external/v1/oauth2/token"
    timestamp = str(int(time.time() * 1000))
    password = f"{CLIENT_ID}_{timestamp}"
    hashed = bcrypt.hashpw(password.encode('utf-8'), CLIENT_SECRET.encode('utf-8'))
    client_secret_sign = base64.b64encode(hashed).decode('utf-8')
    payload = {"client_id": CLIENT_ID, "timestamp": timestamp, "client_secret_sign": client_secret_sign, "grant_type": "client_credentials", "type": "SELF"}
    res = requests.post(url, data=payload)
    return res.json().get("access_token") if res.status_code == 200 else None

token = get_access_token()
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

pid = "13399062334"
oid = "57973955726"

url = f"https://api.commerce.naver.com/external/v1/products/origin-products/{pid}/option-stock"
body = {
    "productSalePrice": {"salePrice": 4000},
    "optionInfo": {
        "optionCombinations": [{
            "id": oid,
            "stockQuantity": 9740,
            "usable": True
        }]
    }
}
print(f"PUT {url}")
print(f"Body: {json.dumps(body, indent=2, ensure_ascii=False)}")
res = requests.put(url, headers=headers, json=body, timeout=15)
print(f"\nStatus: {res.status_code}")
try:
    print(f"Result: {json.dumps(res.json(), indent=2, ensure_ascii=False)[:1000]}")
except:
    print(f"Result: {res.text[:500]}")
