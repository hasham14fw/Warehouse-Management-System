require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = 'Database';

if (!MONGO_URI) {
    console.error('Error: MONGODB_URI environment variable is not set in .env file!');
    process.exit(1);
}

let db;
let client;

async function connectDB() {
    try {
        client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db(DB_NAME);
        console.log(`Successfully connected to MongoDB Atlas database: "${DB_NAME}"`);
    } catch (e) {
        console.error('MongoDB Atlas connection failed:', e);
        process.exit(1);
    }
}

// ========== HELPER SECURITY FUNCTIONS ==========
function computeHash(password, salt) {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
}

function validatePassword(password) {
    return password && password.length >= 4;
}

// ========== API ENDPOINTS ==========

// 1. Secure Login (POST /api/auth/login)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        const user = await db.collection('users').findOne({ username: username.trim().toLowerCase() });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        // Verify hash on the secure server-side!
        const computed = computeHash(password, user.salt || '');
        if (computed === user.passwordHash) {
            res.json({
                success: true,
                message: 'Login successful',
                user: { username: user.username, name: user.name }
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 2. Secure Create New Operator (POST /api/users)
app.post('/api/users', async (req, res) => {
    try {
        const { username, name, password } = req.body;

        if (!username || !name || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({ success: false, message: 'Password is too weak! Must have 4+ characters.' });
        }

        const normalizedUsername = username.trim().toLowerCase();
        const existing = await db.collection('users').findOne({ username: normalizedUsername });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }

        // Secure Salt & Hash generation on the server-side!
        const salt = crypto.randomBytes(4).toString('hex');
        const passwordHash = computeHash(password, salt);

        const newUser = {
            username: normalizedUsername,
            name: name.trim(),
            passwordHash,
            salt
        };

        await db.collection('users').insertOne(newUser);
        res.json({ success: true, message: 'Operator account created successfully' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 3. Fetch Inventory
app.get('/api/inventory', async (req, res) => {
    try {
        const items = await db.collection('inventory').find().toArray();
        res.json(items);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Save or Update Inventory Item
app.post('/api/inventory', async (req, res) => {
    try {
        const item = req.body;
        delete item._id;
        
        if (!item.id) {
            item.id = Date.now();
        }
        
        // Find existing using both integer and string matches to prevent duplicates due to MongoDB type strictness
        const existing = await db.collection('inventory').findOne({
            $or: [
                { id: item.id },
                { id: parseInt(item.id) || 0 },
                { id: String(item.id) }
            ]
        });
        if (existing) {
            await db.collection('inventory').updateOne({ id: existing.id }, { $set: item });
            res.json({ success: true, message: 'Item updated', item });
        } else {
            const numId = parseInt(item.id);
            if (!isNaN(numId)) {
                item.id = numId;
            }
            await db.collection('inventory').insertOne(item);
            res.json({ success: true, message: 'Item inserted', item });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. Update Inventory Item (PUT)
app.put('/api/inventory/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updates = req.body;
        delete updates._id;

        await db.collection('inventory').updateOne({
            $or: [
                { id: id },
                { id: String(id) }
            ]
        }, { $set: updates });
        res.json({ success: true, message: 'Item updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 6. Delete Inventory Item
app.delete('/api/inventory/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await db.collection('inventory').deleteOne({
            $or: [
                { id: id },
                { id: String(id) }
            ]
        });
        res.json({ success: true, message: 'Item deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. Fetch Transactions
app.get('/api/transactions', async (req, res) => {
    try {
        const trans = await db.collection('transactions').find().toArray();
        res.json(trans);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 8. Save Transaction Log
app.post('/api/transactions', async (req, res) => {
    try {
        const trans = req.body;
        delete trans._id;

        if (!trans.id) {
            trans.id = Date.now();
        }
        await db.collection('transactions').insertOne(trans);
        res.json({ success: true, message: 'Transaction logged', trans });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 9. Delete Transaction Log
app.delete('/api/transactions/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await db.collection('transactions').deleteOne({ id });
        res.json({ success: true, message: 'Transaction deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 10. Fetch Employees List
app.get('/api/employees', async (req, res) => {
    try {
        const emps = await db.collection('employes').find().toArray();
        res.json(emps);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 11. Add or Update Employee (With Mobile Uniqueness Check)
app.post('/api/employees', async (req, res) => {
    try {
        const emp = req.body;
        delete emp._id;
        if (!emp.id) {
            emp.id = Date.now();
        }
        if (emp.mobile) {
            const existing = await db.collection('employes').findOne({ mobile: emp.mobile.trim() });
            if (existing && existing.id !== emp.id) {
                return res.status(400).json({ success: false, message: 'Employee with this mobile number already exists!' });
            }
        }
        
        const existingById = await db.collection('employes').findOne({
            $or: [
                { id: emp.id },
                { id: parseInt(emp.id) || 0 },
                { id: String(emp.id) }
            ]
        });
        if (existingById) {
            await db.collection('employes').updateOne({ id: existingById.id }, { $set: emp });
            res.json({ success: true, message: 'Employee updated', employee: emp });
        } else {
            const numId = parseInt(emp.id);
            if (!isNaN(numId)) {
                emp.id = numId;
            }
            await db.collection('employes').insertOne(emp);
            res.json({ success: true, message: 'Employee inserted', employee: emp });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 12. Delete Employee Profile
app.delete('/api/employees/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await db.collection('employes').deleteOne({
            $or: [
                { id: id },
                { id: String(id) }
            ]
        });
        res.json({ success: true, message: 'Employee deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Serve index.html for root requests
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Connect to DB and Start Server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
});
