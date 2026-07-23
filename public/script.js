/* ==========================================================================
   ERHASTORE — AI SKIN DIAGNOSIS + PRODUCTS SCRIPT (Gemini 3.5 Flash + Firestore)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    /* ================================================================
       SECTION 1: PRODUCT CATALOG (Firestore Live)
       ================================================================ */
    async function loadFirestoreProducts() {
        try {
            const res = await fetch('/api/products');
            const result = await res.json();
            if (result.success && result.data && result.data.length > 0) {
                renderProductsGrid(result.data);
            }
        } catch (err) {
            console.log('Product load error:', err);
        }
    }

    function renderProductsGrid(products) {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;
        grid.innerHTML = products.map(prod => `
            <div class="product-card" data-category="${escapeHtml(prod.category)}">
                <div class="product-badge ${getBadgeClass(prod.category)}">${escapeHtml(prod.categoryLabel || prod.category)}</div>
                <div class="product-sku">SKU: ${escapeHtml(prod.sku)}</div>
                <div class="product-img-box">
                    <img src="${prod.imageUrl}" alt="${escapeHtml(prod.title)}" loading="lazy"
                         onerror="this.onerror=null; this.src='images/product_showcase.png';">
                </div>
                <div class="product-info">
                    <p class="product-brand">${escapeHtml(prod.brand || '')}</p>
                    <h3 class="product-name">${escapeHtml(prod.title)}</h3>
                    <div class="product-price-area">
                        ${prod.oldPrice ? `<span class="price-old">Rp ${formatPrice(prod.oldPrice)}</span>` : ''}
                        <span class="price-now">Rp ${formatPrice(prod.currentPrice)}</span>
                        ${getDiscountBadge(prod.oldPrice, prod.currentPrice)}
                    </div>
                    <a href="https://www.erhastore.co.id/" target="_blank" class="btn-buy-product">
                        <i class="fa-solid fa-cart-shopping"></i> Beli Sekarang
                    </a>
                </div>
            </div>
        `).join('');
    }

    function getBadgeClass(cat) {
        const map = { acneact:'badge-acne', truwhite:'badge-white', agecorrector:'badge-age', skinsitive:'badge-skin', erhair:'badge-hair', hiserha:'badge-men' };
        return map[cat] || 'badge-default';
    }

    function getDiscountBadge(oldPrice, newPrice) {
        if (!oldPrice || oldPrice <= newPrice) return '';
        const pct = Math.round((1 - newPrice / oldPrice) * 100);
        return `<span class="discount-badge">-${pct}%</span>`;
    }

    /* ================================================================
       BRAND CHIP FILTER
       ================================================================ */
    document.querySelectorAll('.brand-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.brand-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const filter = chip.dataset.filter;
            document.querySelectorAll('.product-card').forEach(card => {
                if (filter === 'all' || card.dataset.category === filter) {
                    card.style.display = '';
                    card.style.animation = 'fadeInUp 0.35s ease';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

    /* ================================================================
       SECTION 2: AI SKIN SCANNER
       ================================================================ */
    let capturedImageBase64 = null;
    let capturedMimeType = 'image/jpeg';
    let analysisResult = null;
    let cameraStream = null;

    const mediaPreviewBox = document.getElementById('mediaPreviewBox');
    const mediaPlaceholder = document.getElementById('mediaPlaceholder');
    const cameraFeed = document.getElementById('cameraFeed');
    const imagePreview = document.getElementById('imagePreview');
    const fileInput = document.getElementById('fileInput');
    const btnStartCamera = document.getElementById('btnStartCamera');
    const btnTriggerUpload = document.getElementById('btnTriggerUpload');
    const btnCapture = document.getElementById('btnCapture');
    const btnStopCamera = document.getElementById('btnStopCamera');
    const btnStartAnalysis = document.getElementById('btnStartAnalysis');
    const btnScanAgain = document.getElementById('btnScanAgain');

    /* ---- Camera ---- */
    btnStartCamera && btnStartCamera.addEventListener('click', async () => {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 640 }, audio: false });
            cameraFeed.srcObject = cameraStream;
            cameraFeed.classList.remove('hidden');
            mediaPlaceholder.classList.add('hidden');
            imagePreview.classList.add('hidden');
            btnStartCamera.classList.add('hidden');
            btnTriggerUpload.classList.add('hidden');
            btnCapture.classList.remove('hidden');
            btnStopCamera.classList.remove('hidden');
            capturedImageBase64 = null;
        } catch (err) {
            showToast('Tidak dapat mengakses kamera. Silakan upload foto manual.', 'error');
        }
    });

    btnCapture && btnCapture.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        canvas.width = cameraFeed.videoWidth || 640;
        canvas.height = cameraFeed.videoHeight || 640;
        canvas.getContext('2d').drawImage(cameraFeed, 0, 0);

        capturedImageBase64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
        capturedMimeType = 'image/jpeg';

        imagePreview.src = 'data:image/jpeg;base64,' + capturedImageBase64;
        imagePreview.classList.remove('hidden');
        cameraFeed.classList.add('hidden');

        stopCamera();
        btnCapture.classList.add('hidden');
        btnStopCamera.classList.add('hidden');
        btnStartCamera.classList.remove('hidden');
        btnTriggerUpload.classList.remove('hidden');
    });

    btnStopCamera && btnStopCamera.addEventListener('click', () => {
        stopCamera();
        cameraFeed.classList.add('hidden');
        mediaPlaceholder.classList.remove('hidden');
        btnCapture.classList.add('hidden');
        btnStopCamera.classList.add('hidden');
        btnStartCamera.classList.remove('hidden');
        btnTriggerUpload.classList.remove('hidden');
    });

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            cameraStream = null;
        }
    }

    /* ---- File Upload ---- */
    btnTriggerUpload && btnTriggerUpload.addEventListener('click', () => fileInput.click());

    fileInput && fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const dataURL = ev.target.result;
            capturedImageBase64 = dataURL.split(',')[1];
            capturedMimeType = file.type || 'image/jpeg';

            imagePreview.src = dataURL;
            imagePreview.classList.remove('hidden');
            mediaPlaceholder.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    });

    /* ---- Start AI Analysis ---- */
    btnStartAnalysis && btnStartAnalysis.addEventListener('click', async () => {
        if (!capturedImageBase64) {
            showToast('Silakan aktifkan kamera atau upload foto wajah terlebih dahulu.', 'warning');
            return;
        }
        await runSkinAnalysis();
    });

    async function runSkinAnalysis() {
        // Show scanning state
        switchState('stateScanning');

        // Set scanning image
        const scanImg = document.getElementById('scanningImage');
        scanImg.src = 'data:' + capturedMimeType + ';base64,' + capturedImageBase64;

        // Spawn scan dots
        spawnScanDots();

        // Simulate progress with status messages
        const statusMessages = [
            'Menginisialisasi Gemini 3.5 Flash...',
            'Memindai fitur wajah...',
            'Menganalisis tekstur & pori kulit...',
            'Mendeteksi jerawat & komedo...',
            'Menganalisis hiperpigmentasi...',
            'Memeriksa kelembapan kulit...',
            'Mengevaluasi tanda penuaan...',
            'Mencocokkan katalog produk ERHA...',
            'Menyusun laporan diagnosis...'
        ];

        let msgIdx = 0;
        const statusEl = document.getElementById('scanStatusText');
        const progressEl = document.getElementById('scanProgressFill');
        const params = ['paramJerawat','paramMinyak','paramHiper','paramLembap','paramPenuaan','paramSensitif'];

        const statusInterval = setInterval(() => {
            if (statusEl && msgIdx < statusMessages.length) {
                statusEl.textContent = statusMessages[msgIdx];
                const pct = Math.round(((msgIdx + 1) / statusMessages.length) * 85);
                if (progressEl) progressEl.style.width = pct + '%';

                // Activate parameter chips progressively
                const paramIdx = Math.floor(msgIdx / statusMessages.length * params.length);
                params.forEach((p, i) => {
                    const el = document.getElementById(p);
                    if (!el) return;
                    if (i < paramIdx) el.classList.add('done');
                    else if (i === paramIdx) el.classList.add('active');
                    else el.classList.remove('active','done');
                });

                msgIdx++;
            }
        }, 800);

        try {
            const response = await fetch('/api/skin-analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: capturedImageBase64, mimeType: capturedMimeType })
            });

            clearInterval(statusInterval);

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || 'Analisis AI gagal.');
            }

            const result = await response.json();
            if (!result.success) throw new Error(result.message || 'Analisis gagal.');

            analysisResult = result.analysis;

            // Animate progress to 100%
            if (progressEl) progressEl.style.width = '100%';
            if (statusEl) statusEl.textContent = '✅ Analisis selesai! Memuat laporan...';
            params.forEach(p => { const el = document.getElementById(p); if (el) { el.classList.add('done'); el.classList.remove('active'); } });

            await sleep(600);
            // Transition to mandatory lead form before showing report
            switchState('stateForm');

        } catch (err) {
            clearInterval(statusInterval);
            console.error('Skin analysis error:', err);
            switchState('stateInput');
            showToast('Analisis AI gagal: ' + err.message, 'error');
        }
    }

    /* ---- PRE-REPORT MANDATORY LEAD FORM SUBMISSION ---- */
    const preReportLeadForm = document.getElementById('preReportLeadForm');
    preReportLeadForm && preReportLeadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnUnlockReport');
        if (!btn) return;

        const name = document.getElementById('preName')?.value.trim();
        const whatsapp = document.getElementById('preWhatsapp')?.value.trim();
        const email = document.getElementById('preEmail')?.value.trim();
        const city = document.getElementById('preCity')?.value.trim();

        if (!name || !whatsapp || !city) {
            showToast('Nama, WhatsApp, dan Kota wajib diisi.', 'warning');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan & Membuka Laporan...';

        try {
            const payload = {
                name, email: email || '', whatsapp, city: city || '',
                analysis: analysisResult,
                imageThumb: capturedImageBase64 ? capturedImageBase64.substring(0, 200) : ''
            };

            const res = await fetch('/api/analyses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await res.json();
            if (!result.success) throw new Error(result.message || 'Gagal menyimpan data.');

            // Configure direct WA link
            const waBtn = document.getElementById('btnDirectWA');
            if (waBtn) {
                const waMsg = encodeURIComponent(`Halo, saya ${name} dari ${city}. Saya baru saja melakukan AI Skin Diagnosis di ERHASTORE dan ingin konsultasi lebih lanjut mengenai kondisi kulit saya (${analysisResult?.prioritasUtama || 'rekomendasi produk'}).`);
                waBtn.href = `https://wa.me/628001392200?text=${waMsg}`;
            }

            showToast('Analisis berhasil dibuka & disimpan!', 'success');

            // Unlock and display full report
            displayResults(analysisResult);

        } catch (err) {
            showToast('Gagal menyimpan data: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-square-check"></i> Buka Laporan Diagnostik Kulit Saya';
        }
    });

    function spawnScanDots() {
        const container = document.getElementById('scanDots');
        if (!container) return;
        container.innerHTML = '';
        const positions = [
            {top:'25%',left:'30%'},{top:'20%',left:'60%'},{top:'35%',left:'75%'},
            {top:'50%',left:'20%'},{top:'55%',left:'70%'},{top:'65%',left:'40%'},
            {top:'40%',left:'45%'},{top:'30%',left:'50%'},{top:'60%',left:'30%'}
        ];
        positions.forEach((pos, i) => {
            const dot = document.createElement('div');
            dot.className = 'scan-dot';
            dot.style.top = pos.top;
            dot.style.left = pos.left;
            dot.style.animationDelay = (i * 0.2) + 's';
            container.appendChild(dot);
        });
    }

    /* ================================================================
       SECTION 3: DISPLAY RESULTS
       ================================================================ */
    function displayResults(data) {
        switchState('stateResults');

        // Summary text
        setTextContent('resultsSummary', data.ringkasan || '—');
        setTextContent('resultsSkinType', data.tipeKulit || '—');

        // Professional diagnosis
        setTextContent('diagnosisProfessional', data.diagnosisProfesional || '—');

        // Tips
        const tipsEl = document.getElementById('diagnosisTips');
        if (tipsEl && data.tipPerawatan) {
            tipsEl.innerHTML = data.tipPerawatan.map(tip =>
                `<span class="tip-tag"><i class="fa-solid fa-lightbulb"></i> ${escapeHtml(tip)}</span>`
            ).join('');
        }

        // Score bars
        renderScoreBars(data.kondisiKulit);

        // Radar chart
        setTimeout(() => renderRadarChart(data.kondisiKulit), 300);

        // Recommended products
        renderRecommendedProducts(data.rekomendasiProduk || []);
    }

    function renderScoreBars(kondisi) {
        const grid = document.getElementById('scoreBarsGrid');
        if (!grid || !kondisi) return;

        const labels = {
            jerawat: 'Jerawat & Komedo',
            minyak: 'Minyak Berlebih',
            hiperpigmentasi: 'Hiperpigmentasi',
            kelembapan: 'Kelembapan',
            penuaan: 'Tanda Penuaan',
            sensitivitas: 'Sensitivitas'
        };

        const icons = {
            jerawat:'fa-circle-dot', minyak:'fa-droplet', hiperpigmentasi:'fa-palette',
            kelembapan:'fa-hand-holding-droplet', penuaan:'fa-hourglass-half', sensitivitas:'fa-leaf'
        };

        grid.innerHTML = Object.entries(kondisi).map(([key, val]) => {
            const skor = val.skor || 0;
            const tingkat = val.tingkat || 'Rendah';
            const fillClass = tingkat === 'Rendah' ? 'fill-low' : tingkat === 'Sedang' ? 'fill-med' : 'fill-high';
            const levelClass = tingkat === 'Rendah' ? 'level-low' : tingkat === 'Sedang' ? 'level-med' : 'level-high';

            return `
                <div class="score-bar-item">
                    <div class="score-bar-header">
                        <span class="score-bar-label">
                            <i class="fa-solid ${icons[key] || 'fa-circle'}" style="margin-right:6px;color:#00e5ff;font-size:0.75rem;"></i>
                            ${labels[key] || key}
                        </span>
                        <div class="score-bar-info">
                            <span class="score-num">${skor}/10</span>
                            <span class="score-level-badge ${levelClass}">${tingkat}</span>
                        </div>
                    </div>
                    <div class="score-track">
                        <div class="score-fill ${fillClass}" data-target-width="${skor * 10}%" style="width:0%"></div>
                    </div>
                    <div style="font-size:0.74rem;color:rgba(255,255,255,0.4);margin-top:4px;">${escapeHtml(val.keterangan || '')}</div>
                </div>`;
        }).join('');

        // Animate bars after paint
        requestAnimationFrame(() => {
            setTimeout(() => {
                grid.querySelectorAll('.score-fill').forEach(bar => {
                    bar.style.width = bar.dataset.targetWidth;
                });
            }, 100);
        });
    }

    function renderRadarChart(kondisi) {
        const svg = document.getElementById('radarChart');
        if (!svg || !kondisi) return;

        const keys = ['jerawat','minyak','hiperpigmentasi','kelembapan','penuaan','sensitivitas'];
        const labels = ['Jerawat','Minyak','Hiperpigmen.','Kelembapan','Penuaan','Sensitif'];
        const cx = 150, cy = 150, R = 110, sides = 6;

        const toXY = (i, r) => {
            const angle = (i * 2 * Math.PI / sides) - Math.PI / 2;
            return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
        };

        // Build grid hexagons
        let gridHTML = '';
        [20,40,60,80,100].forEach(pct => {
            const pts = Array.from({length: sides}, (_, i) => toXY(i, R * pct / 100));
            const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z';
            gridHTML += `<path d="${d}" fill="none" stroke="rgba(0,229,255,0.12)" stroke-width="1"/>`;
        });

        // Grid spokes
        keys.forEach((_, i) => {
            const p = toXY(i, R);
            gridHTML += `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="rgba(0,229,255,0.1)" stroke-width="1"/>`;
        });

        // Data polygon
        const dataPoints = keys.map((k, i) => {
            const skor = kondisi[k]?.skor || 0;
            return toXY(i, R * skor / 10);
        });
        const dataPath = dataPoints.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z';

        // Data points circles
        let dotsHTML = dataPoints.map(p =>
            `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#00e5ff" stroke="#020e18" stroke-width="1.5"/>`
        ).join('');

        // Labels
        let labelsHTML = keys.map((_, i) => {
            const p = toXY(i, R + 22);
            return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="rgba(255,255,255,0.6)" font-family="Plus Jakarta Sans, sans-serif">${labels[i]}</text>`;
        }).join('');

        svg.innerHTML = `
            <defs>
                <linearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#00bcd4" stop-opacity="0.6"/>
                    <stop offset="100%" stop-color="#39ff14" stop-opacity="0.3"/>
                </linearGradient>
            </defs>
            ${gridHTML}
            <path d="${dataPath}" fill="url(#radarGrad)" stroke="#00e5ff" stroke-width="2"/>
            ${dotsHTML}
            ${labelsHTML}
        `;
    }

    function renderRecommendedProducts(recs) {
        const grid = document.getElementById('recoProductsGrid');
        if (!grid) return;

        if (!recs || recs.length === 0) {
            grid.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">Tidak ada rekomendasi produk.</p>';
            return;
        }

        grid.innerHTML = recs.map(rec => {
            const prod = rec.product || {};
            const imgUrl = prod.imageUrl || 'images/product_showcase.png';
            const price = prod.currentPrice ? `Rp ${formatPrice(prod.currentPrice)}` : '';
            return `
                <div class="reco-product-card">
                    <div class="reco-ai-tag"><i class="fa-solid fa-brain"></i> AI Rekomendasi</div>
                    <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(prod.title || rec.sku)}" class="reco-product-img"
                         onerror="this.onerror=null;this.src='images/product_showcase.png';">
                    <div class="reco-product-brand">${escapeHtml(prod.brand || '')}</div>
                    <div class="reco-product-name">${escapeHtml(prod.title || rec.sku)}</div>
                    ${price ? `<div class="reco-product-price">${price}</div>` : ''}
                    <div class="reco-reason"><i class="fa-solid fa-circle-info" style="color:#00e5ff;margin-right:4px;"></i>${escapeHtml(rec.alasan || '')}</div>
                    <a href="https://www.erhastore.co.id/" target="_blank" style="display:block;margin-top:10px;text-align:center;font-size:0.76rem;color:#00e5ff;text-decoration:none;padding:6px;border-radius:6px;border:1px solid rgba(0,229,255,0.25);transition:all 0.2s ease;" onmouseover="this.style.background='rgba(0,229,255,0.08)'" onmouseout="this.style.background='transparent'">
                        <i class="fa-solid fa-cart-shopping"></i> Beli di ERHASTORE
                    </a>
                </div>`;
        }).join('');
    }

    /* ================================================================
       SECTION 4: LEAD FORM (Save Analysis to Firestore)
       ================================================================ */
    const resultsLeadForm = document.getElementById('resultsLeadForm');
    resultsLeadForm && resultsLeadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSaveAnalysis');
        if (!btn) return;

        const name = document.getElementById('resName')?.value.trim();
        const email = document.getElementById('resEmail')?.value.trim();
        const whatsapp = document.getElementById('resWhatsapp')?.value.trim();
        const city = document.getElementById('resCity')?.value.trim();

        if (!name || !whatsapp || !city) {
            showToast('Nama, WhatsApp, dan Kota wajib diisi.', 'warning');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

        try {
            const payload = {
                name, email, whatsapp, city,
                analysis: analysisResult,
                imageThumb: capturedImageBase64 ? capturedImageBase64.substring(0, 200) : ''
            };

            const res = await fetch('/api/analyses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await res.json();
            if (!result.success) throw new Error(result.message || 'Gagal menyimpan.');

            // Show success modal
            const modalName = document.getElementById('modalSavedName');
            if (modalName) modalName.textContent = name;

            const waBtn = document.getElementById('btnWaRedirect');
            if (waBtn) {
                const waMsg = encodeURIComponent(`Halo, saya ${name} dari ${city}. Saya baru saja melakukan AI Skin Diagnosis di ERHASTORE dan ingin konsultasi lebih lanjut tentang kondisi kulit saya: *${analysisResult?.prioritasUtama || 'kondisi kulit'}*.`);
                waBtn.href = `https://wa.me/628001392200?text=${waMsg}`;
            }

            document.getElementById('successModal').classList.add('show');

        } catch (err) {
            showToast('Gagal menyimpan: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Simpan & Konsultasi via WA';
        }
    });

    /* Close success modal */
    document.getElementById('btnCloseModal')?.addEventListener('click', () => {
        document.getElementById('successModal').classList.remove('show');
    });
    document.getElementById('successModal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.currentTarget.classList.remove('show');
    });

    /* Scan again */
    btnScanAgain && btnScanAgain.addEventListener('click', () => {
        capturedImageBase64 = null;
        analysisResult = null;
        imagePreview.classList.add('hidden');
        imagePreview.src = '';
        mediaPlaceholder.classList.remove('hidden');
        if (fileInput) fileInput.value = '';
        switchState('stateInput');
        document.getElementById('ai-scanner')?.scrollIntoView({ behavior: 'smooth' });
    });

    /* ================================================================
       UTILITIES
       ================================================================ */
    function switchState(stateId) {
        document.querySelectorAll('.scanner-state').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(stateId);
        if (target) target.classList.add('active');
    }

    function setTextContent(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function formatPrice(n) {
        if (!n) return '0';
        return Number(n).toLocaleString('id-ID');
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function showToast(msg, type = 'info') {
        let toast = document.getElementById('globalToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'globalToast';
            toast.style.cssText = `
                position:fixed;bottom:24px;right:24px;z-index:99999;
                padding:14px 20px;border-radius:12px;font-size:0.875rem;
                font-family:var(--font-main,'Plus Jakarta Sans',sans-serif);
                max-width:340px;box-shadow:0 8px 30px rgba(0,0,0,0.3);
                animation:slideInToast 0.3s ease;display:flex;gap:10px;align-items:center;
            `;
            document.body.appendChild(toast);
        }
        const colors = {
            info: { bg:'#0d1a2e', border:'#00e5ff', text:'#00e5ff', icon:'fa-circle-info' },
            warning: { bg:'#1a1400', border:'#ffc107', text:'#ffc107', icon:'fa-triangle-exclamation' },
            error: { bg:'#1a0000', border:'#ff5252', text:'#ff5252', icon:'fa-circle-xmark' },
            success: { bg:'#001a09', border:'#39ff14', text:'#39ff14', icon:'fa-circle-check' }
        };
        const c = colors[type] || colors.info;
        toast.style.background = c.bg;
        toast.style.border = `1px solid ${c.border}`;
        toast.style.color = '#fff';
        toast.innerHTML = `<i class="fa-solid ${c.icon}" style="color:${c.text}"></i> ${msg}`;
        toast.style.display = 'flex';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
    }

    /* ================================================================
       SECTION 5: HEADER & NAV
       ================================================================ */
    const header = document.getElementById('header');
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const curr = window.scrollY;
        if (curr > 80) header?.classList.add('scrolled');
        else header?.classList.remove('scrolled');
        lastScroll = curr;
    });

    document.getElementById('mobileToggle')?.addEventListener('click', () => {
        document.getElementById('navMenu')?.classList.toggle('open');
    });

    /* Active nav link on scroll */
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                navLinks.forEach(l => l.classList.remove('active'));
                const link = document.querySelector(`.nav-link[href="#${e.target.id}"]`);
                if (link) link.classList.add('active');
            }
        });
    }, { threshold: 0.35 });
    sections.forEach(s => observer.observe(s));

    /* ================================================================
       SECTION 6: FAQ ACCORDION
       ================================================================ */
    document.querySelectorAll('.faq-question').forEach(q => {
        q.addEventListener('click', () => {
            const item = q.closest('.faq-item');
            const isOpen = item.classList.contains('open');
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
            if (!isOpen) item.classList.add('open');
        });
    });

    /* ================================================================
       SECTION 7: COUNTER ANIMATION
       ================================================================ */
    const counters = document.querySelectorAll('[data-target]');
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                const el = e.target;
                const target = parseInt(el.dataset.target);
                let count = 0;
                const step = Math.max(1, Math.floor(target / 80));
                const timer = setInterval(() => {
                    count = Math.min(count + step, target);
                    el.textContent = count >= 1000 ? (count / 1000).toFixed(0) + 'K+' : count + '+';
                    if (count >= target) clearInterval(timer);
                }, 20);
                counterObserver.unobserve(el);
            }
        });
    }, { threshold: 0.5 });
    counters.forEach(c => counterObserver.observe(c));

    /* ================================================================
       INIT
       ================================================================ */
    loadFirestoreProducts();

    /* Add toast animation CSS if not present */
    if (!document.getElementById('toastAnimStyle')) {
        const style = document.createElement('style');
        style.id = 'toastAnimStyle';
        style.textContent = `@keyframes slideInToast { from { transform:translateX(40px);opacity:0; } to { transform:translateX(0);opacity:1; } }`;
        document.head.appendChild(style);
    }
});
