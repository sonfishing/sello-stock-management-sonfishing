import os
import json
from supabase import create_client, Client

SUPABASE_URL = "https://ubwccmgpoghfecmgiici.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVid2NjbWdwb2doZmVjbWdpaWNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIwMDU1NSwiZXhwIjoyMDkxNzc2NTU1fQ.M49FLuvgGGe2M5oRt6MavxUH_Ju5r6Mr95PW6ujWq5g"

TABLE_NAME = "smartstore_products"
BATCH_SIZE = 500

def convert_txt_to_supabase(txt_filepath):
    if not os.path.exists(txt_filepath):
        print(f"'{txt_filepath}' 파일을 찾을 수 없습니다.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # 기존 데이터 전체 삭제
    supabase.table(TABLE_NAME).delete().neq("id", 0).execute()
    print("기존 데이터를 모두 삭제했습니다.")

    rows = []
    with open(txt_filepath, "r", encoding="utf-8") as f:
        header = f.readline()

        for line in f:
            line = line.strip("\n\r")
            if not line:
                continue

            parts = line.split("\t")
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

            rows.append({
                "origin_product_no": parts[0].strip(),
                "category": parts[1].strip(),
                "option_id": parts[2].strip(),
                "option_name": parts[4].strip(),
                "name": parts[3].strip(),
                "base_price": base_price,
                "additional_price": add_price,
                "stock_quantity": stock,
                "status": parts[8].strip(),
                "seller_code": parts[9].strip(),
                "tags": parts[10].strip(),
                "display_status": parts[11].strip(),
            })

    total = len(rows)
    print(f"총 {total:,}개 행을 업로드합니다...")

    for i in range(0, total, BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        supabase.table(TABLE_NAME).insert(batch).execute()
        print(f"  {min(i + BATCH_SIZE, total):,}/{total:,} 완료")

    print("업로드 완료!")

if __name__ == "__main__":
    convert_txt_to_supabase("product_detail_list.txt")
