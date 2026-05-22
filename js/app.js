// ========== DATA STORE & AUTH STATE ==========
let items = [];
let transactions = [];
let currentUser = null;
let currentOperatorName = 'System';
let currentTab = 'inventory';
let loadedUsers = [];
const API_BASE = 'https://warehouse-management-system-1-30et.onrender.com';

// ========== CRYPTOGRAPHY & SECURITY ==========
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

function sanitizeInput(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(match) {
        const escape = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;'
        };
        return escape[match];
    });
}

function validatePassword(password) {
    // Requires min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(password);
}

// ========== DATABASE LOADERS ==========
async function loadUsersCSV() {
    return [];
}

async function loadCSVData() {
    try {
        const response = await fetch(API_BASE + '/api/inventory');
        const items = await response.json();
        return items;
    } catch (e) {
        console.error('Failed to load inventory from MongoDB Atlas:', e);
        return [];
    }
}

async function loadTransactionsCSV() {
    try {
        const response = await fetch(API_BASE + '/api/transactions');
        const trans = await response.json();
        return trans;
    } catch (e) {
        console.error('Failed to load transactions from MongoDB Atlas:', e);
        return [];
    }
}


function populateCategories() {
    const cats = [...new Set(items.map(i => i.category))];
    if (!cats.includes('Other')) cats.push('Other');
    const selectors = ['categoryFilter', 'itemCategory'];
    selectors.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const isFilter = id === 'categoryFilter';
        el.innerHTML = isFilter ? '<option value="">All Categories</option>' : '';
        cats.sort().forEach(c => {
            el.innerHTML += '<option value="' + c + '">' + c + '</option>';
        });
    });
}

// ========== PERSISTENCE ==========
function saveData() {
    if (!currentUser) return;
    localStorage.setItem('warehouseItems_' + currentUser, JSON.stringify(items));
    localStorage.setItem('warehouseTransactions_' + currentUser, JSON.stringify(transactions));
    updateStats();
    renderInventory();
    renderTransactions();
}



function updateStats() {
    document.getElementById('totalItems').textContent = items.length;
    const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('totalStockUnits').textContent = totalUnits.toLocaleString();
    const lowStock = items.filter(item => item.quantity <= item.minStock).length;
    document.getElementById('lowStockCount').textContent = lowStock;
    const today = new Date().toDateString();
    const todayCount = transactions.filter(t => new Date(t.date).toDateString() === today).length;
    document.getElementById('todayTransactions').textContent = todayCount;
}

function getStockStatus(item) {
    if (item.quantity <= 0) return { class: 'critical-stock', label: 'Out of Stock', color: 'text-red-600 bg-red-50' };
    if (item.quantity <= item.minStock) return { class: 'low-stock', label: 'Low Stock', color: 'text-amber-600 bg-amber-50' };
    return { class: 'healthy-stock', label: 'In Stock', color: 'text-emerald-600 bg-emerald-50' };
}

// ========== RENDER INVENTORY ==========
function renderInventory() {
    const tbody = document.getElementById('inventoryTableBody');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;
    let filtered = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm) || (item.sku && item.sku.toLowerCase().includes(searchTerm));
        const matchesCategory = !categoryFilter || item.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });
    if (filtered.length === 0) {
        document.getElementById('emptyState').classList.remove('hidden');
        tbody.innerHTML = '';
        return;
    }
    document.getElementById('emptyState').classList.add('hidden');
    tbody.innerHTML = filtered.map(item => {
        const status = getStockStatus(item);
        return '<tr class="table-row border-b border-gray-100 ' + status.class + '">' +
            '<td class="py-4"><div class="flex items-center gap-3">' +
            '<div class="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs">' + item.name.substring(0, 2).toUpperCase() + '</div>' +
            '<div><p class="font-semibold text-gray-800">' + item.name + '</p><p class="text-xs text-gray-500">' + (item.sku || 'No SKU') + '</p></div></div></td>' +
            '<td class="py-4"><span class="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-medium">' + item.category + '</span></td>' +
            '<td class="py-4 text-center"><span class="font-bold text-gray-800 text-lg">' + item.quantity + '</span></td>' +
            '<td class="py-4"><span class="px-3 py-1 rounded-full text-xs font-medium ' + status.color + '">' + status.label + '</span></td>' +
            '<td class="py-4 text-right"><div class="flex justify-end gap-2">' +
            '<button onclick="openStockModal(' + item.id + ', \'in\')" class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition-colors" title="Stock In"><i class="fas fa-arrow-down text-xs"></i></button>' +
            '<button onclick="openStockModal(' + item.id + ', \'out\')" class="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center transition-colors" title="Stock Out"><i class="fas fa-arrow-up text-xs"></i></button>' +
            '<button onclick="viewDetails(' + item.id + ')" class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center transition-colors" title="View Details"><i class="fas fa-eye text-xs"></i></button>' +
            '<button onclick="editItem(' + item.id + ')" class="w-8 h-8 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors" title="Edit"><i class="fas fa-pen text-xs"></i></button>' +
            '<button onclick="deleteItem(' + item.id + ')" class="w-8 h-8 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors" title="Delete"><i class="fas fa-trash text-xs"></i></button>' +
            '</div></td></tr>';
    }).join('');
}

function renderTransactions() {
    const tbody = document.getElementById('transactionsTableBody');
    const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = sorted.map(t => {
        const item = items.find(i => i.id === t.itemId);
        const itemName = item ? item.name : 'Unknown Item';
        const typeClass = t.type === 'in' ? 'stock-in' : 'stock-out';
        const typeIcon = t.type === 'in' ? 'fa-arrow-down' : 'fa-arrow-up';
        const typeLabel = t.type === 'in' ? 'Stock In' : 'Stock Out';
        const date = new Date(t.date);
        return '<tr class="table-row border-b border-gray-100">' +
            '<td class="py-3"><div class="text-gray-800 font-medium">' + date.toLocaleDateString() + '</div><div class="text-xs text-gray-500">' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + '</div></td>' +
            '<td class="py-3 font-medium text-gray-800">' + itemName + '</td>' +
            '<td class="py-3"><span class="px-3 py-1 rounded-full text-xs font-medium ' + typeClass + ' inline-flex items-center gap-1"><i class="fas ' + typeIcon + ' text-xs"></i> ' + typeLabel + '</span></td>' +
            '<td class="py-3 text-center font-bold ' + (t.type === 'in' ? 'text-emerald-600' : 'text-red-600') + '">' + (t.type === 'in' ? '+' : '-') + t.quantity + '</td>' +
            '<td class="py-3 text-gray-600 text-xs font-semibold text-indigo-600">' + sanitizeInput(t.operatorName || 'System') + '</td>' +
            '<td class="py-3 text-gray-600 text-xs">' + (t.reference || '-') + '</td>' +
            '<td class="py-3 text-gray-500 text-xs max-w-xs truncate">' + (t.notes || '-') + '</td>' +
            '<td class="py-3 text-right"><button onclick="deleteTransaction(' + t.id + ')" class="w-8 h-8 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors ml-auto" title="Delete"><i class="fas fa-trash text-xs"></i></button></td></tr>';
    }).join('');
}

// ========== TABS & MODALS ==========
function switchTab(tab) {
    currentTab = tab;
    ['inventory', 'transactions', 'analytics'].forEach(t => {
        const btn = document.getElementById('tab-' + t);
        const view = document.getElementById('view-' + t);
        if (t === tab) {
            btn.classList.add('bg-white', 'text-gray-800', 'shadow-sm');
            btn.classList.remove('text-gray-600');
            view.classList.remove('hidden');
        } else {
            btn.classList.remove('bg-white', 'text-gray-800', 'shadow-sm');
            btn.classList.add('text-gray-600');
            view.classList.add('hidden');
        }
    });
    if (tab === 'analytics') renderAnalytics();
}

function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    document.body.style.overflow = '';
    if (modalId === 'itemModal') {
        document.getElementById('itemForm').reset();
        document.getElementById('editItemId').value = '';
        document.getElementById('itemModalTitle').textContent = 'Add New Item';
        populateCategories();
    } else if (modalId === 'userModal') {
        document.getElementById('userForm').reset();
        document.getElementById('newPassword').type = 'password';
        document.getElementById('newPasswordEye').className = 'fas fa-eye-slash text-sm';
    }
}

// ========== OPERATOR USER CRUD ==========
function openUserModal() {
    showModal('userModal');
}

async function saveUser(e) {
    e.preventDefault();
    const username = sanitizeInput(document.getElementById('newUsername').value.trim().toLowerCase());
    const name = sanitizeInput(document.getElementById('newName').value.trim());
    const password = document.getElementById('newPassword').value;

    if (!username || !name || !password) {
        showToast('All fields are required', 'error');
        return;
    }

    if (!validatePassword(password)) {
        showToast('Password is too weak! Require 8+ chars, uppercase, lowercase, number, special char.', 'error');
        return;
    }

    try {
        const response = await fetch(API_BASE + '/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, name, password })
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Operator created successfully!', 'success');
            closeModal('userModal');
        } else {
            showToast('Failed: ' + result.message, 'error');
        }
    } catch (err) {
        console.error('Failed to create new user profile:', err);
        showToast('Server connection failed', 'error');
    }
}


// ========== ITEM CRUD ==========
async function saveItem(e) {
    e.preventDefault();
    const id = document.getElementById('editItemId').value;
    const itemData = {
        name: document.getElementById('itemName').value,
        category: document.getElementById('itemCategory').value,
        sku: document.getElementById('itemSku').value,
        quantity: parseInt(document.getElementById('itemQuantity').value) || 0,
        minStock: parseInt(document.getElementById('itemMinStock').value) || 0,
        description: document.getElementById('itemDescription').value
    };
    
    let itemObj;
    if (id) {
        const numericId = parseInt(id);
        const index = items.findIndex(i => i.id === numericId);
        if (index !== -1) {
            items[index] = { ...items[index], ...itemData };
            itemObj = items[index];
            showToast('Item updated successfully', 'success');
        }
    } else {
        const newId = items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
        itemObj = { id: newId, ...itemData };
        items.push(itemObj);
        showToast('Item added successfully', 'success');
    }
    
    try {
        await fetch(API_BASE + '/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemObj)
        });
    } catch (err) {
        console.error('Error saving item to MongoDB Atlas:', err);
    }
    
    saveData();
    populateCategories();
    closeModal('itemModal');
}

function editItem(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    document.getElementById('editItemId').value = item.id;
    document.getElementById('itemName').value = item.name;
    populateCategories();
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemSku').value = item.sku || '';
    document.getElementById('itemQuantity').value = item.quantity;
    document.getElementById('itemMinStock').value = item.minStock || '';
    document.getElementById('itemDescription').value = item.description || '';
    document.getElementById('itemModalTitle').textContent = 'Edit Item';
    showModal('itemModal');
}

async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item? All transaction history will be preserved.')) return;
    items = items.filter(i => i.id !== id);
    
    try {
        await fetch(API_BASE + '/api/inventory/' + id, { method: 'DELETE' });
    } catch (err) {
        console.error('Error deleting item from MongoDB Atlas:', err);
    }
    
    saveData();
    populateCategories();
    showToast('Item deleted', 'success');
}

// ========== SINGLE STOCK IN/OUT ==========
function openStockModal(itemId, type) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    document.getElementById('stockItemId').value = itemId;
    document.getElementById('stockType').value = type;
    document.getElementById('stockItemName').textContent = item.name;
    document.getElementById('stockCurrentQty').textContent = item.quantity;
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('stockDate').value = now.toISOString().slice(0, 16);
    const btn = document.getElementById('stockSubmitBtn');
    const title = document.getElementById('stockModalTitle');
    if (type === 'in') {
        title.textContent = 'Stock In (Receive)';
        btn.className = 'flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200';
    } else {
        title.textContent = 'Stock Out (Dispatch)';
        btn.className = 'flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-lg shadow-red-200';
    }
    showModal('stockModal');
}

async function saveStockMovement(e) {
    e.preventDefault();
    const itemId = parseInt(document.getElementById('stockItemId').value);
    const type = document.getElementById('stockType').value;
    const quantity = parseInt(document.getElementById('stockQuantity').value);
    const date = document.getElementById('stockDate').value;
    const reference = document.getElementById('stockReference').value;
    const notes = document.getElementById('stockNotes').value;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    if (type === 'out' && quantity > item.quantity) { showToast('Insufficient stock available!', 'error'); return; }
    if (type === 'in') { item.quantity += quantity; } else { item.quantity -= quantity; }
    const newId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
    
    const newTx = { id: newId, itemId, type, quantity, date: new Date(date).toISOString(), reference, notes, operatorName: currentOperatorName };
    transactions.push(newTx);
    
    try {
        await Promise.all([
            fetch(API_BASE + '/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            }),
            fetch(API_BASE + '/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTx)
            })
        ]);
    } catch (err) {
        console.error('Error logging stock movement to MongoDB Atlas:', err);
    }
    
    saveData();
    closeModal('stockModal');
    showToast('Stock ' + (type === 'in' ? 'received' : 'dispatched') + ' successfully', 'success');
}

// ========== MULTI STOCK IN/OUT ==========
function showMultiStockModal(type) {
    document.getElementById('multiStockType').value = type;
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('multiStockDate').value = now.toISOString().slice(0, 16);
    const title = document.getElementById('multiStockModalTitle');
    const btn = document.getElementById('multiStockSubmitBtn');
    if (type === 'in') {
        title.textContent = 'Multi Stock In (Receive Multiple Items)';
        btn.className = 'flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200';
    } else {
        title.textContent = 'Multi Stock Out (Dispatch Multiple Items)';
        btn.className = 'flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-lg shadow-red-200';
    }
    renderMultiStockItemsList();
    showModal('multiStockModal');
}

function renderMultiStockItemsList() {
    const container = document.getElementById('multiStockItemsList');
    if (items.length === 0) { container.innerHTML = '<div class="p-4 text-center text-gray-500">No items available. Add items first.</div>'; return; }
    container.innerHTML = items.map(item =>
        '<div class="multi-item-row grid grid-cols-12 gap-2 px-4 py-3 border-t border-gray-100 items-center">' +
        '<div class="col-span-1"><input type="checkbox" id="multi-check-' + item.id + '" class="multi-item-check w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" data-id="' + item.id + '"></div>' +
        '<div class="col-span-5"><p class="font-medium text-gray-800 text-sm">' + item.name + '</p><p class="text-xs text-gray-500">' + (item.sku || 'No SKU') + '</p></div>' +
        '<div class="col-span-3 text-center"><span class="font-semibold text-gray-700">' + item.quantity + '</span></div>' +
        '<div class="col-span-3"><input type="number" id="multi-qty-' + item.id + '" min="0" class="multi-item-qty w-full px-2 py-1 border border-gray-300 rounded text-center text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0"></div></div>'
    ).join('');
}

function selectAllItems() {
    const checkboxes = document.querySelectorAll('.multi-item-check');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

async function saveMultiStockMovement(e) {
    e.preventDefault();
    const type = document.getElementById('multiStockType').value;
    const date = document.getElementById('multiStockDate').value;
    const reference = document.getElementById('multiStockReference').value;
    const notes = document.getElementById('multiStockNotes').value;
    const selectedItems = [];
    let maxId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) : 0;
    items.forEach(item => {
        const checkbox = document.getElementById('multi-check-' + item.id);
        const qtyInput = document.getElementById('multi-qty-' + item.id);
        const quantity = parseInt(qtyInput.value) || 0;
        if (checkbox.checked && quantity > 0) {
            if (type === 'out' && quantity > item.quantity) { showToast('Insufficient stock for ' + item.name + '!', 'error'); return; }
            selectedItems.push({ item, quantity });
        }
    });
    if (selectedItems.length === 0) { showToast('Please select at least one item and enter quantity', 'error'); return; }
    
    const syncPromises = [];
    selectedItems.forEach(({ item, quantity }) => {
        if (type === 'in') { item.quantity += quantity; } else { item.quantity -= quantity; }
        maxId++;
        const newTx = { id: maxId, itemId: item.id, type, quantity, date: new Date(date).toISOString(), reference, notes, operatorName: currentOperatorName };
        transactions.push(newTx);
        
        syncPromises.push(
            fetch(API_BASE + '/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            }),
            fetch(API_BASE + '/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTx)
            })
        );
    });
    
    try {
        await Promise.all(syncPromises);
    } catch (err) {
        console.error('Error logging multi stock movement to MongoDB Atlas:', err);
    }
    
    saveData();
    closeModal('multiStockModal');
    showToast(selectedItems.length + ' item(s) ' + (type === 'in' ? 'received' : 'dispatched') + ' successfully', 'success');
}

async function deleteTransaction(id) {
    if (!confirm('Delete this transaction? This will NOT reverse the stock movement.')) return;
    transactions = transactions.filter(t => t.id !== id);
    
    try {
        await fetch(API_BASE + '/api/transactions/' + id, { method: 'DELETE' });
    } catch (err) {
        console.error('Error deleting transaction from MongoDB Atlas:', err);
    }
    
    saveData();
    showToast('Transaction deleted', 'success');
}


// ========== VIEW DETAILS ==========
function viewDetails(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const status = getStockStatus(item);
    document.getElementById('detailsContent').innerHTML =
        '<div class="flex items-center gap-4 mb-4"><div class="w-16 h-16 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 text-2xl font-bold">' + item.name.substring(0, 2).toUpperCase() + '</div>' +
        '<div><h3 class="text-xl font-bold text-gray-800">' + item.name + '</h3><span class="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">' + item.category + '</span></div></div>' +
        '<div class="grid grid-cols-2 gap-4">' +
        '<div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500 uppercase">SKU</p><p class="font-semibold text-gray-800">' + (item.sku || 'N/A') + '</p></div>' +
        '<div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500 uppercase">Status</p><span class="px-2 py-1 rounded text-xs font-medium ' + status.color + '">' + status.label + '</span></div>' +
        '<div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500 uppercase">Current Stock</p><p class="font-semibold text-gray-800 text-lg">' + item.quantity + ' units</p></div>' +
        '<div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500 uppercase">Min. Stock Level</p><p class="font-semibold text-gray-800">' + (item.minStock || 'Not set') + '</p></div></div>' +
        (item.description ? '<div class="mt-4"><p class="text-xs text-gray-500 uppercase mb-1">Description</p><p class="text-gray-700 text-sm">' + item.description + '</p></div>' : '');

    const itemTransactions = transactions.filter(t => t.itemId === id).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
    document.getElementById('detailsTransactions').innerHTML = itemTransactions.length ?
        itemTransactions.map(t => {
            const date = new Date(t.date);
            return '<div class="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg text-sm">' +
                '<div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full ' + (t.type === 'in' ? 'bg-emerald-500' : 'bg-red-500') + '"></span>' +
                '<span class="text-gray-600">' + date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + '</span></div>' +
                '<div class="flex items-center gap-3"><span class="font-bold ' + (t.type === 'in' ? 'text-emerald-600' : 'text-red-600') + '">' + (t.type === 'in' ? '+' : '-') + t.quantity + '</span>' +
                '<span class="text-xs text-gray-400">' + (t.reference || '') + '</span></div></div>';
        }).join('') : '<p class="text-gray-500 text-sm italic">No transactions yet</p>';
    showModal('detailsModal');
}

function searchItems() { renderInventory(); }
function filterByCategory() { renderInventory(); }

// ========== EXPORT ==========
function exportData() {
    const data = { items, transactions, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'warehouse-data-' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Data exported successfully', 'success');
}

// ========== TOAST ==========
function showToast(message, type) {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMessage');
    msg.textContent = message;
    icon.className = type === 'error' ? 'fas fa-exclamation-circle text-red-400' : 'fas fa-check-circle text-green-400';
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => { toast.classList.add('translate-y-20', 'opacity-0'); }, 3000);
}

// ========== ANALYTICS ==========
function renderAnalytics() { renderMovementChart(); renderCategoryChart(); renderTopItems(); }

function renderMovementChart() {
    const canvas = document.getElementById('movementChart');
    const ctx = canvas.getContext('2d');
    const width = canvas.width; const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const days = []; const inData = []; const outData = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date(); date.setDate(date.getDate() - i);
        const dateStr = date.toDateString();
        days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
        const dayTrans = transactions.filter(t => new Date(t.date).toDateString() === dateStr);
        inData.push(dayTrans.filter(t => t.type === 'in').reduce((sum, t) => sum + t.quantity, 0));
        outData.push(dayTrans.filter(t => t.type === 'out').reduce((sum, t) => sum + t.quantity, 0));
    }
    const maxVal = Math.max(...inData, ...outData, 1);
    const barWidth = (width - 60) / 7 / 2.5;
    const spacing = (width - 60) / 7;
    ctx.strokeStyle = '#e5e7eb'; ctx.beginPath(); ctx.moveTo(30, 10); ctx.lineTo(30, height - 20); ctx.lineTo(width - 10, height - 20); ctx.stroke();
    days.forEach((day, i) => {
        const x = 40 + i * spacing;
        const inHeight = (inData[i] / maxVal) * (height - 40);
        const outHeight = (outData[i] / maxVal) * (height - 40);
        ctx.fillStyle = '#10b981'; ctx.fillRect(x, height - 20 - inHeight, barWidth, inHeight);
        ctx.fillStyle = '#ef4444'; ctx.fillRect(x + barWidth + 2, height - 20 - outHeight, barWidth, outHeight);
        ctx.fillStyle = '#6b7280'; ctx.font = '10px Inter'; ctx.textAlign = 'center'; ctx.fillText(day, x + barWidth, height - 5);
    });
    ctx.fillStyle = '#10b981'; ctx.fillRect(width - 100, 10, 12, 12); ctx.fillStyle = '#374151'; ctx.fillText('In', width - 80, 20);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(width - 50, 10, 12, 12); ctx.fillStyle = '#374151'; ctx.fillText('Out', width - 30, 20);
}

function renderCategoryChart() {
    const canvas = document.getElementById('categoryChart');
    const ctx = canvas.getContext('2d');
    const width = canvas.width; const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const categories = {};
    items.forEach(item => { categories[item.category] = (categories[item.category] || 0) + item.quantity; });
    const total = Object.values(categories).reduce((a, b) => a + b, 0);
    if (total === 0) return;
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    let currentAngle = -Math.PI / 2;
    const centerX = width / 2 - 40; const centerY = height / 2;
    const radius = Math.min(width, height) / 3;
    Object.entries(categories).forEach(([cat, qty], i) => {
        const sliceAngle = (qty / total) * 2 * Math.PI;
        ctx.beginPath(); ctx.moveTo(centerX, centerY); ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle); ctx.closePath();
        ctx.fillStyle = colors[i % colors.length]; ctx.fill();
        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius + 20);
        const labelY = centerY + Math.sin(labelAngle) * (radius + 20);
        ctx.fillStyle = '#374151'; ctx.font = '11px Inter'; ctx.textAlign = 'center';
        ctx.fillText(cat, labelX, labelY); ctx.fillText(qty.toString(), labelX, labelY + 12);
        currentAngle += sliceAngle;
    });
    ctx.beginPath(); ctx.arc(centerX, centerY, radius * 0.5, 0, 2 * Math.PI); ctx.fillStyle = '#f9fafb'; ctx.fill();
    ctx.fillStyle = '#374151'; ctx.font = 'bold 12px Inter'; ctx.textAlign = 'center';
    ctx.fillText('Total', centerX, centerY - 5); ctx.fillText(total.toString(), centerX, centerY + 10);
}

function renderTopItems() {
    const itemMovement = {};
    transactions.forEach(t => { if (!itemMovement[t.itemId]) itemMovement[t.itemId] = 0; itemMovement[t.itemId] += t.quantity; });
    const sorted = Object.entries(itemMovement).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const container = document.getElementById('topItemsList');
    if (sorted.length === 0) { container.innerHTML = '<p class="text-gray-500 text-sm italic">No transaction data available</p>'; return; }
    const maxQty = sorted[0][1];
    container.innerHTML = sorted.map(([id, qty]) => {
        const item = items.find(i => i.id === parseInt(id));
        const name = item ? item.name : 'Unknown';
        const percent = (qty / maxQty) * 100;
        return '<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 text-xs font-bold flex-shrink-0">' + name.substring(0, 2).toUpperCase() + '</div>' +
            '<div class="flex-1"><div class="flex justify-between mb-1"><span class="text-sm font-medium text-gray-700">' + name + '</span><span class="text-sm font-bold text-gray-800">' + qty + ' units</span></div>' +
            '<div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-indigo-500 h-2 rounded-full transition-all" style="width: ' + percent + '%"></div></div></div></div>';
    }).join('');
}

// ========== AUTHENTICATION FLOWS ==========
function togglePasswordVisibility(fieldId) {
    const field = document.getElementById(fieldId);
    const eye = document.getElementById(fieldId + 'Eye');
    if (field.type === 'password') {
        field.type = 'text';
        eye.className = 'fas fa-eye text-sm';
    } else {
        field.type = 'password';
        eye.className = 'fas fa-eye-slash text-sm';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value;
    const p = document.getElementById('loginPassword').value;
    
    const lockEl = document.getElementById('loginLock');
    
    // Trigger pulse scanline checking state
    if (lockEl) {
        lockEl.classList.remove('shake-element', 'unlocking');
        lockEl.classList.add('checking');
    }
    
    // Secure db query simulation delay
    await new Promise(resolve => setTimeout(resolve, 850));
    
    const success = await loginUser(u, p);
    
    if (lockEl) {
        lockEl.classList.remove('checking');
    }
    
    if (success) {
        document.getElementById('loginPassword').value = '';
        
        // Trigger high-fidelity shackle unlock swing!
        if (lockEl) {
            lockEl.classList.add('unlocking');
        }
        
        // Wait for padlock unlock animation
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await initDashboard();
        
        setTimeout(() => {
            if (lockEl) lockEl.classList.remove('unlocking');
        }, 1000);
    } else {
        // Shake padlock on bad credentials
        if (lockEl) {
            lockEl.classList.add('shake-element');
            setTimeout(() => {
                lockEl.classList.remove('shake-element');
            }, 600);
        }
    }
}

async function loginUser(username, password) {
    username = sanitizeInput(username.trim().toLowerCase());
    try {
        const response = await fetch(API_BASE + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await response.json();
        if (result.success) {
            sessionStorage.setItem('warehouse_session', result.user.username);
            sessionStorage.setItem('warehouse_user_name', result.user.name);
            currentUser = result.user.username;
            currentOperatorName = result.user.name;
            showToast('Welcome back, ' + result.user.name + '!', 'success');
            return true;
        } else {
            showToast(result.message || 'Invalid credentials', 'error');
            return false;
        }
    } catch (e) {
        console.error('Secure login failed:', e);
        showToast('Server connection failed', 'error');
        return false;
    }
}

function handleLogout() {
    sessionStorage.removeItem('warehouse_session');
    sessionStorage.removeItem('warehouse_user_name');
    currentUser = null;
    currentOperatorName = 'System';
    items = [];
    transactions = [];
    document.getElementById('userNameHeader').textContent = 'Guest';
    document.getElementById('dashboardApp').classList.add('hidden');
    document.getElementById('authContainer').classList.remove('hidden');
    document.getElementById('loginUsername').value = '';
    showToast('Signed out successfully', 'success');
}

async function initDashboard() {
    currentUser = sessionStorage.getItem('warehouse_session');
    currentOperatorName = sessionStorage.getItem('warehouse_user_name') || 'System';
    if (!currentUser) return;

    // Load fresh data directly from MongoDB Atlas database!
    items = await loadCSVData();
    transactions = await loadTransactionsCSV();

    // Populate dynamic welcome header!
    document.getElementById('userNameHeader').textContent = currentOperatorName;
    
    // Hide auth screen, show dashboard
    document.getElementById('authContainer').classList.add('hidden');
    document.getElementById('dashboardApp').classList.remove('hidden');

    // Render workspace
    populateCategories();
    updateStats();
    renderInventory();
    renderTransactions();
    if (currentTab === 'analytics') renderAnalytics();
}

// ========== MOBILE HAMBURGER MENU ==========
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    const icon = document.getElementById('hamburgerIcon');
    if (!menu) return;
    
    if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        if (icon) {
            icon.className = 'fas fa-times text-lg transition-transform duration-200 rotate-90';
        }
    } else {
        menu.classList.add('hidden');
        if (icon) {
            icon.className = 'fas fa-bars text-lg transition-transform duration-200';
        }
    }
}

function mobileMenuAction(action) {
    const menu = document.getElementById('mobileMenu');
    const icon = document.getElementById('hamburgerIcon');
    if (menu) menu.classList.add('hidden');
    if (icon) icon.className = 'fas fa-bars text-lg';
    
    switch (action) {
        case 'user':
            openUserModal();
            break;
        case 'stockIn':
            showMultiStockModal('in');
            break;
        case 'stockOut':
            showMultiStockModal('out');
            break;
        case 'item':
            showModal('itemModal');
            break;
        case 'logout':
            handleLogout();
            break;
    }
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
    // Check active session
    if (sessionStorage.getItem('warehouse_session')) {
        await initDashboard();
    } else {
        // Show login view
        document.getElementById('authContainer').classList.remove('hidden');
        document.getElementById('dashboardApp').classList.add('hidden');
    }
});

