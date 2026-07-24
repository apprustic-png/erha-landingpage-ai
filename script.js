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
    const scanCanvas = document.getElementById('scanCanvas');
    const imagePreview = document.getElementById('imagePreview');
    const fileInput = document.getElementById('fileInput');
    const btnStartCamera = document.getElementById('btnStartCamera');
    const btnTriggerUpload = document.getElementById('btnTriggerUpload');
    const btnCapture = document.getElementById('btnCapture');
    const btnStopCamera = document.getElementById('btnStopCamera');
    const btnStartAnalysis = document.getElementById('btnStartAnalysis');
    const btnScanAgain = document.getElementById('btnScanAgain');

    /* ================================================================
       MediaPipe Face Mesh — Sci-Fi Wireframe Overlay (468 landmarks)
       100% client-side, real-time. Renders a neon 3D wireframe mesh
       and glowing particles that track the face on an HTML5 <canvas>.
       ================================================================ */
    const FaceMeshFX = (function () {
        const CYAN = '0,229,255';
        const GREEN = '57,255,20';
        let model = null;
        let loadingPromise = null;
        let sending = false;

        // live (camera) state
        let liveOn = false, liveVideo = null, liveCanvas = null, liveCtx = null, liveLms = null, liveRaf = null;
        // still (captured/uploaded image) state
        let stillOn = false, stillImg = null, stillCanvas = null, stillCtx = null, stillLms = null, stillRaf = null, stillT0 = 0;

        function available() { return typeof FaceMesh !== 'undefined'; }

        function loadModel() {
            if (model) return Promise.resolve(model);
            if (loadingPromise) return loadingPromise;
            if (!available()) return Promise.reject(new Error('MediaPipe FaceMesh belum termuat'));
            loadingPromise = new Promise((resolve, reject) => {
                try {
                    const fm = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
                    fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
                    model = fm;
                    resolve(fm);
                } catch (e) { reject(e); }
            });
            return loadingPromise;
        }

        function fitCanvas(canvas) {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.max(1, Math.round((rect.width || canvas.clientWidth || 320) * dpr));
            const h = Math.max(1, Math.round((rect.height || canvas.clientHeight || 320) * dpr));
            canvas.width = w; canvas.height = h;
        }

        // maps normalized landmark coords through an object-fit:cover transform
        function coverTf(iw, ih, W, H) {
            const scale = Math.max(W / iw, H / ih);
            return { scale, offX: (W - iw * scale) / 2, offY: (H - ih * scale) / 2, iw, ih };
        }

        function drawMesh(ctx, lms, W, H, tf, timeSec, sweepY) {
            ctx.clearRect(0, 0, W, H);
            if (!lms || !lms.length || !tf) return;
            const mx = (p) => tf.offX + p.x * tf.iw * tf.scale;
            const my = (p) => tf.offY + p.y * tf.ih * tf.scale;
            const unit = W / 640;

            ctx.save();
            ctx.lineCap = 'round';

            // 1) 3D wireframe mesh (tesselation / spider-web)
            const TESS = (typeof FACEMESH_TESSELATION !== 'undefined') ? FACEMESH_TESSELATION : null;
            if (TESS) {
                ctx.lineWidth = Math.max(0.5, unit * 0.8);
                ctx.strokeStyle = `rgba(${CYAN},0.30)`;
                ctx.shadowColor = `rgba(${CYAN},0.85)`;
                ctx.shadowBlur = 5;
                ctx.beginPath();
                for (let i = 0; i < TESS.length; i++) {
                    const a = lms[TESS[i][0]], b = lms[TESS[i][1]];
                    if (!a || !b) continue;
                    ctx.moveTo(mx(a), my(a));
                    ctx.lineTo(mx(b), my(b));
                }
                ctx.stroke();
            }

            // 2) Face contour glow (oval)
            const OVAL = (typeof FACEMESH_FACE_OVAL !== 'undefined') ? FACEMESH_FACE_OVAL : null;
            if (OVAL) {
                ctx.lineWidth = Math.max(1, unit * 1.6);
                ctx.strokeStyle = `rgba(${GREEN},0.55)`;
                ctx.shadowColor = `rgba(${GREEN},0.9)`;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                for (let i = 0; i < OVAL.length; i++) {
                    const a = lms[OVAL[i][0]], b = lms[OVAL[i][1]];
                    if (!a || !b) continue;
                    ctx.moveTo(mx(a), my(a));
                    ctx.lineTo(mx(b), my(b));
                }
                ctx.stroke();
            }

            // 3) Glowing neon landmark particles
            for (let i = 0; i < lms.length; i++) {
                const p = lms[i];
                const px = mx(p), py = my(p);
                let near = 0;
                if (sweepY != null) near = Math.max(0, 1 - Math.abs(py - sweepY) / (H * 0.10));
                const pulse = 0.5 + 0.5 * Math.sin(timeSec * 3 + i * 0.4);
                const lit = near > 0.2;
                const col = lit ? GREEN : CYAN;
                const r = (0.5 + 0.7 * pulse + near * 1.8) * unit;
                ctx.fillStyle = `rgba(${col},${Math.min(1, 0.25 + 0.45 * pulse + near * 0.6)})`;
                ctx.shadowColor = `rgba(${col},0.95)`;
                ctx.shadowBlur = lit ? 12 : 6;
                ctx.beginPath();
                ctx.arc(px, py, r, 0, Math.PI * 2);
                ctx.fill();
            }

            // 4) Scan sweep band (still-image mode only)
            if (sweepY != null) {
                const grad = ctx.createLinearGradient(0, sweepY - H * 0.05, 0, sweepY + H * 0.05);
                grad.addColorStop(0, `rgba(${GREEN},0)`);
                grad.addColorStop(0.5, `rgba(${GREEN},0.28)`);
                grad.addColorStop(1, `rgba(${GREEN},0)`);
                ctx.shadowBlur = 0;
                ctx.fillStyle = grad;
                ctx.fillRect(0, sweepY - H * 0.05, W, H * 0.1);
            }

            ctx.restore();
        }

        /* ---------- LIVE (camera) ---------- */
        async function startLive(video, canvas) {
            if (!available()) return;
            liveVideo = video; liveCanvas = canvas;
            liveCtx = canvas.getContext('2d');
            liveLms = null; liveOn = true;
            fitCanvas(canvas);
            try {
                const fm = await loadModel();
                fm.onResults((res) => {
                    liveLms = (res.multiFaceLandmarks && res.multiFaceLandmarks[0]) || null;
                });
                pump();
            } catch (e) { console.warn('FaceMesh live init failed:', e.message); }
            renderLive();
        }
        async function pump() {
            if (!liveOn) return;
            if (model && liveVideo && liveVideo.readyState >= 2 && !sending) {
                sending = true;
                try { await model.send({ image: liveVideo }); } catch (e) { /* ignore frame */ }
                sending = false;
            }
            if (liveOn) requestAnimationFrame(pump);
        }
        function renderLive() {
            if (!liveOn) return;
            const W = liveCanvas.width, H = liveCanvas.height;
            const iw = liveVideo.videoWidth, ih = liveVideo.videoHeight;
            const tf = (iw && ih) ? coverTf(iw, ih, W, H) : null;
            drawMesh(liveCtx, liveLms, W, H, tf, performance.now() / 1000, null);
            liveRaf = requestAnimationFrame(renderLive);
        }
        function stopLive() {
            liveOn = false;
            if (liveRaf) cancelAnimationFrame(liveRaf);
            if (liveCtx && liveCanvas) liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
            liveLms = null;
        }

        /* ---------- STILL (captured/uploaded image) ---------- */
        function imgReady(img) {
            return new Promise((resolve) => {
                if (img.complete && img.naturalWidth > 0) return resolve();
                img.onload = () => resolve();
                img.onerror = () => resolve();
            });
        }
        async function startStill(img, canvas) {
            if (!available()) return;
            stillImg = img; stillCanvas = canvas;
            stillCtx = canvas.getContext('2d');
            stillLms = null; stillOn = true; stillT0 = performance.now();
            fitCanvas(canvas);
            renderStill();
            try {
                const fm = await loadModel();
                fm.onResults((res) => {
                    stillLms = (res.multiFaceLandmarks && res.multiFaceLandmarks[0]) || null;
                });
                await imgReady(img);
                if (stillOn) { try { await fm.send({ image: img }); } catch (e) { /* ignore */ } }
            } catch (e) { console.warn('FaceMesh still init failed:', e.message); }
        }
        function renderStill() {
            if (!stillOn) return;
            const W = stillCanvas.width, H = stillCanvas.height;
            const iw = stillImg.naturalWidth, ih = stillImg.naturalHeight;
            const tf = (iw && ih) ? coverTf(iw, ih, W, H) : null;
            const t = (performance.now() - stillT0) / 1000;
            const sweepY = ((t * 0.45) % 1) * H;
            drawMesh(stillCtx, stillLms, W, H, tf, t, sweepY);
            stillRaf = requestAnimationFrame(renderStill);
        }
        function stopStill() {
            stillOn = false;
            if (stillRaf) cancelAnimationFrame(stillRaf);
            if (stillCtx && stillCanvas) stillCtx.clearRect(0, 0, stillCanvas.width, stillCanvas.height);
            stillLms = null;
        }

        // Warm up the model in the background so first use is instant
        function preload() { if (available()) loadModel().catch(() => {}); }

        return { startLive, stopLive, startStill, stopStill, preload };
    })();

    // Preload MediaPipe assets on page load (non-blocking)
    FaceMeshFX.preload();

    /* ---- Camera ---- */
    btnStartCamera && btnStartCamera.addEventListener('click', async () => {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 640 }, audio: false });
            cameraFeed.srcObject = cameraStream;
            cameraFeed.classList.remove('hidden');
            scanCanvas && scanCanvas.classList.remove('hidden');
            mediaPlaceholder.classList.add('hidden');
            imagePreview.classList.add('hidden');
            btnStartCamera.classList.add('hidden');
            btnTriggerUpload.classList.add('hidden');
            btnCapture.classList.remove('hidden');
            btnStopCamera.classList.remove('hidden');
            capturedImageBase64 = null;
            // Start real-time MediaPipe Face Mesh sci-fi overlay
            if (scanCanvas) FaceMeshFX.startLive(cameraFeed, scanCanvas);
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
        FaceMeshFX.stopLive();
        scanCanvas && scanCanvas.classList.add('hidden');

        stopCamera();
        btnCapture.classList.add('hidden');
        btnStopCamera.classList.add('hidden');
        btnStartCamera.classList.remove('hidden');
        btnTriggerUpload.classList.remove('hidden');
    });

    btnStopCamera && btnStopCamera.addEventListener('click', () => {
        stopCamera();
        FaceMeshFX.stopLive();
        scanCanvas && scanCanvas.classList.add('hidden');
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

        // Start MediaPipe Face Mesh wireframe scan on the captured photo
        const scanMeshCanvas = document.getElementById('scanMeshCanvas');
        if (scanMeshCanvas) FaceMeshFX.startStill(scanImg, scanMeshCanvas);

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
            FaceMeshFX.stopStill();
            // Transition to mandatory lead form before showing report
            switchState('stateForm');

        } catch (err) {
            clearInterval(statusInterval);
            FaceMeshFX.stopStill();
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
        FaceMeshFX.stopStill();
        FaceMeshFX.stopLive();
        scanCanvas && scanCanvas.classList.add('hidden');
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
