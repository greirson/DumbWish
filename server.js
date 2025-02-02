const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const app = express();
const port = process.env.PORT || 3000;
const dataDir = 'data';
const dataFile = path.join(dataDir, 'wishlist.json');

// Currency mapping
const CURRENCY_SYMBOLS = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CNY: '¥',
    KRW: '₩',
    INR: '₹',
    RUB: '₽',
    BRL: 'R$',
    AUD: 'A$',
    CAD: 'C$',
    CHF: 'Fr',
    HKD: 'HK$',
    NZD: 'NZ$',
    SEK: 'kr',
    NOK: 'kr',
    DKK: 'kr',
    PLN: 'zł',
    THB: '฿',
    MXN: '$',
};

// Configuration
const config = {
    port: process.env.PORT || 3000,
    pinProtection: process.env.DUMBDO_PIN ? 'enabled' : 'disabled',
    maxImageSize: 1024,
    currencyCode: (process.env.DUMBWISH_CURRENCY || 'USD').toUpperCase(),
    title: process.env.DUMBWISH_TITLE || 'DumbWish',
    get currencySymbol() {
        return CURRENCY_SYMBOLS[this.currencyCode] || '$';
    }
};

// Configure multer for image uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
    },
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

// Ensure data directory exists
const ensureDataDir = async () => {
    try {
        await fs.mkdir(dataDir, { recursive: true });
        try {
            await fs.access(dataFile);
        } catch {
            await fs.writeFile(dataFile, '[]');
        }
    } catch (err) {
        console.error('Error initializing data directory:', err);
        process.exit(1); // Exit if we can't initialize data directory
    }
};

// Process and save image
async function processImage(buffer, id) {
    const imagePath = path.join(dataDir, `${id}.jpeg`);
    
    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    
    // Calculate dimensions maintaining aspect ratio
    let width = metadata.width;
    let height = metadata.height;
    const maxDimension = config.maxImageSize;

    if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    await sharp(buffer)
        .resize(width, height, {
            fit: 'inside',
            withoutEnlargement: true
        })
        .jpeg({ 
            quality: 80,
            chromaSubsampling: '4:4:4' // Better quality for images with text
        })
        .toFile(imagePath);

    return `/api/images/${id}.jpeg`;
}

// Delete image if exists
async function deleteImage(id) {
    try {
        await fs.unlink(path.join(dataDir, `${id}.jpeg`));
    } catch (err) {
        // Ignore if file doesn't exist
        if (err.code !== 'ENOENT') {
            console.error('Error deleting image:', err);
        }
    }
}

app.use(express.json());
app.use(express.static('public'));

// Serve images
app.use('/api/images', express.static(dataDir));

// Error handler middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
};

// PIN auth middleware
const auth = (req, res, next) => {
    const pin = process.env.DUMBDO_PIN;
    if (!pin) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        const err = new Error('No authorization header');
        err.status = 401;
        return next(err);
    }

    const providedPin = authHeader.split(' ')[1];
    if (providedPin !== pin) {
        const err = new Error('Invalid PIN');
        err.status = 401;
        return next(err);
    }

    next();
};

// Get all wishlist items
app.get('/api/wishlist', async (req, res, next) => {
    try {
        const data = await fs.readFile(dataFile, 'utf8');
        res.json({
            items: JSON.parse(data),
            config: {
                currencySymbol: config.currencySymbol,
                currencyCode: config.currencyCode
            }
        });
    } catch (err) {
        next(err);
    }
});

// Upload image for item
app.post('/api/wishlist/image/:id', auth, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const id = parseInt(req.params.id);
        const imageUrl = await processImage(req.file.buffer, id);
        res.json({ imageUrl });
    } catch (err) {
        console.error('Error processing image:', err);
        res.status(500).json({ error: 'Error processing image' });
    }
});

// Add new wishlist item (protected)
app.post('/api/wishlist', auth, upload.single('image'), async (req, res, next) => {
    try {
        const { title, url, price, note } = req.body;
        if (!title) {
            const err = new Error('Title is required');
            err.status = 400;
            throw err;
        }

        const data = JSON.parse(await fs.readFile(dataFile, 'utf8'));
        const id = Date.now();
        let image = req.body.image || null;
        
        if (req.file) {
            image = await processImage(req.file.buffer, id);
        }

        const newItem = {
            id,
            title,
            url,
            price,
            note,
            image,
            dateAdded: new Date().toISOString()
        };

        data.push(newItem);
        await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
        res.json(newItem);
    } catch (err) {
        next(err);
    }
});

// Update wishlist item (protected)
app.put('/api/wishlist/:id', auth, upload.single('image'), async (req, res) => {
    try {
        const { title, url, price, note } = req.body;
        if (!title) {
            res.status(400).json({ error: 'Title is required' });
            return;
        }

        const data = JSON.parse(await fs.readFile(dataFile, 'utf8'));
        const itemIndex = data.findIndex(item => item.id === parseInt(req.params.id));
        
        if (itemIndex === -1) {
            res.status(404).json({ error: 'Item not found' });
            return;
        }

        let image = req.body.image || data[itemIndex].image;

        // Process uploaded image if exists
        if (req.file) {
            image = await processImage(req.file.buffer, data[itemIndex].id);
        }

        const updatedItem = {
            ...data[itemIndex],
            title,
            url,
            price,
            note,
            image,
            dateUpdated: new Date().toISOString()
        };

        data[itemIndex] = updatedItem;
        await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
        res.json(updatedItem);
    } catch (err) {
        res.status(500).json({ error: 'Error updating item' });
    }
});

// Delete wishlist item (protected)
app.delete('/api/wishlist/:id', auth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const data = JSON.parse(await fs.readFile(dataFile, 'utf8'));
        const newData = data.filter(item => item.id !== id);
        await fs.writeFile(dataFile, JSON.stringify(newData, null, 2));
        
        // Delete associated image
        await deleteImage(id);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error deleting item' });
    }
});

app.get('/', (req, res) => {
    // Read and serve index.html with dynamic title
    fs.readFile('public/index.html', 'utf8')
        .then(content => {
            content = content.replace('<title>DumbWish - Simple Wishlist</title>', `<title>${config.title}</title>`);
            res.send(content);
        })
        .catch(err => {
            console.error('Error reading index.html:', err);
            res.status(500).send('Server Error');
        });
});

// Serve static files except index.html
app.use(express.static('public', {
    index: false
}));

// Use error handler
app.use(errorHandler);

ensureDataDir().then(() => {
    app.listen(port, () => {
        console.log('\x1b[32m%s\x1b[0m', `🎁 ${config.title}`);
        console.log('\x1b[36m%s\x1b[0m', '--------------------');
        console.log('📡 Port:', config.port);
        console.log('🔒 PIN Protection:', config.pinProtection);
        console.log('💾 Data Storage:', dataFile);
        console.log('📸 Max Image Size:', config.maxImageSize + 'px');
        console.log('💰 Currency:', `${config.currencyCode} (${config.currencySymbol})`);
        console.log('\x1b[36m%s\x1b[0m', '--------------------');
    });
}); 
