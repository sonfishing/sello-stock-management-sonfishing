<template>
  <div class="upload-container">
    <h2>Excel File Upload</h2>
    <div class="upload-area" @dragover.prevent @drop.prevent="handleDrop">
      <input type="file" accept=".xlsx, .xls" @change="handleFileSelect" ref="fileInput" />
      <p>Select Excel file</p>
    </div>
    <div v-if="previewData.length > 0">
      <button @click="uploadToSupabase">Upload to Supabase</button>
      <table>
        <thead><tr><th>Row</th><th>Status</th><th>Code</th><th>Name</th><th>Qty</th><th>Price</th></tr></thead>
        <tbody><tr v-for="(row,i) in previewData" :key="i"><td>{{i+2}}</td><td>{{row.errors?.length?'Error':'OK'}}</td><td>{{row.manage_code}}</td><td>{{row.manage_name}}</td><td>{{row.quantity}}</td><td>{{row.purchase_price}}</td></tr></tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import {ref, computed} from 'vue'
import * as XLSX from 'xlsx'
import {supabase} from '../supabaseClient'

const fileInput = ref(null)
const previewData = ref([])
const isUploading = ref(false)

function handleFileSelect(e) {
  const f = e.target.files[0]
  if (f) parseExcel(f)
}

function handleDrop(e) {
  const f = e.dataTransfer.files[0]
  if (f) parseExcel(f)
}

function parseExcel(file) {
  const r = new FileReader()
  r.onload = (e) => {
    const wb = XLSX.read(new Uint8Array(e.target.result), {type: 'array'})
    const sh = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(sh, {header: 1})
    const hdrs = data[0] || []
    const rows = data.slice(1)
    previewData.value = rows.filter(r => r.some(c => c != null)).map(row => {
      const it = {
        manage_code: getVal(row, hdrs, 'manage_code') || '',
        manage_name: getVal(row, hdrs, 'manage_name') || '',
        quantity: Number(getVal(row, hdrs, 'quantity')) || 0,
        purchase_price: Number(getVal(row, hdrs, 'purchase_price')) || 0,
        consumer_price: Number(getVal(row, hdrs, 'consumer_price')) || 0,
        supplier: getVal(row, hdrs, 'supplier') || '',
        location: getVal(row, hdrs, 'location') || '',
        barcode: getVal(row, hdrs, 'barcode') || '',
        spec: getVal(row, hdrs, 'Spec') || '',
        errors: []
      }
      if (!it.manage_name) it.errors.push('Name required')
      return it
    })
  }
  r.readAsArrayBuffer(file)
}

function getVal(row, hdrs, k) {
  const i = hdrs.findIndex(h => String(h).trim() === k)
  return i > -1 ? row[i] : null
}

const hasErrors = computed(() => previewData.value.some(r => r.errors?.length > 0))

async function uploadToSupabase() {
  if (hasErrors.value) return
  isUploading.value = true
  try {
    const {error} = await supabase.from('products').insert(previewData.value.filter(r => !r.errors?.length))
    if (error) throw error
    alert('Uploaded successfully')
    previewData.value = []
  } catch (e) { alert('Error: ' + e.message) }
  finally { isUploading.value = false }
}
</script>

<style scoped>
.upload-container {padding: 20px}
.upload-area {border: 2px dashed #ccc; padding: 40px; text-align: center; margin-bottom: 20px; position: relative}
.upload-area input {position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer}
button {padding: 8px 16px; background: #1976d2; color: white; border: none; cursor: pointer}
table {width: 100%; border-collapse: collapse}
th, td {border: 1px solid #ddd; padding: 8px}
</style>