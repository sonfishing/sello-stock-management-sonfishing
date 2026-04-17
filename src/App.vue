<template>
  <div id="app">
    <nav>
      <button @click="currentView = 'list'">Product List</button>
      <button @click="currentView = 'upload'">Upload Excel</button>
    </nav>
    
    <ProductUpload v-if="currentView === 'upload'" />
    
    <div v-if="currentView === 'list'">
      <h1>Inventory Dashboard</h1>
      
      <div class="add-product">
        <h2>Add New Product</h2>
        <input v-model="newProduct.manage_code" placeholder="Manage Code" />
        <input v-model="newProduct.manage_name" placeholder="Product Name" />
        <input v-model.number="newProduct.quantity" placeholder="Quantity" type="number" />
        <input v-model.number="newProduct.purchase_price" placeholder="Price" type="number" />
        <button @click="addProduct">Add Product</button>
      </div>

      <table border="1">
        <thead>
          <tr>
            <th>manage_code</th>
            <th>manage_name</th>
            <th>quantity</th>
            <th>purchase_price</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="product in products" :key="product.id">
            <td>{{ product.manage_code }}</td>
            <td>{{ product.manage_name }}</td>
            <td>{{ product.quantity }}</td>
            <td>{{ product.purchase_price }}</td>
            <td>
              <button @click="deleteProduct(product.id)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { supabase } from "./supabaseClient";
import ProductUpload from "./components/ProductUpload.vue";

const products = ref([]);
const newProduct = ref({
  manage_code: "",
  manage_name: "",
  quantity: 0,
  purchase_price: 0,
});
const currentView = ref("list");

async function fetchProducts() {
  const { data, error } = await supabase.from("products").select("*");
  if (error) console.error("Error:", error);
  else products.value = data;
}

async function addProduct() {
  const { data, error } = await supabase.from("products").insert([newProduct.value]);
  if (error) console.error("Error adding product:", error);
  else {
    fetchProducts();
    newProduct.value = { manage_code: "", manage_name: "", quantity: 0, purchase_price: 0 };
  }
}

async function deleteProduct(id) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) console.error("Error deleting product:", error);
  else fetchProducts();
}

onMounted(fetchProducts);
</script>

<style>
nav { margin-bottom: 20px; gap: 10px; display: flex; }
nav button { padding: 10px 20px; background: #1976d2; color: white; border: none; cursor: pointer; }
.add-product { margin: 20px 0; }
.add-product input { margin-right: 10px; padding: 8px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
</style>