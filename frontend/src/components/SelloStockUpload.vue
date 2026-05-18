<template>
  <div class="upload-container sello-upload">
    <div class="upload-area" @dragover.prevent @drop.prevent="handleDrop">
      <input type="file" accept=".xlsx, .xls" @change="handleFileSelect" ref="fileInput" />
      <div class="upload-hint">
        <p>📦 <strong>재고수정 엑셀</strong>을 선택하거나 여기로 드래그하세요</p>
        <p class="format-hint">필수 컬럼: 일련번호(serial_number), 재고</p>
      </div>
    </div>

    <div style="margin-top: 15px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="skipSelloUpload" v-model="skipSelloUpload" style="width: 18px; height: 18px; cursor: pointer;" />
        <label for="skipSelloUpload" style="cursor: pointer; font-weight: 500; color: var(--text-color);">셀로에서 업로드 (변경 내용 다운로드에 반영 없음)</label>
      </div>
      
      <div v-if="!skipSelloUpload" style="display: flex; flex-direction: column; gap: 10px; align-items: center; background: var(--surface); padding: 15px; border-radius: 8px; width: 100%; max-width: 600px; border: 1px solid var(--border-color);">
        <div style="display: flex; gap: 20px;">
          <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
            <input type="radio" v-model="updateMode" value="delta" /> 증감분 반영 (기존 재고에 더하기/빼기)
          </label>
          <label style="cursor: pointer; display: flex; align-items: center; gap: 4px;">
            <input type="radio" v-model="updateMode" value="absolute" /> 실재고 반영 (현재 전산 재고를 강제 변경)
          </label>
        </div>
        <div style="display: flex; width: 100%; align-items: center; gap: 8px;">
          <span style="white-space: nowrap; font-weight: 500;">사유:</span>
          <input type="text" v-model="customReason" placeholder="재고 변경 사유를 입력하세요 (선택)" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-main); color: var(--text-color);" />
        </div>
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
              <th>엑셀수량</th>
              <th>최종재고</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in previewData" :key="index" :class="{ 'error-row': row.error }">
              <td>{{ row.serial_number }}</td>
              <td>{{ row.manage_name }}</td>
              <td>{{ row.current_qty ?? '-' }}</td>
              <td>{{ row.new_qty > 0 && updateMode === 'delta' && !skipSelloUpload ? '+' + row.new_qty : row.new_qty }}</td>
              <td class="new-qty">{{ getFinalQty(row) }}</td>
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
const skipSelloUpload = ref(false);
const updateMode = ref('delta');
const customReason = ref('');

function getFinalQty(row) {
  if (row.current_qty === null) return '-';
  if (skipSelloUpload.value || updateMode.value === 'absolute') {
    return Number(row.new_qty);
  }
  return Number(row.current_qty) + Number(row.new_qty);
}

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

    const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    
    // 유연한 컬럼명 매칭 (트리밍 및 대소문자 무시)
    const findKey = (names) => headers.find(h => names.includes(String(h).trim().toLowerCase()));
    
    const snKey = findKey(['일련번호', 'serial_number', 'serial number', 'sn']);
    const nameKey = findKey(['관리상품명', 'manage_name', 'product_name', 'product name', 'name']);
    const qtyKey = findKey(['재고', 'quantity', 'qty', 'stock']);

    // 1. 필요한 데이터 추출 및 매핑
    const seenSns = new Set();
    const rows = jsonData.map(row => {
      const snValue = snKey ? row[snKey] : (row['일련번호'] || row['serial_number']);
      const nameValue = nameKey ? row[nameKey] : (row['관리상품명'] || row['manage_name']);
      const qtyValue = qtyKey ? row[qtyKey] : (row['재고'] || row['quantity'] || row['qty']);
      
      // 따옴표 제거 및 공백 정리
      const cleanSn = snValue ? String(snValue).replace(/["']/g, '').trim() : null;
      const cleanName = nameValue ? String(nameValue).replace(/["']/g, '').trim() : '';

      let error = null;
      if (cleanSn && seenSns.has(cleanSn)) {
        error = "중복된 일련번호 (엑셀)";
      } else if (cleanSn) {
        seenSns.add(cleanSn);
      }

      return {
        serial_number: cleanSn,
        manage_name: cleanName,
        new_qty: qtyValue !== undefined ? Number(qtyValue) : 0,
        current_qty: null,
        error: error
      };
    }).filter(row => row.serial_number);

    // 2. 현재 DB 재고 확인 (매칭 작업 - 500건씩 청크로 조회하여 Supabase 1000건 제한 우회)
    const sns = rows.map(r => r.serial_number);
    let dbProducts = [];
    const queryChunkSize = 500;

    for (let i = 0; i < sns.length; i += queryChunkSize) {
      const chunkSns = sns.slice(i, i + queryChunkSize);
      const { data, error } = await supabase
        .from('products')
        .select('id, serial_number, manage_name, quantity')
        .in('serial_number', chunkSns);
      
      if (error) {
        console.error("DB Match Chunk Error:", error);
      } else if (data) {
        dbProducts = dbProducts.concat(data);
      }
    }

    const dbMap = {};
    dbProducts?.forEach(p => {
      const snKey = String(p.serial_number).trim();
      dbMap[snKey] = p;
    });

    previewData.value = rows.map(row => {
      const dbMatch = dbMap[row.serial_number];
      if (!dbMatch) {
        row.error = "미등록 일련번호";
      } else {
        row.current_qty = dbMatch.quantity;
        // PK(id)를 직접 보관하여 가장 확실한 업데이트 방법 제공
        row.db_id = dbMatch.id;
        row.db_serial_number = dbMatch.serial_number;
        if (!row.manage_name) row.manage_name = dbMatch.manage_name;
      }
      return row;
    });
  };
  reader.readAsArrayBuffer(file);
}

async function uploadToSupabase() {
  // 변동된 재고 정보 필터링
  const validRows = previewData.value.filter(r => {
    if (r.error || r.current_qty === null) return false;
    let finalQty = getFinalQty(r);
    return Number(r.current_qty) !== Number(finalQty);
  });
  
  if (validRows.length === 0) {
    alert("변경할 재고 정보가 없거나 이미 최신 상태입니다.");
    return;
  }

  isUploading.value = true;
  try {
    // 500개 단위로 청크 분할하여 업로드 (성능 최적화)
    const chunkSize = 500;

    for (let i = 0; i < validRows.length; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize);
      
      const updatePromises = chunk.map(row => {
        let finalNewQty = 0;
        let finalChangeQty = 0;
        let source_type = 'EXCEL_UPLOAD';
        let reason = customReason.value || '엑셀 업로드';

        if (skipSelloUpload.value) {
          finalNewQty = Number(row.new_qty);
          finalChangeQty = finalNewQty - Number(row.current_qty);
          source_type = 'SELLO_ORDER';
          const today = new Date();
          const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          reason = `${dateStr} 셀로 업로드`;
        } else {
          if (updateMode.value === 'delta') {
            finalChangeQty = Number(row.new_qty);
            finalNewQty = Number(row.current_qty) + finalChangeQty;
          } else {
            finalNewQty = Number(row.new_qty);
            finalChangeQty = finalNewQty - Number(row.current_qty);
          }
        }

        // stock_adjustment_log에 INSERT하여 DB 트리거 동작 (fn_process_from_log_table)
        return supabase
          .from('stock_adjustment_log')
          .insert({
            serial_number: row.db_serial_number,
            old_qty: row.current_qty,
            new_qty: finalNewQty,
            change_qty: finalChangeQty,
            source_type: source_type,
            reason: reason
          });
      });

      const results = await Promise.all(updatePromises);
      
      // 개별 결과 중 에러가 있는지 확인
      const errorResult = results.find(r => r.error);
      if (errorResult) {
        // 해당 청크의 행들에 에러 메시지 표시
        const chunkIds = new Set(chunk.map(c => c.db_id));
        previewData.value.forEach(row => {
          if (chunkIds.has(row.db_id)) {
            row.error = "반영 실패: " + errorResult.error.message;
          }
        });
        throw errorResult.error;
      }
    }

    alert(`${validRows.length}건의 재고가 성공적으로 반영되었습니다.${!skipSelloUpload.value ? '\\n(변동 이력 및 셀로 대기열 자동 생성됨)' : ''}`);
    emit('onUploadSuccess');
    clearData();
  } catch (err) {
    console.error("Sello Upload Error:", err);
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
