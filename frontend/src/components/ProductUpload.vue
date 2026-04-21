<template>
  <div class="upload-container">
    <h2>Excel File Upload</h2>

    <div class="upload-area" @dragover.prevent @drop.prevent="handleDrop">
      <input type="file" accept=".xlsx, .xls" @change="handleFileSelect" ref="fileInput" />
      <div class="upload-hint">
        <p>Select Excel file or drag and drop here</p>
        <p class="format-hint">Columns: 일련번호, 이미지URL, 관리코드, 관리상품명, 인쇄상품명, 메모, 사입처, 사입단가, 소비자가, 위치, 재고, 안전재고, 바코드, 바코드포멧, 무게, 운임금액, 규격, 등록일시, 수정일시, 숨김여부</p>
      </div>
    </div>

    <div v-if="previewData.length > 0" class="preview-section">
      <h3>Data Preview ({{ previewData.length }} rows)</h3>

      <div class="validation-summary">
        <span :class="['badge', hasErrors ? 'error' : 'success']">
          {{ hasErrors ? 'Has Errors' : 'Valid' }}
        </span>
        <button @click="uploadToSupabase" :disabled="hasErrors || isUploading">
          {{ isUploading ? 'Uploading...' : 'Upload to Supabase' }}
        </button>
        <button @click="clearData" class="secondary">Clear</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Status</th>
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
                <span v-if="row.errors?.length" class="error-badge">Error</span>
                <span v-else class="success-badge">OK</span>
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
        <h4>Error Summary</h4>
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

    previewData.value = rows
      .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ""))
      .map((row) => {
        const item = {
          serial_number: getCellValue(row, headers, "일련번호") ? Number(getCellValue(row, headers, "일련번호")) : (getCellValue(row, headers, "serial_number") ? Number(getCellValue(row, headers, "serial_number")) : null),
          image_url: getCellValue(row, headers, "이미지URL") || getCellValue(row, headers, "image_url") || null,
          manage_code: getCellValue(row, headers, "관리코드") || getCellValue(row, headers, "manage_code") || getCellValue(row, headers, "Manage Code") || "",
          manage_name: getCellValue(row, headers, "관리상품명") || getCellValue(row, headers, "manage_name") || getCellValue(row, headers, "Product Name") || "",
          print_name: getCellValue(row, headers, "인쇄상품명") || getCellValue(row, headers, "print_name") || getCellValue(row, headers, "Print Name") || null,
          memo: getCellValue(row, headers, "메모") || getCellValue(row, headers, "memo") || null,
          quantity: Number(getCellValue(row, headers, "재고")) || Number(getCellValue(row, headers, "quantity")) || Number(getCellValue(row, headers, "Qty")) || 0,
          safety_quantity: Number(getCellValue(row, headers, "안전재고")) || Number(getCellValue(row, headers, "safety_quantity")) || 0,
          purchase_price: Number(getCellValue(row, headers, "사입단가")) || Number(getCellValue(row, headers, "purchase_price")) || Number(getCellValue(row, headers, "Purchase Price")) || 0,
          consumer_price: Number(getCellValue(row, headers, "소비자가")) || Number(getCellValue(row, headers, "consumer_price")) || Number(getCellValue(row, headers, "Consumer Price")) || 0,
          supplier: getCellValue(row, headers, "사입처") || getCellValue(row, headers, "supplier") || getCellValue(row, headers, "Supplier") || null,
          location: getCellValue(row, headers, "위치") || getCellValue(row, headers, "location") || getCellValue(row, headers, "Location") || null,
          barcode: getCellValue(row, headers, "바코드") || getCellValue(row, headers, "barcode") || null,
          barcode_format: getCellValue(row, headers, "바코드포멧") || getCellValue(row, headers, "barcode_format") || null,
          weight: getCellValue(row, headers, "무게") || getCellValue(row, headers, "weight") || null,
          freight_amount: getCellValue(row, headers, "운임금액") || getCellValue(row, headers, "freight_amount") || null,
          spec: getCellValue(row, headers, "규격") || getCellValue(row, headers, "spec") || getCellValue(row, headers, "Spec") || null,
          registered_at: getCellValue(row, headers, "등록일시") || getCellValue(row, headers, "registered_at") || null,
          updated_at: getCellValue(row, headers, "수정일시") || getCellValue(row, headers, "updated_at") || null,
          is_hidden: getCellValue(row, headers, "숨김여부") === "숨김" ? true : (getCellValue(row, headers, "is_hidden") === true || getCellValue(row, headers, "is_hidden") === "true" || getCellValue(row, headers, "is_hidden") === "true" ? true : false),
          errors: [],
        };

        if (!item.manage_name) {
          item.errors.push("Product name is required");
        }

        return item;
      });
  };
  reader.readAsArrayBuffer(file);
}

function getCellValue(row, headers, key) {
  const colIndex = headers.findIndex((h) => String(h).trim() === key);
  if (colIndex === -1) return null;
  return row[colIndex];
}

const hasErrors = computed(() => previewData.value.some((row) => row.errors?.length > 0));

const errorSummary = computed(() => {
  const errors = new Set();
  previewData.value.forEach((row) => {
    row.errors?.forEach((e) => errors.add(e));
  });
  return Array.from(errors);
});

async function uploadToSupabase() {
  if (hasErrors.value) return;

  isUploading.value = true;
  const rowsWithErrors = previewData.value.filter((row) => row.errors?.length);
  const rowsWithoutErrors = previewData.value.filter((row) => !row.errors?.length);

  // Separate rows with and without serial_number
  const rowsWithSerial = [];
  const rowsWithoutSerial = [];
  rowsWithoutErrors.forEach(row => {
    const serial = row.serial_number;
    if (serial !== null && serial !== undefined && serial !== '' && !isNaN(Number(serial))) {
      rowsWithSerial.push(row);
    } else {
      rowsWithoutSerial.push(row);
    }
  });

  // Helper function to parse Korean date format
  function parseKoreanDate(dateStr) {
    if (!dateStr) return null;
    try {
      // Handle Korean format: "2026-04-03 오전 11:54:54" or "2026-03-06 오후 10:59:17"
      let cleanStr = String(dateStr).trim();
      // Replace Korean AM/PM
      cleanStr = cleanStr.replace('오전', 'AM').replace('오후', 'PM');
      const date = new Date(cleanStr);
      if (isNaN(date.getTime())) return null;
      return date.toISOString();
    } catch {
      return null;
    }
  }

  // Transform data to match Supabase schema (exclude 'errors' field)
  const transformRow = (row) => ({
    serial_number: row.serial_number,
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
    updated_at: parseKoreanDate(row.updated_at)
  });

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = rowsWithoutSerial.length + rowsWithErrors.length;

  try {
    // Process rows with serial_number: upsert based on serial_number
    for (const row of rowsWithSerial) {
      const data = transformRow(row);
      const serial = data.serial_number;

      // Check if product with this serial_number exists
      const { data: existingData, error: checkError } = await supabase
        .from("products")
        .select("id")
        .eq("serial_number", serial)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows returned
        console.error("Error checking existing product:", checkError);
        throw checkError;
      }

      if (existingData) {
        // Update existing
        const { data: updateData, error: updateError } = await supabase
          .from("products")
          .update({
            ...data,
            updated_at: new Date().toISOString()
          })
          .eq("serial_number", serial);

        if (updateError) throw updateError;
        updatedCount++;
      } else {
         // Insert new
         const { data: insertData, error: insertError } = await supabase
           .from("products")
           .insert([{
             ...data,
             updated_at: new Date().toISOString()
           }]);

        if (insertError) throw insertError;
        insertedCount++;
      }
    }

    // Prepare message
    let message = `Processed: ${insertedCount} inserted, ${updatedCount} updated`;
    if (skippedCount > 0) {
      message += `, ${skippedCount} skipped (missing or invalid serial number)`;
    }
    alert(message);

    previewData.value = [];
  } catch (error) {
    console.error("Upload error:", error);
    alert(`Upload failed: ${error.message}`);
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