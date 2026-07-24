require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const admin = require('firebase-admin');
const vertexAIProxyHandler = require('./api/vertex-proxy');

/* ==========================================================================
   SERVICE ACCOUNT #1: Firebase Admin SDK → Firestore (erha-4755a)
   ========================================================================== */
let firestoreServiceAccount;
if (process.env.FIRESTORE_SERVICE_ACCOUNT) {
  try {
    firestoreServiceAccount = typeof process.env.FIRESTORE_SERVICE_ACCOUNT === 'string'
      ? JSON.parse(process.env.FIRESTORE_SERVICE_ACCOUNT)
      : process.env.FIRESTORE_SERVICE_ACCOUNT;
  } catch (e) {
    console.error('Failed to parse FIRESTORE_SERVICE_ACCOUNT env:', e);
  }
}

if (!firestoreServiceAccount) {
  try {
    firestoreServiceAccount = require('./serviceAccountKey.json');
  } catch (e) {
    console.log('serviceAccountKey.json not found, skipping local file require');
  }
}

if (!admin.apps.length && firestoreServiceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(firestoreServiceAccount)
    });
  } catch (e) {
    console.error('Failed to initialize Firebase Admin (Firestore disabled):', e.message);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

const VERTEX_PROJECT = 'tutorialappbuilder';
const GEMINI_MODEL = 'gemini-3.5-flash';

/* --- ERHA Product Catalog Knowledge Base (Embedded for Gemini) --- */
const ERHA_IMG = 'https://www.erhastore.co.id/media/catalog/product';
const ERHA_PRODUCT_CATALOG = [
  { sku:"F122517", brand:"ERHA AGE CORRECTOR", title:"Serum Peptides & Phytoplacenta 20ml", category:"agecorrector", concern:"anti-aging,kerutan,garis halus,kulit kendur", currentPrice:205500, img:`${ERHA_IMG}/a/g/agecorr_serum.webp` },
  { sku:"F122610", brand:"ERHA AGE CORRECTOR", title:"Peptides & Hyaluronate Day Cream 30g", category:"agecorrector", concern:"anti-aging,kerutan,dehidrasi kulit", currentPrice:186500, img:`${ERHA_IMG}/a/g/agecorr_day_moist.webp` },
  { sku:"F123017", brand:"ERHA AGE CORRECTOR", title:"1% Pure Retinol Night Charge Booster 15ml", category:"agecorrector", concern:"anti-aging,pembaharuan sel kulit,penuaan", currentPrice:211500, img:`${ERHA_IMG}/a/g/agecorr_night_charge.webp` },
  { sku:"F122021", brand:"ERHA TRUWHITE", title:"3% TXA & Hexyl Resorcinol Active Glow Booster 15ml", category:"truwhite", concern:"flek hitam,hiperpigmentasi,kulit kusam,warna tidak merata", currentPrice:211500, img:`${ERHA_IMG}/t/r/truwhite_active_glow.png` },
  { sku:"F122856", brand:"ERHA TRUWHITE", title:"Brightening Day Cream Niacinamide & Arbutin 30g", category:"truwhite", concern:"flek hitam,kulit kusam,brightening,warna tidak rata", currentPrice:178500, img:`${ERHA_IMG}/t/r/truwhite_day_cream.webp` },
  { sku:"F122183", brand:"ERHA TRUWHITE", title:"Niacinamide & Peptide Dark Spot Corrector 15g", category:"truwhite", concern:"noda bekas jerawat,flek hitam,hiperpigmentasi", currentPrice:139000, img:`${ERHA_IMG}/t/r/truwhite_dark_spot_corr.webp` },
  { sku:"F122281", brand:"ERHA ACNEACT", title:"BHA & Sulfur Acne Spot Gel 10g", category:"acneact", concern:"jerawat meradang,jerawat aktif,komedo", currentPrice:62500, img:`${ERHA_IMG}/e/r/erha_acne_spot_gel_10g.png` },
  { sku:"F123053", brand:"ERHA ACNEACT", title:"BHA & Niacinamide Acne Body Spray 100ml", category:"acneact", concern:"jerawat badan,punggung berjerawat,minyak berlebih", currentPrice:92000, img:`${ERHA_IMG}/a/c/acneact_body_spray.webp` },
  { sku:"F122284", brand:"ERHA ACNEACT", title:"Pore Minimizer & Oil Control Gel Cream 30g", category:"acneact", concern:"pori besar,minyak berlebih,kulit berminyak", currentPrice:112500, img:`${ERHA_IMG}/a/c/acneact_gel_cream.png` },
  { sku:"F122213", brand:"ERHA SKINSITIVE", title:"Ultracalm Face Serum Sensitive Skin 30g", category:"skinsitive", concern:"kulit sensitif,kemerahan,iritasi,barrier rusak", currentPrice:195500, img:`${ERHA_IMG}/a/r/artboard_5.png` },
  { sku:"F122293", brand:"ERHA SKINSITIVE", title:"Ultracalm Skin Barrier Moisturizer 80ml", category:"skinsitive", concern:"barrier rusak,kulit sensitif,kemerahan,dehidrasi", currentPrice:156000, img:`${ERHA_IMG}/s/b/sbm.png` },
  { sku:"F123106", brand:"ERHAIR", title:"Hairgrow Tonic Hairfall Control 90ml", category:"erhair", concern:"rambut rontok,kebotakan,rambut tipis", currentPrice:146000, img:`${ERHA_IMG}/e/r/erhair_hairgrow_tonic_with_kopexil_90_ml.webp` },
  { sku:"FCGN2",   brand:"ERHAIR", title:"Hairgrow Shampoo Hairfall Protection 250ml", category:"erhair", concern:"rambut rontok,kulit kepala sensitif,ketombe", currentPrice:118000, img:`${ERHA_IMG}/e/r/erhair_hair_fall_protection_shampoo_250.webp` },
  { sku:"F122268", brand:"HISERHA", title:"Double Deep Cleansing Facial Wash Pria 100g", category:"hiserha", concern:"kulit pria berminyak,pori tersumbat,polusi", currentPrice:78000, img:`${ERHA_IMG}/h/i/hiserha_double_deep_cleansing_facial_wash_100gr.jpg` },
  { sku:"F122915", brand:"HISERHA", title:"Gentle Acne Facial Wash for Men 100g", category:"hiserha", concern:"jerawat pria,komedo pria,kulit berminyak", currentPrice:76500, img:`${ERHA_IMG}/h/i/hiserha_gentle_acne_fw.webp` }
];

const CATALOG_TEXT = ERHA_PRODUCT_CATALOG.map(p =>
  `- SKU: ${p.sku} | ${p.brand} | ${p.title} | Rp ${p.currentPrice.toLocaleString('id-ID')} | Cocok untuk: ${p.concern}`
).join('\n');

const GEMINI_SYSTEM_PROMPT = `Anda adalah Dermatologist AI Expert dari ERHASTORE Official. Anda menganalisis kondisi kulit dari foto wajah secara profesional dan klinis.

KATALOG PRODUK ERHA (Gunakan hanya SKU dari daftar ini untuk rekomendasi):
${CATALOG_TEXT}

INSTRUKSI OUTPUT:
Berikan respons HANYA dalam format JSON valid berikut (tanpa markdown, tanpa teks lain):
{
  "ringkasan": "Ringkasan kondisi kulit dalam 2-3 kalimat bahasa Indonesia, profesional dan klinis",
  "tipeKulit": "Berminyak|Kering|Kombinasi|Sensitif|Normal",
  "kondisiKulit": {
    "jerawat": { "skor": 0-10, "keterangan": "penjelasan singkat", "tingkat": "Rendah|Sedang|Tinggi" },
    "minyak": { "skor": 0-10, "keterangan": "penjelasan singkat", "tingkat": "Rendah|Sedang|Tinggi" },
    "hiperpigmentasi": { "skor": 0-10, "keterangan": "penjelasan singkat", "tingkat": "Rendah|Sedang|Tinggi" },
    "kelembapan": { "skor": 0-10, "keterangan": "penjelasan singkat", "tingkat": "Rendah|Sedang|Tinggi" },
    "penuaan": { "skor": 0-10, "keterangan": "penjelasan singkat", "tingkat": "Rendah|Sedang|Tinggi" },
    "sensitivitas": { "skor": 0-10, "keterangan": "penjelasan singkat", "tingkat": "Rendah|Sedang|Tinggi" }
  },
  "diagnosisProfesional": "Diagnosis medis dermatologis lengkap dalam bahasa Indonesia (minimal 3 paragraf)",
  "rekomendasiProduk": [
    { "sku": "SKU_DARI_KATALOG", "alasan": "Alasan klinis singkat mengapa produk ini direkomendasikan" }
  ],
  "tipPerawatan": ["tip perawatan 1", "tip perawatan 2", "tip perawatan 3", "tip perawatan 4"],
  "prioritasUtama": "Masalah kulit yang paling perlu ditangani"
}

Berikan minimum 3, maksimum 5 rekomendasi produk yang relevan berdasarkan kondisi kulit yang terdeteksi.`;

/* ==========================================================================
   EXPRESS APP
   ========================================================================== */
const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

/* ==========================================================================
   SEED PRODUCTS (if Firestore is empty)
   ========================================================================== */
const initialProducts = ERHA_PRODUCT_CATALOG.map(p => ({
  ...p,
  oldPrice: Math.round(p.currentPrice * 1.18),
  categoryLabel: {
    agecorrector: 'Anti-Aging', truwhite: 'Brightening',
    acneact: 'Acne Care', skinsitive: 'Barrier Repair',
    erhair: 'Hair Care', hiserha: 'Men Grooming'
  }[p.category] || p.category,
  desc: '',
  imageUrl: p.img
}));

async function seedProductsIfEmpty() {
  try {
    const snapshot = await db.collection('products').get();
    if (snapshot.empty) {
      console.log('🌱 Seeding products to Firestore...');
      const batch = db.batch();
      initialProducts.forEach(prod => {
        const docRef = db.collection('products').doc(prod.sku);
        batch.set(docRef, { ...prod, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      await batch.commit();
      console.log('✅ Products seeded!');
    }
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}

seedProductsIfEmpty();

/* ==========================================================================
   API: ADMIN AUTHENTICATION (Hardcoded)
   ========================================================================== */
const ADMIN_CREDENTIALS = { email: 'leonafariz01@gmail.com', password: 'erhamantap!' };

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
    return res.json({ success: true, token: 'erha-admin-session-token-998877', user: { email, name: 'Admin ERHA' } });
  }
  return res.status(401).json({ success: false, message: 'Email atau password salah!' });
});

/* ==========================================================================
   API: VERTEX AI → GEMINI 3.5 FLASH — SKIN ANALYSIS (Image)
   ========================================================================== */
app.post('/api/skin-analyze', async (req, res) => {
  const { imageBase64, mimeType = 'image/jpeg' } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ success: false, message: 'Gambar wajah diperlukan untuk analisis.' });
  }

  try {
    const fakeReq = {
      body: {
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: GEMINI_SYSTEM_PROMPT + '\nAnalisis kondisi kulit wajah pada foto ini secara profesional dan berikan rekomendasi produk ERHA yang tepat dalam format JSON yang telah ditentukan.' }
          ]
        }]
      }
    };

    // Forward to serverless proxy logic internally
    let responseData;
    const fakeRes = {
      status: (code) => ({
        json: (data) => { responseData = data; }
      })
    };

    await vertexAIProxyHandler(fakeReq, fakeRes);

    if (!responseData || !responseData.candidates || !responseData.candidates[0]) {
      throw new Error(responseData?.error?.message || 'Gagal menerima respons dari Gemini.');
    }

    const responseText = responseData.candidates[0].content.parts[0].text;

    let analysisData;
    try {
      analysisData = JSON.parse(responseText);
    } catch (parseErr) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Gagal mem-parse respons AI.');
      }
    }

    // Enrich recommended products with catalog details
    if (analysisData.rekomendasiProduk) {
      analysisData.rekomendasiProduk = analysisData.rekomendasiProduk.map(rec => {
        const product = ERHA_PRODUCT_CATALOG.find(p => p.sku === rec.sku);
        return { ...rec, product: product ? { ...product, imageUrl: product.img } : null };
      }).filter(r => r.product !== null);
    }

    res.json({ success: true, analysis: analysisData });
  } catch (err) {
    console.error('Gemini analyze error:', err.message);
    res.status(500).json({ success: false, message: 'AI Skin Analysis gagal: ' + err.message });
  }
});

/* ==========================================================================
   API: SERVERLESS PROXY FUNCTION FOR VERTEX AI (REST API)
   ========================================================================== */
app.post('/api/vertex-proxy', vertexAIProxyHandler);

/* ==========================================================================
   API: FIRESTORE — ANALYSES (Save & Retrieve)
   ========================================================================== */
app.post('/api/analyses', async (req, res) => {
  try {
    const { name, email, whatsapp, city, analysis, imageThumb } = req.body;
    if (!name || !whatsapp) {
      return res.status(400).json({ success: false, message: 'Nama dan WhatsApp wajib diisi.' });
    }

    const doc = {
      name, email: email || '', whatsapp, city: city || '',
      analysis: analysis || {},
      imageThumb: imageThumb || '',
      prioritasUtama: analysis?.prioritasUtama || '',
      tipeKulit: analysis?.tipeKulit || '',
      rekomendasiSkus: (analysis?.rekomendasiProduk || []).map(r => r.sku),
      status: 'Baru',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdDate: new Date().toISOString()
    };

    const docRef = await db.collection('analyses').add(doc);
    res.json({ success: true, id: docRef.id, message: 'Analisis berhasil disimpan!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/analyses', async (req, res) => {
  try {
    const snapshot = await db.collection('analyses').orderBy('createdAt', 'desc').get();
    const analyses = [];
    snapshot.forEach(doc => analyses.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: analyses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/analyses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('analyses').doc(id).update({ status: req.body.status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   API: FIRESTORE — PRODUCTS (CRUD)
   ========================================================================== */
app.get('/api/products', async (req, res) => {
  try {
    if (db) {
      const snapshot = await db.collection('products').get();
      if (!snapshot.empty) {
        const products = [];
        snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
        return res.json({ success: true, data: products });
      }
    }
    // Fallback: serve the built-in catalog (with real ERHA store images)
    // so products still display when Firestore is unavailable or empty.
    return res.json({ success: true, data: initialProducts, fallback: true });
  } catch (err) {
    return res.json({ success: true, data: initialProducts, fallback: true, note: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const productData = req.body;
    if (!productData.sku || !productData.title) {
      return res.status(400).json({ success: false, message: 'SKU dan Judul wajib diisi.' });
    }
    await db.collection('products').doc(productData.sku).set({
      ...productData,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, id: productData.sku });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/products/:sku', async (req, res) => {
  try {
    await db.collection('products').doc(req.params.sku).update(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/products/:sku', async (req, res) => {
  try {
    await db.collection('products').doc(req.params.sku).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   STATIC SERVING — Serves from /public on Vercel, root for local dev
   ========================================================================== */
const publicDir = path.join(__dirname, 'public');
const rootDir = __dirname;

// Serve admin static files
app.use('/admin', express.static(path.join(publicDir, 'admin')));
app.use('/admin', express.static(path.join(rootDir, 'admin')));

// Serve other static files (CSS, JS, images)
app.use(express.static(publicDir));
app.use(express.static(rootDir));

// Explicit landing page route
app.get('/', (req, res) => {
  const indexPath = require('fs').existsSync(path.join(publicDir, 'index.html'))
    ? path.join(publicDir, 'index.html')
    : path.join(rootDir, 'index.html');
  res.sendFile(indexPath);
});

// Admin panel catch-all
app.get('/admin', (req, res) => {
  const adminPath = require('fs').existsSync(path.join(publicDir, 'admin', 'index.html'))
    ? path.join(publicDir, 'admin', 'index.html')
    : path.join(rootDir, 'admin', 'index.html');
  res.sendFile(adminPath);
});

app.get('/admin/*', (req, res) => {
  const adminPath = require('fs').existsSync(path.join(publicDir, 'admin', 'index.html'))
    ? path.join(publicDir, 'admin', 'index.html')
    : path.join(rootDir, 'admin', 'index.html');
  res.sendFile(adminPath);
});

const PORT = process.env.PORT || 8080;
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 ERHA Server Running!`);
    console.log(`🌐 Landing Page:  http://localhost:${PORT}`);
    console.log(`🔐 Admin Panel:   http://localhost:${PORT}/admin`);
    console.log(`🤖 Gemini Model:  ${GEMINI_MODEL} (${VERTEX_PROJECT})`);
    console.log(`🔥 Firestore:     erha-4755a`);
    console.log(`====================================================`);
  });
}

module.exports = app;
