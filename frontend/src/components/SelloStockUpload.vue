<template>
  <div class="upload-container sello-upload">
    <div class="upload-area" @dragover.prevent @drop.prevent="handleDrop">
      <input type="file" accept=".xlsx, .xls" @change="handleFileSelect" ref="fileInput" />
      <div class="upload-hint">
        <p>📦 <strong>셀로 재고수정 엑셀</strong>을 선택하거나 여기로 드래그하세요</p>
        <p class="format-hint">필수 컬럼: 일련번호(serial_number), 재고</p>
      </div>
    </div>

    <div v-if="previewData.length > 0" class="preview-section">
      <div class="preview-header">
        <h3>📊 반영 대기 데이터 ({{ previewData.length }} 건)</h3>
        <div class="action-btns">
          <button @click="uploadToSupabase" :disabled="isUploading" class="primary-btn">
            {{ isUploading ? '반영 중...' : '재고 반영하기' }}
          </button>
          <button @click="clearData" class="secondary-btn">초기화</button>
        </div>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>일련번호</th>
              <th>관리상품명</th>
              <th>현재고</th>
              <th>변경후</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in previewData" :key="index" :class="{ 'error-row': row.error }">
              <td>{{ row.serial_number }}</td>
              <td>{{ row.manage_name }}</td>
              <td>{{ row.current_qty ?? '-' }}</td>
              <td class="new-qty">{{ row.new_qty }}</td>
              <td>
                <span v-if="row.error" class="error-badge">{{ row.error }}</span>
                <span v-else class="success-badge">매칭완료</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";

const emit = defineEmits(['onUploadSuccess']);
const fileInput = ref(null);
const previewData = ref([]);
const isUploading = ref(false);

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) parseSelloExcel(file);
}

function handleDrop(event) {
  const file = event.dataTransfer.files[0];
  if (file) parseSelloExcel(file);
}

async function parseSelloExcel(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet);

    // 1. 필요한 데이터 추출 및 매핑 (일련번호를 문자열로 정규화)
    const rows = jsonData.map(row => {
      const snValue = row['일련번호'] || row['serial_number'];
      return {
        serial_number: snValue ? String(snValue).trim() : null,
        manage_name: row['관리상품명'] || row['manage_name'],
        new_qty: row['재고'] || row['quantity'],
        current_qty: null,
        error: null
      };
    }).filter(row => row.serial_number);

    // 2. 현재 DB 재고 확인 (매칭 작업)
    const sns = rows.map(r => r.serial_number);
    const { data: dbProducts } = await supabase
      .from('products')
      .select('serial_number, manage_name, quantity')
      .in('serial_number', sns);

    const dbMap = {};
    dbProducts?.forEach(p => {
      // DB의 일련번호도 문자열로 정규화하여 매핑
      const snKey = String(p.serial_number).trim();
      dbMap[snKey] = p;
    });

    previewData.value = rows.map(row => {
      const dbMatch = dbMap[row.serial_number];
      if (!dbMatch) {
        row.error = "미등록 일련번호";
      } else {
        row.current_qty = dbMatch.quantity;
        if (!row.manage_name) row.manage_name = dbMatch.manage_name;
      }
      return row;
    });
  };
  reader.readAsArrayBuffer(file);
}

async function uploadToSupabase() {
  const validRows = previewData.value.filter(r => !r.error);
  if (validRows.length === 0) return;

  isUploading.value = true;
  try {
    // 순차적으로 업데이트 (트리거가 각각 작동해야 하므로)
    let successCount = 0;
    for (const row of validRows) {
      const { error } = await supabase
        .from('products')
        .update({ quantity: row.new_qty })
        .eq('serial_number', row.serial_number);
      
      if (!error) successCount++;
    }

    alert(`${successCount}건의 재고가 성공적으로 반영되었습니다.\n(변동 이력 및 셀로 대기열 자동 생성됨)`);
    emit('onUploadSuccess');
    clearData();
  } catch (err) {
    alert("업로드 중 오류 발생: " + err.message);
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
  border: 2px dashed var(--border-color);
  padding: 40px;
  text-align: center;
  border-radius: 12px;
  background: var(--bg-main);
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
}
.upload-area:hover {
  border-color: var(--primary);
  background: white;
}
.upload-area input {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  opacity: 0; cursor: pointer;
}
.format-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 10px;
}
.preview-section {
  margin-top: 30px;
}
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}
.primary-btn {
  background: var(--primary);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
.secondary-btn {
  background: none;
  border: 1px solid var(--border-color);
  padding: 10px 20px;
  border-radius: 8px;
  margin-left: 10px;
  cursor: pointer;
}
.table-wrapper {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}
th {
  background: var(--bg-main);
  position: sticky; top: 0;
}
.new-qty {
  color: var(--primary);
  font-weight: bold;
}
.error-badge {
  color: #ff4d4f;
  background: #fff2f0;
  padding: 2px 6px;
  border-radius: 4px;
}
.success-badge {
  color: #52c41a;
  background: #f6ffed;
  padding: 2px 6px;
  border-radius: 4px;
}
.error-row {
  background: #fff1f0;
}
</style>
