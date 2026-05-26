// ========== DATA STORE & AUTH STATE ==========
let items = [];
let transactions = [];
let employees = [];
let currentUser = null;
let currentOperatorName = 'System';
let currentTab = 'inventory';
let loadedUsers = [];
let isStockSubmitting = false;
let isItemSubmitting = false;
let isEmployeeSubmitting = false;
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8080'
    : 'https://warehouse-management-system-1-30et.onrender.com';

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
    // Requires min 4 characters
    return password && password.length >= 4;
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
    const totalUnits = items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
    document.getElementById('totalStockUnits').textContent = totalUnits.toLocaleString();
    const lowStock = items.filter(item => (parseInt(item.quantity) || 0) <= (parseInt(item.minStock) || 0)).length;
    document.getElementById('lowStockCount').textContent = lowStock;
    const today = new Date().toDateString();
    const todayCount = transactions.filter(t => new Date(t.date).toDateString() === today).length;
    document.getElementById('todayTransactions').textContent = todayCount;
}

function getStockStatus(item) {
    const qty = parseInt(item.quantity) || 0;
    const minStock = parseInt(item.minStock) || 0;
    if (qty <= 0) return { class: 'critical-stock', label: 'Out of Stock', color: 'text-red-600 bg-red-50' };
    if (qty <= minStock) return { class: 'low-stock', label: 'Low Stock', color: 'text-amber-600 bg-amber-50' };
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
    if (!tbody) return;

    // Get filter values from advanced filter panel
    const itemSearch = document.getElementById('txItemSearch') ? document.getElementById('txItemSearch').value.toLowerCase().trim() : '';
    const refSearch = document.getElementById('txRefSearch') ? document.getElementById('txRefSearch').value.toLowerCase().trim() : '';
    const dateSearch = document.getElementById('txDateSearch') ? document.getElementById('txDateSearch').value : '';
    const operatorSearch = document.getElementById('txOperatorSearch') ? document.getElementById('txOperatorSearch').value : '';

    let filtered = transactions.filter(t => {
        const item = items.find(i => i.id === t.itemId);
        const itemName = item ? item.name.toLowerCase() : 'unknown item';
        const matchesItem = !itemSearch || itemName.includes(itemSearch);
        
        const reference = (t.reference || '').toLowerCase();
        const matchesRef = !refSearch || reference.includes(refSearch);
        
        const tDate = new Date(t.date);
        // Robust timezone-agnostic date matching
        let matchesDate = true;
        if (dateSearch) {
            const filterDate = new Date(dateSearch + 'T00:00:00');
            matchesDate = tDate.toDateString() === filterDate.toDateString();
        }
        
        const matchesOperator = !operatorSearch || (t.operatorName || 'System') === operatorSearch;
        
        return matchesItem && matchesRef && matchesDate && matchesOperator;
    });

    const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sorted.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="py-8 text-center text-gray-500 italic bg-gray-50/20 rounded-xl">
                    <div class="flex flex-col items-center justify-center py-4">
                        <i class="fas fa-exchange-alt text-2xl text-gray-300 mb-2"></i>
                        <span>No transactions match the selected filters.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = sorted.map(t => {
        const item = items.find(i => i.id === t.itemId);
        const itemName = item ? item.name : 'Unknown Item';
        const sku = item ? item.sku : '';
        const typeClass = t.type === 'in' ? 'stock-in' : 'stock-out';
        const typeIcon = t.type === 'in' ? 'fa-arrow-down' : 'fa-arrow-up';
        const typeLabel = t.type === 'in' ? 'Stock In' : 'Stock Out';
        const date = new Date(t.date);
        
        // Prepare row-level printing details
        const printData = JSON.stringify({
            type: t.type,
            date: t.date,
            ref: t.reference || '',
            operator: t.operatorName || 'System',
            itemsList: [{ name: itemName, sku: sku, quantity: t.quantity }],
            notes: t.notes || ''
        }).replace(/"/g, '&quot;');

        return '<tr class="table-row border-b border-gray-100 hover:bg-slate-50/40 transition-colors">' +
            '<td class="py-3"><div class="text-gray-800 font-medium text-xs">' + date.toLocaleDateString() + '</div><div class="text-[10px] text-gray-400">' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + '</div></td>' +
            '<td class="py-3 font-semibold text-gray-800 text-xs">' + itemName + '</td>' +
            '<td class="py-3"><span class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold ' + typeClass + ' inline-flex items-center gap-1"><i class="fas ' + typeIcon + ' text-[9px]"></i> ' + typeLabel + '</span></td>' +
            '<td class="py-3 text-center font-bold ' + (t.type === 'in' ? 'text-emerald-600' : 'text-red-600') + '">' + (t.type === 'in' ? '+' : '-') + t.quantity + '</td>' +
            '<td class="py-3 text-indigo-600 text-xs font-semibold">' + sanitizeInput(t.operatorName || 'System') + '</td>' +
            '<td class="py-3 text-gray-600 text-xs font-mono">' + (t.reference || '-') + '</td>' +
            '<td class="py-3 text-gray-500 text-xs max-w-[150px] truncate">' + (t.notes || '-') + '</td>' +
            '<td class="py-3 text-right">' +
            '<div class="flex justify-end gap-1.5">' +
            '<button onclick="printRowTransaction(' + printData + ')" class="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center transition-colors" title="Print Slip"><i class="fas fa-print text-xs"></i></button>' +
            '<button onclick="deleteTransaction(' + t.id + ')" class="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors" title="Delete"><i class="fas fa-trash text-xs"></i></button>' +
            '</div>' +
            '</td></tr>';
    }).join('');
}

function printRowTransaction(printData) {
    currentPrintData = printData;
    printThermalSlip();
}

// ========== TABS & MODALS ==========
function switchTab(tab) {
    currentTab = tab;
    ['inventory', 'transactions', 'analytics', 'employees'].forEach(t => {
        const btn = document.getElementById('tab-' + t);
        const view = document.getElementById('view-' + t);
        if (t === tab) {
            if (btn) {
                btn.classList.add('bg-white', 'text-gray-800', 'shadow-sm');
                btn.classList.remove('text-gray-600');
            }
            if (view) view.classList.remove('hidden');
        } else {
            if (btn) {
                btn.classList.remove('bg-white', 'text-gray-800', 'shadow-sm');
                btn.classList.add('text-gray-600');
            }
            if (view) view.classList.add('hidden');
        }
    });
    if (tab === 'analytics') renderAnalytics();
    if (tab === 'employees') renderEmployees();
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
        const btn = document.querySelector('#itemForm button[type="submit"]');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save Item';
        }
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
        showToast('Password is too weak! Require at least 4 characters.', 'error');
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
    if (isItemSubmitting) return;
    
    const id = document.getElementById('editItemId').value;
    const itemData = {
        name: document.getElementById('itemName').value,
        category: document.getElementById('itemCategory').value,
        sku: document.getElementById('itemSku').value,
        quantity: parseInt(document.getElementById('itemQuantity').value) || 0,
        minStock: parseInt(document.getElementById('itemMinStock').value) || 0,
        description: document.getElementById('itemDescription').value
    };
    
    isItemSubmitting = true;
    
    // Disable submit button to prevent double-click multiple submissions
    const btn = document.querySelector('#itemForm button[type="submit"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> Saving...';
    }

    let itemObj;
    let isEdit = false;
    if (id) {
        isEdit = true;
        const numericId = parseInt(id);
        const index = items.findIndex(i => i.id === numericId);
        if (index !== -1) {
            items[index] = { ...items[index], ...itemData };
            itemObj = items[index];
        }
    } else {
        const newId = items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
        itemObj = { id: newId, ...itemData };
        items.push(itemObj);
    }
    
    try {
        await fetch(API_BASE + '/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemObj)
        });
        
        saveData();
        populateCategories();
        closeModal('itemModal');
        
        showSuccessActionModal(
            isEdit ? 'Item Updated!' : 'Item Added!',
            'Inventory item database sync complete.',
            'item',
            null // No print slip for items
        );
    } catch (err) {
        console.error('Error saving item to MongoDB Atlas:', err);
        showToast('Error saving item', 'error');
    } finally {
        isItemSubmitting = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Save Item';
        }
    }
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

    // Reset the form to completely clear browser memory / autocomplete cache
    const form = document.getElementById('stockForm');
    if (form) form.reset();

    document.getElementById('stockItemId').value = itemId;
    document.getElementById('stockType').value = type;
    document.getElementById('stockItemName').textContent = item.name;
    document.getElementById('stockCurrentQty').textContent = item.quantity;
    
    // Auto-generate reference number
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    document.getElementById('stockReference').value = 'TXN-' + type.toUpperCase() + '-' + randomSuffix;

    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('stockDate').value = now.toISOString().slice(0, 16);
    
    const btn = document.getElementById('stockSubmitBtn');
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Confirm';
    }
    
    const title = document.getElementById('stockModalTitle');
    if (type === 'in') {
        title.textContent = 'Stock In (Receive)';
        if (btn) btn.className = 'flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200';
    } else {
        title.textContent = 'Stock Out (Dispatch)';
        if (btn) btn.className = 'flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-lg shadow-red-200';
    }
    showModal('stockModal');
}

async function saveStockMovement(e) {
    e.preventDefault();
    if (isStockSubmitting) return;

    const itemId = parseInt(document.getElementById('stockItemId').value);
    const type = document.getElementById('stockType').value;
    const quantity = parseInt(document.getElementById('stockQuantity').value);
    const date = document.getElementById('stockDate').value;
    const reference = document.getElementById('stockReference').value;
    const notes = document.getElementById('stockNotes').value;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    const currentQty = parseInt(item.quantity) || 0;
    if (quantity <= 0) { showToast('Please enter a valid quantity!', 'error'); return; }
    if (type === 'out' && quantity > currentQty) { showToast('Insufficient stock available!', 'error'); return; }
    
    isStockSubmitting = true;

    // Disable confirm button to prevent double-click multiple submissions
    const btn = document.getElementById('stockSubmitBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> Saving...';
    }

    try {
        if (type === 'in') { item.quantity = currentQty + quantity; } else { item.quantity = currentQty - quantity; }
        const newId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
        
        const newTx = { id: newId, itemId, type, quantity, date: new Date(date).toISOString(), reference, notes, operatorName: currentOperatorName };
        transactions.push(newTx);
        
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
        
        saveData();
        closeModal('stockModal');
        
        // Prepare receipt data
        const slipData = {
            title: 'Stock Movement',
            type,
            date: new Date(date).toISOString(),
            ref: reference,
            operator: currentOperatorName,
            itemsList: [{
                name: item.name,
                sku: item.sku,
                quantity
            }],
            notes
        };
        
        showSuccessActionModal(
            type === 'in' ? 'Stock Received!' : 'Stock Dispatched!',
            'Stock movement recorded successfully.',
            type,
            slipData
        );
    } catch (err) {
        console.error('Error logging stock movement to MongoDB Atlas:', err);
        showToast('Error saving stock movement', 'error');
    } finally {
        isStockSubmitting = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Confirm';
        }
    }
}

// ========== MULTI STOCK IN/OUT ==========
function showMultiStockModal(type) {
    // Generate fresh metadata values first
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const reference = 'TXN-M' + type.toUpperCase() + '-' + randomSuffix;
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const dateStr = now.toISOString().slice(0, 16);

    // Render the items first so all checkbox/input DOM nodes are created
    renderMultiStockItemsList();

    // Reset the form to completely clear browser memory / autocomplete cache on dynamic elements
    const form = document.getElementById('multiStockForm');
    if (form) {
        form.reset();
    }

    // Set the metadata values after resetting to ensure they aren't cleared
    document.getElementById('multiStockType').value = type;
    document.getElementById('multiStockReference').value = reference;
    document.getElementById('multiStockDate').value = dateStr;
    
    const title = document.getElementById('multiStockModalTitle');
    const btn = document.getElementById('multiStockSubmitBtn');
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Confirm All';
    }
    
    if (type === 'in') {
        title.textContent = 'Multi Stock In (Receive Multiple Items)';
        if (btn) btn.className = 'flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200';
    } else {
        title.textContent = 'Multi Stock Out (Dispatch Multiple Items)';
        if (btn) btn.className = 'flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-lg shadow-red-200';
    }
    
    showModal('multiStockModal');
}

function renderMultiStockItemsList() {
    const container = document.getElementById('multiStockItemsList');
    if (items.length === 0) { container.innerHTML = '<div class="p-4 text-center text-gray-500">No items available. Add items first.</div>'; return; }
    container.innerHTML = items.map(item =>
        '<div class="multi-item-row grid grid-cols-12 gap-2 px-4 py-3 border-t border-gray-100 items-center cursor-pointer hover:bg-indigo-50/30 transition-colors" onclick="toggleMultiRowCheck(event, ' + item.id + ')">' +
        '<div class="col-span-1"><input type="checkbox" id="multi-check-' + item.id + '" class="multi-item-check w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" data-id="' + item.id + '"></div>' +
        '<div class="col-span-5"><p class="font-medium text-gray-800 text-sm">' + item.name + '</p><p class="text-xs text-gray-500">' + (item.sku || 'No SKU') + '</p></div>' +
        '<div class="col-span-3 text-center"><span class="font-semibold text-gray-700">' + item.quantity + '</span></div>' +
        '<div class="col-span-3"><input type="number" id="multi-qty-' + item.id + '" min="0" oninput="handleMultiQtyInput(' + item.id + ')" class="multi-item-qty w-full px-2 py-1 border border-gray-300 rounded text-center text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" autocomplete="off"></div></div>'
    ).join('');
}

// Handlers for dynamic row selection and auto-checking on quantity input
function toggleMultiRowCheck(event, itemId) {
    if (event.target.classList.contains('multi-item-qty') || event.target.classList.contains('multi-item-check')) {
        return;
    }
    const checkbox = document.getElementById('multi-check-' + itemId);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
            const qtyInput = document.getElementById('multi-qty-' + itemId);
            if (qtyInput) {
                qtyInput.focus();
                qtyInput.select();
            }
        }
    }
}

function handleMultiQtyInput(itemId) {
    const qtyInput = document.getElementById('multi-qty-' + itemId);
    const checkbox = document.getElementById('multi-check-' + itemId);
    if (qtyInput && checkbox) {
        const val = parseInt(qtyInput.value) || 0;
        checkbox.checked = (val > 0);
    }
}

function selectAllItems() {
    const checkboxes = document.querySelectorAll('.multi-item-check');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
        if (cb.checked) {
            const itemId = cb.getAttribute('data-id');
            const qtyInput = document.getElementById('multi-qty-' + itemId);
            if (qtyInput && (parseInt(qtyInput.value) || 0) === 0) {
                qtyInput.value = '';
            }
        }
    });
}

async function saveMultiStockMovement(e) {
    e.preventDefault();
    if (isStockSubmitting) return;

    const type = document.getElementById('multiStockType').value;
    const date = document.getElementById('multiStockDate').value;
    const reference = document.getElementById('multiStockReference').value;
    const notes = document.getElementById('multiStockNotes').value;
    const selectedItems = [];
    let maxId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) : 0;
    
    let isInsufficient = false;
    items.forEach(item => {
        const checkbox = document.getElementById('multi-check-' + item.id);
        const qtyInput = document.getElementById('multi-qty-' + item.id);
        const quantity = parseInt(qtyInput.value) || 0;
        const currentQty = parseInt(item.quantity) || 0;
        if (checkbox && checkbox.checked && quantity > 0) {
            if (type === 'out' && quantity > currentQty) { 
                showToast('Insufficient stock for ' + item.name + '!', 'error'); 
                isInsufficient = true;
            }
            selectedItems.push({ item, quantity });
        }
    });
    if (isInsufficient) return;
    if (selectedItems.length === 0) { showToast('Please select at least one item and enter quantity', 'error'); return; }
    
    isStockSubmitting = true;
    
    // Disable submit button to prevent double-click multiple submissions
    const btn = document.getElementById('multiStockSubmitBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> Saving...';
    }

    const syncPromises = [];
    selectedItems.forEach(({ item, quantity }) => {
        const currentQty = parseInt(item.quantity) || 0;
        if (type === 'in') { item.quantity = currentQty + quantity; } else { item.quantity = currentQty - quantity; }
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
        saveData();
        closeModal('multiStockModal');
        
        // Prepare multi-item receipt data
        const slipData = {
            title: 'Multi-Item Stock ' + (type === 'in' ? 'In' : 'Out'),
            type,
            date: new Date(date).toISOString(),
            ref: reference,
            operator: currentOperatorName,
            itemsList: selectedItems.map(si => ({
                name: si.item.name,
                sku: si.item.sku,
                quantity: si.quantity
            })),
            notes
        };
        
        showSuccessActionModal(
            type === 'in' ? 'Multi-Stock Received!' : 'Multi-Stock Dispatched!',
            selectedItems.length + ' item movements logged.',
            type,
            slipData
        );
    } catch (err) {
        console.error('Error logging multi stock movement to MongoDB Atlas:', err);
        showToast('Error saving multi stock movements', 'error');
    } finally {
        isStockSubmitting = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Confirm All';
        }
    }
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
    
    const errorMsgEl = document.getElementById('loginErrorMsg');
    if (errorMsgEl) errorMsgEl.classList.add('hidden');

    const overlayEl = document.getElementById('loginLoadingOverlay');
    const circleEl = document.getElementById('loadingCircle');
    const tickEl = document.getElementById('successTick');
    const loadingTextEl = document.getElementById('loadingText');
    const loadingSubtextEl = document.getElementById('loadingSubtext');

    if (overlayEl) overlayEl.classList.remove('hidden');
    if (circleEl) circleEl.classList.remove('hidden');
    if (tickEl) {
        tickEl.classList.add('hidden', 'scale-0');
        tickEl.classList.remove('scale-100');
    }
    if (loadingTextEl) loadingTextEl.textContent = 'Verifying Credentials...';
    if (loadingSubtextEl) loadingSubtextEl.textContent = 'Connecting to isolated security workspace...';
    
    // Minimum visual delay for smooth animation feel
    const startTime = Date.now();
    const loginResult = await loginUser(u, p);
    const elapsed = Date.now() - startTime;
    const minDelay = 1000;
    if (elapsed < minDelay) {
        await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
    }
    
    if (loginResult.success) {
        document.getElementById('loginPassword').value = '';
        
        // Hide spinner, show success checkmark
        if (circleEl) circleEl.classList.add('hidden');
        if (tickEl) {
            tickEl.classList.remove('hidden');
            // Trigger transition scale up
            setTimeout(() => {
                tickEl.classList.remove('scale-0');
                tickEl.classList.add('scale-100');
            }, 50);
        }
        
        if (loadingTextEl) loadingTextEl.textContent = 'Access Granted!';
        if (loadingSubtextEl) loadingSubtextEl.textContent = 'Welcome back, ' + currentOperatorName + '!';
        
        // Wait to show checkmark tick before opening index/dashboard page
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        await initDashboard();
        
        if (overlayEl) overlayEl.classList.add('hidden');
    } else {
        if (overlayEl) overlayEl.classList.add('hidden');
        
        // Display message if credentials are wrong
        const errorTextEl = document.getElementById('loginErrorText');
        if (errorTextEl) errorTextEl.textContent = loginResult.message;
        if (errorMsgEl) errorMsgEl.classList.remove('hidden');
        
        // Shake the auth container
        const cardEl = document.querySelector('.auth-card');
        if (cardEl) {
            cardEl.classList.add('shake-element');
            setTimeout(() => {
                cardEl.classList.remove('shake-element');
            }, 600);
        }
        
        document.getElementById('loginPassword').value = '';
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
            return { success: true, user: result.user };
        } else {
            return { success: false, message: result.message || 'Invalid credentials' };
        }
    } catch (e) {
        console.error('Secure login failed:', e);
        return { success: false, message: 'Server connection failed' };
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

function populateOperatorDropdown() {
    const dropdown = document.getElementById('txOperatorSearch');
    if (!dropdown) return;
    const ops = [...new Set(transactions.map(t => t.operatorName || 'System'))];
    if (currentOperatorName && !ops.includes(currentOperatorName)) {
        ops.push(currentOperatorName);
    }
    ops.sort();
    dropdown.innerHTML = '<option value="">All Operators</option>';
    ops.forEach(op => {
        dropdown.innerHTML += '<option value="' + op + '">' + op + '</option>';
    });
}

async function initDashboard() {
    currentUser = sessionStorage.getItem('warehouse_session');
    currentOperatorName = sessionStorage.getItem('warehouse_user_name') || 'System';
    if (!currentUser) return;

    // Load fresh data directly from MongoDB Atlas database!
    items = await loadCSVData();
    transactions = await loadTransactionsCSV();
    
    try {
        const empResponse = await fetch(API_BASE + '/api/employees');
        employees = await empResponse.json();
    } catch (e) {
        console.error('Failed to load employees from MongoDB Atlas:', e);
        employees = [];
    }

    // Populate dynamic welcome header!
    document.getElementById('userNameHeader').textContent = currentOperatorName;
    
    // Hide auth screen, show dashboard
    document.getElementById('authContainer').classList.add('hidden');
    document.getElementById('dashboardApp').classList.remove('hidden');

    // Default Transactions View search date picker to today's local date
    const txDateInput = document.getElementById('txDateSearch');
    if (txDateInput) {
        txDateInput.value = new Date().toLocaleDateString('en-CA');
    }

    // Render workspace
    populateCategories();
    populateOperatorDropdown();
    updateStats();
    renderInventory();
    renderTransactions();
    if (currentTab === 'analytics') renderAnalytics();
    if (currentTab === 'employees') renderEmployees();
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
        case 'employees':
            switchTab('employees');
            break;
        case 'logout':
            handleLogout();
            break;
    }
}

// ========== SUCCESS ACTION MODAL & THERMAL PRINT SYSTEM ==========
let currentPrintData = null;

function showSuccessActionModal(title, subtitle, type, printData = null) {
    document.getElementById('successActionTitle').textContent = title;
    document.getElementById('successActionSubtitle').textContent = subtitle;
    
    const overlay = document.getElementById('successActionModal');
    const tick = document.getElementById('actionSuccessTick');
    const printSection = document.getElementById('successPrintSection');
    const doneSection = document.getElementById('successDoneSection');
    
    // Hide all first
    printSection.classList.add('hidden');
    doneSection.classList.add('hidden');
    tick.classList.add('scale-0');
    tick.classList.remove('scale-100');
    
    overlay.classList.remove('hidden');
    
    // Animate tick
    setTimeout(() => {
        tick.classList.remove('scale-0');
        tick.classList.add('scale-100');
    }, 50);
    
    if (printData) {
        currentPrintData = printData;
        renderReceiptSlip(printData);
        printSection.classList.remove('hidden');
    } else {
        currentPrintData = null;
        doneSection.classList.remove('hidden');
    }
}

function closeSuccessActionModal() {
    document.getElementById('successActionModal').classList.add('hidden');
    document.getElementById('actionSuccessTick').classList.add('scale-0');
    document.getElementById('actionSuccessTick').classList.remove('scale-100');
    currentPrintData = null;
}

function renderReceiptSlip(txnData) {
    const { type, date, ref, operator, itemsList, notes } = txnData;
    
    let html = `
        <div style="text-align: center; border-bottom: 1px dashed #ccc; padding-bottom: 8px; margin-bottom: 8px; line-height: 1.3;">
            <strong style="font-size: 14px; letter-spacing: 0.3px;">New Naeem Book Depot</strong><br/>
            <span style="font-size: 10px; font-weight: 600; color: #4b5563;">Hasilpur</span><br/>
            <span style="font-size: 8px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; margin-top: 3px;">Stock Movement Slip</span>
        </div>
        <div style="text-align: left; line-height: 1.4; margin-bottom: 8px; font-size: 10px;">
            <strong>Ref:</strong> ${ref}<br/>
            <strong>Date:</strong> ${new Date(date).toLocaleString()}<br/>
            <strong>Operator:</strong> ${operator}<br/>
            <strong>Type:</strong> <span style="text-transform: uppercase; font-weight: bold; color: ${type === 'in' ? '#059669' : '#dc2626'}">${type === 'in' ? 'STOCK RECEIVE (+)' : 'STOCK DISPATCH (-)'}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left; margin-bottom: 8px; font-size: 10px;">
            <thead>
                <tr style="border-bottom: 1px dashed #ccc; font-weight: bold;">
                    <th style="padding: 4px 0;">Item Name [SKU]</th>
                    <th style="padding: 4px 0; text-align: right;">Qty</th>
                </tr>
            </thead>
            <tbody>
    `;

    itemsList.forEach(item => {
        html += `
            <tr style="border-bottom: 1px dashed #eee;">
                <td style="padding: 4px 0;">${item.name}<br/><span style="font-size: 8px; color: #888;">${item.sku || 'No SKU'}</span></td>
                <td style="padding: 4px 0; text-align: right; font-weight: bold;">${item.quantity}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    if (notes) {
        html += `
            <div style="text-align: left; font-size: 9px; background: rgba(0,0,0,0.02); padding: 6px; border-radius: 4px; margin-bottom: 8px; border: 1px dashed #ddd;">
                <strong>Notes:</strong> ${notes}
            </div>
        `;
    }

    html += `
        <div style="text-align: center; border-top: 1px dashed #ccc; padding-top: 8px; font-size: 9px; color: #666;">
            System Generated Slip
        </div>
    `;

    document.getElementById('receiptSlipContent').innerHTML = html;
}

function printThermalSlip() {
    if (!currentPrintData) return;
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
        showToast('Popup blocker prevented printing. Please allow popups.', 'error');
        return;
    }
    
    const { type, date, ref, operator, itemsList, notes } = currentPrintData;
    
    let itemsRows = '';
    itemsList.forEach(item => {
        itemsRows += `
            <tr style="border-bottom: 1px dashed #eee;">
                <td style="padding: 4px 0;">${item.name}<br/><span style="font-size: 9px; color: #888;">${item.sku || 'No SKU'}</span></td>
                <td style="padding: 4px 0; text-align: right; font-weight: bold;">${item.quantity}</td>
            </tr>
        `;
    });

    const notesHtml = notes ? `
        <div style="text-align: left; font-size: 10px; background: #f9f9f9; padding: 6px; border-radius: 4px; margin-bottom: 8px; border: 1px solid #eee;">
            <strong>Notes:</strong> ${notes}
        </div>
    ` : '';

    const content = `
        <html>
        <head>
            <title>Print Receipt</title>
            <style>
                @page { size: 58mm auto; margin: 0; }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 12px;
                    width: 58mm;
                    margin: 0;
                    padding: 8px;
                    box-sizing: border-box;
                    color: #000;
                    background: #fff;
                }
                table { width: 100%; border-collapse: collapse; }
                th, td { font-size: 11px; }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; line-height: 1.3;">
                <strong style="font-size: 15px; font-family: 'Courier New', Courier, monospace;">New Naeem Book Depot</strong><br/>
                <span style="font-size: 12px; font-family: 'Courier New', Courier, monospace; font-weight: bold;">Hasilpur</span><br/>
                <span style="font-size: 9px; font-family: 'Courier New', Courier, monospace; text-transform: uppercase; margin-top: 3px; display: inline-block;">Stock Movement Slip</span>
            </div>
            <div style="text-align: left; line-height: 1.4; margin-bottom: 8px; font-size: 11px;">
                <strong>Ref:</strong> ${ref}<br/>
                <strong>Date:</strong> ${new Date(date).toLocaleString()}<br/>
                <strong>Operator:</strong> ${operator}<br/>
                <strong>Type:</strong> <span style="text-transform: uppercase; font-weight: bold;">${type === 'in' ? 'STOCK RECEIVE (+)' : 'STOCK DISPATCH (-)'}</span>
            </div>
            <table style="text-align: left; margin-bottom: 8px;">
                <thead>
                    <tr style="border-bottom: 1px dashed #000; font-weight: bold;">
                        <th style="padding: 4px 0;">Item Name [SKU]</th>
                        <th style="padding: 4px 0; text-align: right;">Qty</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>
            ${notesHtml}
            <div style="text-align: center; border-top: 1px dashed #000; padding-top: 8px; font-size: 10px;">
                System Generated Slip
            </div>
        </body>
        </html>
    `;
    
    printWindow.document.write(content);
    printWindow.document.close();
}

// ========== EMPLOYEE MANAGEMENT & TEA SLIPS ==========
async function saveEmployee(event) {
    if (event) event.preventDefault();
    if (isEmployeeSubmitting) return;
    
    const nameEl = document.getElementById('empName');
    const mobileEl = document.getElementById('empMobile');
    const submitBtn = document.getElementById('empSubmitBtn');
    
    if (!nameEl || !mobileEl) return;
    
    const name = nameEl.value.trim();
    const mobile = mobileEl.value.trim();
    
    if (!name || !mobile) {
        showToast('Please fill all employee fields!', 'error');
        return;
    }
    
    isEmployeeSubmitting = true;
    
    // Disable multi-clicks
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';
    }
    
    try {
        const response = await fetch(API_BASE + '/api/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mobile })
        });
        
        const result = await response.json();
        if (response.ok && result.success) {
            showToast('Employee profile saved successfully!', 'success');
            nameEl.value = '';
            mobileEl.value = '';
            
            // Reload employees lists from MongoDB
            const empResponse = await fetch(API_BASE + '/api/employees');
            employees = await empResponse.json();
            
            renderEmployees();
        } else {
            showToast(result.message || 'Error saving employee!', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Server connection failed!', 'error');
    } finally {
        isEmployeeSubmitting = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Employee';
        }
    }
}

async function deleteEmployee(id) {
    if (!confirm('Are you sure you want to remove this employee?')) return;
    
    try {
        const response = await fetch(API_BASE + '/api/employees/' + id, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showToast('Employee profile deleted.', 'success');
            employees = employees.filter(emp => emp.id !== id);
            renderEmployees();
        } else {
            showToast('Failed to delete employee.', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Connection error.', 'error');
    }
}

function renderEmployees() {
    const tbody = document.getElementById('employeesTableBody');
    const emptyState = document.getElementById('employeesEmptyState');
    const checklist = document.getElementById('teaEmployeesChecklist');
    
    if (!tbody) return;
    
    if (employees.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
    } else {
        if (emptyState) emptyState.classList.add('hidden');
        tbody.innerHTML = employees.map(emp => `
            <tr class="border-b border-gray-100 hover:bg-slate-50/50 transition-colors text-xs">
                <td class="py-2.5 font-medium text-gray-800">${sanitizeInput(emp.name)}</td>
                <td class="py-2.5 text-gray-500 font-mono">${sanitizeInput(emp.mobile)}</td>
                <td class="py-2.5 text-right">
                    <button onclick="deleteEmployee(${emp.id})" class="w-6 h-6 rounded-md bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors ml-auto" title="Delete">
                        <i class="fas fa-trash text-[10px]"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }
    
    // Populate checklist checkboxes for printing slips
    if (checklist) {
        if (employees.length === 0) {
            checklist.innerHTML = '<span class="text-xs text-gray-500 italic col-span-2">No employees available. Add employees on the left first.</span>';
        } else {
            checklist.innerHTML = employees.map(emp => `
                <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors">
                    <input type="checkbox" name="teaSelectEmployee" value="${sanitizeInput(emp.name)}" class="w-3.5 h-3.5 text-indigo-600 rounded">
                    <span>${sanitizeInput(emp.name)}</span>
                </label>
            `).join('');
        }
    }
}

function toggleTeaTarget() {
    const target = document.querySelector('input[name="teaTarget"]:checked').value;
    const employeesSec = document.getElementById('teaEmployeesListSection');
    const guestSec = document.getElementById('teaGuestSection');
    
    if (target === 'selected') {
        if (employeesSec) employeesSec.classList.remove('hidden');
        if (guestSec) guestSec.classList.add('hidden');
    } else if (target === 'guest') {
        if (employeesSec) employeesSec.classList.add('hidden');
        if (guestSec) guestSec.classList.remove('hidden');
    } else {
        if (employeesSec) employeesSec.classList.add('hidden');
        if (guestSec) guestSec.classList.add('hidden');
    }
}

function toggleTeaCustomReason() {
    const reason = document.getElementById('teaReason').value;
    const customSec = document.getElementById('teaCustomReasonSection');
    if (reason === 'Other') {
        if (customSec) customSec.classList.remove('hidden');
    } else {
        if (customSec) customSec.classList.add('hidden');
    }
}

function printTeaSlip(event) {
    if (event) event.preventDefault();
    
    const target = document.querySelector('input[name="teaTarget"]:checked').value;
    const rupeesEl = document.getElementById('teaRupees');
    const reasonEl = document.getElementById('teaReason');
    
    if (!rupeesEl || !reasonEl) return;
    
    const rupees = rupeesEl.value;
    let reason = reasonEl.value;
    if (reason === 'Other') {
        const customReasonEl = document.getElementById('teaCustomReason');
        reason = customReasonEl ? customReasonEl.value.trim() : 'Other Beverage';
        if (!reason) reason = 'Other Beverage';
    }
    
    let recipientsList = [];
    if (target === 'all') {
        if (employees.length === 0) {
            showToast('No active employees registered to print slips for!', 'error');
            return;
        }
        recipientsList = employees.map(emp => emp.name);
    } else if (target === 'guest') {
        const guestNameEl = document.getElementById('teaGuestName');
        let guestName = guestNameEl ? guestNameEl.value.trim() : 'Guest';
        if (!guestName) guestName = 'Guest';
        recipientsList = [guestName];
    } else {
        const checkedBoxes = document.querySelectorAll('input[name="teaSelectEmployee"]:checked');
        if (checkedBoxes.length === 0) {
            showToast('Please check at least one employee!', 'error');
            return;
        }
        recipientsList = Array.from(checkedBoxes).map(cb => cb.value);
    }
    
    const slipsArray = recipientsList.map(recName => ({
        recipient: recName,
        rupees,
        reason,
        dateTime: new Date().toLocaleString()
    }));
    
    printThermalTeaSlips(slipsArray);
}

function printThermalTeaSlips(slipsArray) {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
        showToast('Popup blocker prevented printing tea slip. Please allow popups.', 'error');
        return;
    }
    
    let slipsHtml = '';
    slipsArray.forEach((data, index) => {
        slipsHtml += `
            <div class="slip-page">
                <div class="title" style="font-size: 14px; font-family: 'Courier New', Courier, monospace; font-weight: bold; text-align: center;">
                    New Naeem Book Depot
                </div>
                <div class="title" style="font-size: 12px; font-family: 'Courier New', Courier, monospace; font-weight: bold; text-align: center;">
                    Hasilpur
                </div>
                <div class="title" style="font-size: 9px; font-family: 'Courier New', Courier, monospace; text-transform: uppercase; margin-top: 2px; text-align: center;">
                    Beverage / Tea Slip
                </div>
                
                <div class="dotted-line"></div>
                
                <div class="field-row">
                    <strong>Employe:</strong> ${data.recipient}
                </div>
                <div class="field-row">
                    <strong>Amount:</strong> Rs. ${data.rupees}
                </div>
                <div class="field-row">
                    <strong>Reason:</strong> ${data.reason}
                </div>
                <div class="field-row">
                    <strong>Date & Time:</strong><br/>
                    ${data.dateTime}
                </div>
                
                <div class="dotted-line"></div>
                
                <div style="text-align: center; font-size: 9px; font-family: 'Courier New', Courier, monospace; margin-top: 8px;">
                    Thank You!
                </div>
            </div>
        `;
    });
    
    const content = `
        <html>
        <head>
            <title>Print Tea Slips</title>
            <style>
                @page { size: 58mm auto; margin: 0; }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 12px;
                    width: 58mm;
                    margin: 0;
                    padding: 10px;
                    box-sizing: border-box;
                    color: #000;
                    background: #fff;
                }
                .dotted-line {
                    border-bottom: 1px dashed #000;
                    margin: 8px 0;
                }
                .title {
                    text-align: center;
                    font-weight: bold;
                    line-height: 1.3;
                }
                .field-row {
                    margin: 5px 0;
                    line-height: 1.4;
                    font-size: 11px;
                }
                .slip-page {
                    page-break-after: always;
                    break-after: page;
                    box-sizing: border-box;
                }
                .slip-page:last-child {
                    page-break-after: avoid;
                    break-after: avoid;
                }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            ${slipsHtml}
        </body>
        </html>
    `;
    
    printWindow.document.write(content);
    printWindow.document.close();
    showToast('Tea slip(s) generated successfully!', 'success');
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

