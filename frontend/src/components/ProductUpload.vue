<template>
  <div class="upload-container">
    <h2>엑셀 파일 업로드</h2>

    <div class="upload-area" @dragover.prevent @drop.prevent="handleDrop">
      <input type="file" accept=".xlsx, .xls" @change="handleFileSelect" ref="fileInput" />
      <div class="upload-hint">
        <p>엑셀 파일을 선택하거나 여기로 드래그하세요</p>
        <p class="format-hint">컬럼: 일련번호, 이미지URL, 관리코드, 관리상품명, 인쇄상품명, 메모, 사입처, 사입단가, 소비자가, 위치, 재고, 안전재고, 바코드, 바코드포멧, 무게, 운임금액, 규격, 등록일시, 수정일시, 숨김여부</p>
      </div>
    </div>

    <div v-if="previewData.length > 0" class="preview-section">
      <h3>데이터 미리보기 ({{ previewData.length }} 행)</h3>

      <div class="validation-summary">
        <span :class="['badge', hasErrors ? 'error' : 'success']">
          {{ hasErrors ? '에러 발생' : '정상' }}
        </span>
        <button @click="uploadToSupabase" :disabled="hasErrors || isUploading">
          {{ isUploading ? '업로드 중...' : 'DB로 업로드' }}
        </button>
        <button @click="clearData" class="secondary">초기화</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>행</th>
              <th>상태</th>
              <th>일련번호</th>
              <th>이미지URL</th>
              <th>관리코드</th>
              <th>관리상품명</th>
              <th>인쇄상품명</th>
              <th>메모</th>
              <th>사입처</th>
              <th>사입단가</th>
              <th>소비자가</th>
              <th>위치</th>
              <th>재고</th>
              <th>안전재고</th>
              <th>바코드</th>
              <th>바코드포멧</th>
              <th>무게</th>
              <th>운임금액</th>
              <th>규격</th>
              <th>숨김여부</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in previewData" :key="index" :class="{ 'error-row': row.errors?.length }">
              <td>{{ index + 2 }}</td>
              <td>
                <span v-if="row.errors?.length" class="error-badge">에러</span>
                <span v-else class="success-badge">정상</span>
              </td>
              <td>{{ row.serial_number }}</td>
              <td>{{ row.image_url }}</td>
              <td>{{ row.manage_code }}</td>
              <td>{{ row.manage_name }}</td>
              <td>{{ row.print_name }}</td>
              <td>{{ row.memo }}</td>
              <td>{{ row.supplier }}</td>
              <td>{{ row.purchase_price }}</td>
              <td>{{ row.consumer_price }}</td>
              <td>{{ row.location }}</td>
              <td>{{ row.quantity }}</td>
              <td>{{ row.safety_quantity }}</td>
              <td>{{ row.barcode }}</td>
              <td>{{ row.barcode_format }}</td>
              <td>{{ row.weight }}</td>
              <td>{{ row.freight_amount }}</td>
              <td>{{ row.spec }}</td>
              <td>{{ row.is_hidden }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="errorSummary.length > 0" class="error-summary">
        <h4>에러 요약</h4>
        <ul>
          <li v-for="(error, index) in errorSummary" :key="index">{{ error }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";

const fileInput = ref(null);
const previewData = ref([]);
const isUploading = ref(false);

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) parseExcel(file);
}

function handleDrop(event) {
  const file = event.dataTransfer.files[0];
  if (file) parseExcel(file);
}

function parseExcel(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const headers = jsonData[0] || [];
    const rows = jsonData.slice(1);

    // [최적화] 헤더 인덱스를 미리 맵핑하여 매행 루프에서 findIndex 호출 방지
    const headerMap = {};
    headers.forEach((h, idx) => {
      if (h) headerMap[String(h).trim()] = idx;
    });

    const getValue = (row, key) => {
      const idx = headerMap[key];
      return idx !== undefined ? row[idx] : null;
    };

    previewData.value = rows
      .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ""))
      .map((row) => {
        const item = {
          serial_number: getValue(row, "일련번호") ? Number(getValue(row, "일련번호")) : (getValue(row, "serial_number") ? Number(getValue(row, "serial_number")) : null),
          image_url: getValue(row, "이미지URL") || getValue(row, "image_url") || null,
          manage_code: getValue(row, "관리코드") || getValue(row, "manage_code") || getValue(row, "Manage Code") || "",
          manage_name: getValue(row, "관리상품명") || getValue(row, "manage_name") || getValue(row, "Product Name") || "",
          print_name: getValue(row, "인쇄상품명") || getValue(row, "print_name") || getValue(row, "Print Name") || null,
          memo: getValue(row, "메모") || getValue(row, "memo") || null,
          quantity: Number(getValue(row, "재고")) || Number(getValue(row, "quantity")) || Number(getValue(row, "Qty")) || 0,
          safety_quantity: Number(getValue(row, "안전재고")) || Number(getValue(row, "safety_quantity")) || 0,
          purchase_price: Number(getValue(row, "사입단가")) || Number(getValue(row, "purchase_price")) || Number(getValue(row, "Purchase Price")) || 0,
          consumer_price: Number(getValue(row, "소비자가")) || Number(getValue(row, "consumer_price")) || Number(getValue(row, "Consumer Price")) || 0,
          supplier: getValue(row, "사입처") || getValue(row, "supplier") || getValue(row, "Supplier") || null,
          location: getValue(row, "위치") || getValue(row, "location") || getValue(row, "Location") || null,
          barcode: getValue(row, "바코드") || getValue(row, "barcode") || null,
          barcode_format: getValue(row, "바코드포멧") || getValue(row, "barcode_format") || null,
          weight: getValue(row, "무게") || getValue(row, "weight") || null,
          freight_amount: getValue(row, "운임금액") || getValue(row, "freight_amount") || null,
          spec: getValue(row, "규격") || getValue(row, "spec") || getValue(row, "Spec") || null,
          registered_at: getValue(row, "등록일시") || getValue(row, "registered_at") || null,
          updated_at: getValue(row, "수정일시") || getValue(row, "updated_at") || null,
          is_hidden: getValue(row, "숨김여부") === "숨김" ? true : (getValue(row, "is_hidden") === true || getValue(row, "is_hidden") === "true" || getValue(row, "is_hidden") === "true" ? true : false),
          errors: [],
        };

        if (!item.manage_name) {
          item.errors.push("상품명은 필수입니다");
        }

        return item;
      });
  };
  reader.readAsArrayBuffer(file);
}

const hasErrors = computed(() => previewData.value.some((row) => row.errors?.length > 0));

const errorSummary = computed(() => {
  const errors = new Set();
  previewData.value.forEach((row) => {
    row.errors?.forEach((e) => errors.add(e));
  });
  return Array.from(errors);
});

// Helper function to parse Korean date format
function parseKoreanDate(dateStr) {
  if (!dateStr) return null;
  try {
    let cleanStr = String(dateStr).trim();
    cleanStr = cleanStr.replace('오전', 'AM').replace('오후', 'PM');
    const date = new Date(cleanStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

// Transform row data for Supabase
function transformRow(row) {
  return {
    serial_number: row.serial_number ? Number(row.serial_number) : null,
    image_url: row.image_url,
    manage_code: row.manage_code,
    manage_name: row.manage_name,
    print_name: row.print_name,
    memo: row.memo,
    quantity: row.quantity,
    safety_quantity: row.safety_quantity,
    purchase_price: row.purchase_price,
    consumer_price: row.consumer_price,
    supplier: row.supplier,
    location: row.location,
    barcode: row.barcode,
    barcode_format: row.barcode_format,
    weight: row.weight,
    freight_amount: row.freight_amount,
    spec: row.spec,
    is_hidden: row.is_hidden,
    registered_at: parseKoreanDate(row.registered_at),
    updated_at: new Date().toISOString()
  };
}

async function uploadToSupabase() {
  if (hasErrors.value) return;
  isUploading.value = true;

  // 에러 없는 데이터만 필터링 및 변환
  const validRows = previewData.value
    .filter((row) => !row.errors?.length && row.serial_number)
    .map(transformRow);

  if (validRows.length === 0) {
    isUploading.value = false;
    return;
  }

  try {
    // 1. 1,000개 단위로 청크(Chunk) 분할
    const chunkSize = 1000;
    const uploadPromises = [];

    for (let i = 0; i < validRows.length; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize);
      
      // [최적화] 모든 요청을 병렬로 실행하여 대기 시간 단축
      uploadPromises.push(
        supabase
          .from("products")
          .upsert(chunk, { 
            onConflict: 'serial_number',
            ignoreDuplicates: false 
          })
      );
    }

    // 모든 병렬 요청 완료 대기
    const results = await Promise.all(uploadPromises);
    
    // 에러 발생 여부 확인
    const errors = results.filter(r => r.error).map(r => r.error);
    if (errors.length > 0) throw errors[0];

    alert(`성공적으로 처리되었습니다! (총 ${validRows.length}건)`);
    previewData.value = [];
  } catch (error) {
    console.error("Upload error:", error);
    alert(`실패: ${error.message}`);
  } finally {
    isUploading.value = false;
  }
}

function clearData() {
  previewData.value = [];
  if (fileInput.value) fileInput.value.value = "";
}
</script>

<style scoped>
.upload-container {
  padding: 20px;
}

.upload-area {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  margin-bottom: 20px;
  position: relative;
}

.upload-area input[type="file"] {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.upload-hint p {
  margin: 5px 0;
}

.format-hint {
  font-size: 12px;
  color: #666;
}

.preview-section {
  margin-top: 20px;
}

.validation-summary {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 15px;
}

.badge {
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 14px;
}

.badge.error {
  background: #ffebee;
  color: #c62828;
}

.badge.success {
  background: #e8f5e9;
  color: #2e7d32;
}

.table-wrapper {
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #ddd;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th, td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

th {
  background: #f5f5f5;
  position: sticky;
  top: 0;
}

.error-row {
  background: #ffebee;
}

.error-badge {
  color: #c62828;
  font-weight: bold;
}

.success-badge {
  color: #2e7d32;
}

.error-summary {
  margin-top: 15px;
  padding: 10px;
  background: #ffebee;
  border-radius: 4px;
}

button {
  padding: 8px 16px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

button.secondary {
  background: #666;
}
</style>