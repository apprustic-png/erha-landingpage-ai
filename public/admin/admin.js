/* ==========================================================================
   ERHASTORE ADMIN PANEL — AI Skin Analyses + Products Manager
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    const authScreen  = document.getElementById('authScreen');
    const adminApp    = document.getElementById('adminApp');
    const adminLoginForm = document.getElementById('adminLoginForm');
    const authAlert   = document.getElementById('authAlert');

    let productsCache = [];   // last loaded product list (for edit lookup)
    let editingSku = null;    // SKU currently being edited, or null when adding

    const token = localStorage.getItem('erha_admin_token');
    if (token) showDashboard(); else showLogin();

    function showLogin() {
        authScreen.style.display = 'flex';
        adminApp.style.display = 'none';
    }
    function showDashboard() {
        authScreen.style.display = 'none';
        adminApp.style.display = 'flex';
        loadDashboardData();
        switchTab('tab-analyses');
    }

    /* ---- LOGIN ---- */
    adminLoginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        authAlert.style.display = 'none';
        const email = document.getElementById('adminEmail').value.trim();
        const password = document.getElementById('adminPassword').value.trim();

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const result = await res.json();
            if (result.success) {
                localStorage.setItem('erha_admin_token', result.token);
                localStorage.setItem('erha_admin_email', email);
                showDashboard();
            } else {
                authAlert.textContent = result.message || 'Login gagal!';
                authAlert.style.display = 'block';
            }
        } catch (err) {
            authAlert.textContent = 'Gagal terhubung ke server.';
            authAlert.style.display = 'block';
        }
    });

    /* ---- LOGOUT ---- */
    document.getElementById('btnLogout')?.addEventListener('click', () => {
        localStorage.removeItem('erha_admin_token');
        localStorage.removeItem('erha_admin_email');
        showLogin();
    });

    /* ---- ADMIN EMAIL ---- */
    const emailEl = document.getElementById('adminEmailDisplay');
    if (emailEl) emailEl.textContent = localStorage.getItem('erha_admin_email') || 'Admin';

    /* ---- TAB SWITCHING ---- */
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    function switchTab(tabId) {
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelector(`.sidebar-tab[data-tab="${tabId}"]`)?.classList.add('active');
        document.getElementById(tabId)?.classList.add('active');
    }

    /* ---- REFRESH ---- */
    document.getElementById('btnRefreshData')?.addEventListener('click', loadDashboardData);

    /* ================================================================
       LOAD DASHBOARD DATA
       ================================================================ */
    async function loadDashboardData() {
        try {
            const [analysesRes, productsRes] = await Promise.all([
                fetch('/api/analyses'),
                fetch('/api/products')
            ]);
            const analysesData = await analysesRes.json();
            const productsData = await productsRes.json();

            if (analysesData.success) renderAnalyses(analysesData.data);
            if (productsData.success) {
                renderProducts(productsData.data);
                updateStats(analysesData.data || [], productsData.data || []);
            }
        } catch (err) {
            console.error('Dashboard load error:', err);
        }
    }

    /* ================================================================
       STATS CARDS
       ================================================================ */
    function updateStats(analyses, products) {
        const total = analyses.length;
        const baru  = analyses.filter(a => a.status === 'Baru').length;
        const converted = analyses.filter(a => a.status === 'Converted').length;
        setText('statTotalAnalyses', total);
        setText('statNewAnalyses', baru);
        setText('statConverted', converted);
        setText('statTotalProducts', products.length);

        // Most common skin issue
        const issues = {};
        analyses.forEach(a => {
            const isu = a.prioritasUtama || a.tipeKulit;
            if (isu) issues[isu] = (issues[isu] || 0) + 1;
        });
        const topIssue = Object.entries(issues).sort((a,b) => b[1]-a[1])[0];
        setText('statTopIssue', topIssue ? topIssue[0] : '—');
    }

    /* ================================================================
       ANALYSES TABLE
       ================================================================ */
    function renderAnalyses(data) {
        const tbody = document.getElementById('analysesTableBody');
        if (!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)"><i class="fa-solid fa-brain" style="margin-right:8px;"></i>Belum ada analisis masuk</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(a => {
            const date = a.createdDate ? new Date(a.createdDate).toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric'}) : '—';
            const skus = (a.rekomendasiSkus || []).slice(0,3).map(s => `<span class="sku-tag">${s}</span>`).join('');
            const statusClass = { 'Baru':'status-new', 'Dihubungi':'status-contacted', 'Converted':'status-converted' }[a.status] || 'status-new';

            return `<tr>
                <td>
                    <div style="font-weight:600;color:var(--text-main)">${escHtml(a.name)}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted)">${escHtml(a.city || '—')}</div>
                </td>
                <td>
                    <div>${escHtml(a.whatsapp)}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted)">${escHtml(a.email || '—')}</div>
                </td>
                <td><span class="skin-type-tag">${escHtml(a.tipeKulit || '—')}</span></td>
                <td><span class="issue-tag">${escHtml(a.prioritasUtama || '—')}</span></td>
                <td>${skus || '<span style="color:var(--text-muted);font-size:0.78rem;">—</span>'}</td>
                <td>${date}</td>
                <td><span class="status-badge ${statusClass}">${a.status || 'Baru'}</span></td>
                <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        <button class="action-btn btn-wa" onclick="openWA('${escHtml(a.whatsapp)}','${escHtml(a.name)}','${escHtml(a.prioritasUtama||'')}')">
                            <i class="fa-brands fa-whatsapp"></i>
                        </button>
                        <button class="action-btn btn-view" onclick="openAnalysisDetail('${escHtml(a.id)}', this)" data-data="${escHtml(JSON.stringify(a))}">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <select class="status-select" onchange="updateAnalysisStatus('${a.id}', this.value)">
                            <option value="Baru" ${a.status==='Baru'?'selected':''}>Baru</option>
                            <option value="Dihubungi" ${a.status==='Dihubungi'?'selected':''}>Dihubungi</option>
                            <option value="Converted" ${a.status==='Converted'?'selected':''}>Converted</option>
                        </select>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    /* Update status */
    window.updateAnalysisStatus = async (id, status) => {
        try {
            await fetch(`/api/analyses/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            showToast('Status berhasil diperbarui', 'success');
            loadDashboardData();
        } catch (err) {
            showToast('Gagal update status', 'error');
        }
    };

    /* Open WhatsApp */
    window.openWA = (wa, name, issue) => {
        const msg = encodeURIComponent(`Halo ${name}, kami dari Tim Skin Expert ERHASTORE! Kami melihat Anda telah melakukan AI Skin Diagnosis dengan masalah utama: *${issue}*. Kami ingin membantu Anda mendapatkan solusi perawatan kulit yang tepat. Ada waktu untuk ngobrol sebentar?`);
        const num = wa.replace(/\D/g,'').replace(/^0/,'62');
        window.open(`https://wa.me/${num}?text=${msg}`, '_blank');
    };

    /* View Detail Modal */
    window.openAnalysisDetail = (id, btn) => {
        let rawData;
        try { rawData = JSON.parse(btn.getAttribute('data-data')); }
        catch(e) { return; }

        const modal = document.getElementById('analysisDetailModal');
        const content = document.getElementById('analysisDetailContent');
        if (!modal || !content) return;

        const a = rawData;
        const kondisi = a.analysis?.kondisiKulit || {};
        const recs = a.analysis?.rekomendasiProduk || [];

        const kondisiHtml = Object.entries(kondisi).map(([k,v]) => {
            const icons = { jerawat:'🔴', minyak:'💧', hiperpigmentasi:'🟤', kelembapan:'💦', penuaan:'⏳', sensitivitas:'🌿' };
            const bar = `<div style="height:6px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;margin-top:4px;"><div style="height:100%;width:${(v.skor||0)*10}%;background:linear-gradient(90deg,#00bcd4,#39ff14);border-radius:4px;"></div></div>`;
            return `<div style="margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;font-size:0.82rem;">
                    <span>${icons[k]||'•'} ${k.charAt(0).toUpperCase()+k.slice(1)}</span>
                    <span style="color:#00e5ff;font-weight:700;">${v.skor||0}/10 <small style="color:rgba(255,255,255,0.5)">${v.tingkat||''}</small></span>
                </div>${bar}
            </div>`;
        }).join('');

        const recsHtml = recs.slice(0,5).map(r =>
            `<div style="font-size:0.8rem;padding:8px 10px;background:rgba(0,229,255,0.05);border-left:2px solid #00e5ff;border-radius:4px;margin-bottom:6px;">
                <strong style="color:#00e5ff;">${r.sku}</strong> — ${escHtml(r.alasan||'')}
             </div>`
        ).join('');

        content.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                <div>
                    <h4 style="color:#00e5ff;margin-bottom:12px;font-size:0.85rem;">DATA PELANGGAN</h4>
                    <p style="margin-bottom:6px;"><strong>Nama:</strong> ${escHtml(a.name)}</p>
                    <p style="margin-bottom:6px;"><strong>WA:</strong> ${escHtml(a.whatsapp)}</p>
                    <p style="margin-bottom:6px;"><strong>Email:</strong> ${escHtml(a.email||'—')}</p>
                    <p style="margin-bottom:6px;"><strong>Kota:</strong> ${escHtml(a.city||'—')}</p>
                    <p style="margin-bottom:6px;"><strong>Tipe Kulit:</strong> ${escHtml(a.tipeKulit||'—')}</p>
                    <p style="margin-bottom:0;"><strong>Prioritas:</strong> ${escHtml(a.prioritasUtama||'—')}</p>
                </div>
                <div>
                    <h4 style="color:#00e5ff;margin-bottom:12px;font-size:0.85rem;">SKOR KONDISI KULIT</h4>
                    ${kondisiHtml}
                </div>
            </div>
            <div style="margin-top:20px;">
                <h4 style="color:#00e5ff;margin-bottom:10px;font-size:0.85rem;">DIAGNOSIS AI</h4>
                <p style="font-size:0.82rem;color:rgba(255,255,255,0.7);line-height:1.7;">${escHtml(a.analysis?.ringkasan||'—')}</p>
            </div>
            ${recs.length ? `<div style="margin-top:20px;"><h4 style="color:#00e5ff;margin-bottom:10px;font-size:0.85rem;">REKOMENDASI PRODUK ERHA</h4>${recsHtml}</div>` : ''}
        `;

        modal.style.display = 'flex';
    };

    document.getElementById('closeDetailModal')?.addEventListener('click', () => {
        document.getElementById('analysisDetailModal').style.display = 'none';
    });
    document.getElementById('analysisDetailModal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
    });

    /* CSV Export */
    document.getElementById('btnExportCSV')?.addEventListener('click', async () => {
        const res = await fetch('/api/analyses');
        const data = await res.json();
        if (!data.success) return;

        const headers = ['Nama','WhatsApp','Email','Kota','Tipe Kulit','Prioritas','Rekomendasi SKU','Status','Tanggal'];
        const rows = data.data.map(a => [
            a.name, a.whatsapp, a.email||'', a.city||'',
            a.tipeKulit||'', a.prioritasUtama||'',
            (a.rekomendasiSkus||[]).join('; '),
            a.status||'Baru', a.createdDate||''
        ]);

        const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'erha-analyses.csv'; a.click();
        URL.revokeObjectURL(url);
    });

    /* ================================================================
       PRODUCTS MANAGEMENT
       ================================================================ */
    function renderProducts(data) {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;

        productsCache = data || [];

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Tidak ada produk</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(prod => `<tr>
            <td><span style="font-family:monospace;font-size:0.8rem;color:#00e5ff;">${escHtml(prod.sku)}</span></td>
            <td>
                <img src="${escHtml(prod.imageUrl||'')}" alt="" style="width:44px;height:44px;object-fit:contain;border-radius:6px;background:rgba(255,255,255,0.05);" onerror="this.src='../images/product_showcase.png'">
            </td>
            <td>
                <div style="font-weight:600;">${escHtml(prod.title)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);">${escHtml(prod.brand||'')}</div>
            </td>
            <td><span class="category-tag">${escHtml(prod.categoryLabel||prod.category)}</span></td>
            <td>
                ${prod.oldPrice ? `<span style="text-decoration:line-through;color:var(--text-muted);font-size:0.78rem;">Rp ${formatPrice(prod.oldPrice)}</span><br>` : ''}
                <span style="font-weight:700;color:#39ff14;">Rp ${formatPrice(prod.currentPrice)}</span>
            </td>
            <td style="font-size:0.75rem;color:var(--text-muted);">${escHtml((prod.concern||'').substring(0,60))}${(prod.concern||'').length>60?'...':''}</td>
            <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="action-btn btn-edit" onclick="editProduct('${escHtml(prod.sku)}')" title="Edit produk / ganti gambar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="action-btn btn-delete" onclick="deleteProduct('${escHtml(prod.sku)}')" title="Hapus produk">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`).join('');
    }

    /* ---- Live image preview from the URL field ---- */
    function updateImagePreview() {
        const url = (document.getElementById('pImageUrl').value || '').trim();
        const img = document.getElementById('pImagePreview');
        const hint = document.getElementById('pImageHint');
        if (!img) return;
        if (url) {
            img.onload = () => { img.style.display = 'block'; if (hint) { hint.textContent = '✓ Preview gambar'; hint.style.color = '#39ff14'; } };
            img.onerror = () => { img.style.display = 'none'; if (hint) { hint.textContent = '⚠ Gambar tidak bisa dimuat dari link ini'; hint.style.color = '#ffc107'; } };
            img.src = url;
        } else {
            img.style.display = 'none';
            img.removeAttribute('src');
            if (hint) { hint.textContent = 'Tempel link gambar untuk melihat preview'; hint.style.color = 'var(--text-muted)'; }
        }
    }
    document.getElementById('pImageUrl')?.addEventListener('input', updateImagePreview);

    /* ---- Load a product into the form for editing ---- */
    window.editProduct = (sku) => {
        const prod = productsCache.find(p => p.sku === sku);
        if (!prod) return showToast('Produk tidak ditemukan', 'error');
        editingSku = sku;

        document.getElementById('pSku').value = prod.sku || '';
        document.getElementById('pSku').readOnly = true;
        document.getElementById('pBrand').value = prod.brand || '';
        document.getElementById('pTitle').value = prod.title || '';
        document.getElementById('pCategory').value = prod.category || 'acneact';
        document.getElementById('pOldPrice').value = prod.oldPrice || '';
        document.getElementById('pPrice').value = prod.currentPrice || '';
        document.getElementById('pImageUrl').value = prod.imageUrl || '';
        document.getElementById('pConcern').value = prod.concern || '';
        updateImagePreview();

        document.getElementById('productFormTitle').innerHTML =
            '<i class="fa-solid fa-pen" style="color:#00e5ff;margin-right:8px;"></i>Edit Produk: ' + escHtml(sku);
        document.getElementById('btnSubmitProduct').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan';
        document.getElementById('btnCancelEdit').style.display = 'inline-flex';

        switchTab('tab-add-product');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    /* ---- Reset the product form back to "add" mode ---- */
    function resetProductForm() {
        editingSku = null;
        document.getElementById('addProductForm').reset();
        document.getElementById('pSku').readOnly = false;
        document.getElementById('productFormTitle').innerHTML =
            '<i class="fa-solid fa-plus-circle" style="color:#39ff14;margin-right:8px;"></i>Tambah Produk Baru ke Firestore';
        document.getElementById('btnSubmitProduct').innerHTML = '<i class="fa-solid fa-plus"></i> Tambah Produk ke Firestore';
        document.getElementById('btnCancelEdit').style.display = 'none';
        updateImagePreview();
    }
    document.getElementById('btnCancelEdit')?.addEventListener('click', resetProductForm);

    window.deleteProduct = async (sku) => {
        if (!confirm(`Hapus produk ${sku}?`)) return;
        try {
            const res = await fetch('/api/products/'+sku, { method:'DELETE' });
            const result = await res.json();
            if (result.success) { showToast('Produk dihapus', 'success'); loadDashboardData(); }
            else showToast('Gagal hapus produk', 'error');
        } catch (err) { showToast('Error: '+err.message, 'error'); }
    };

    /* ---- Add Product Form ---- */
    document.getElementById('addProductForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            sku: document.getElementById('pSku').value.trim(),
            title: document.getElementById('pTitle').value.trim(),
            brand: document.getElementById('pBrand').value.trim(),
            category: document.getElementById('pCategory').value,
            categoryLabel: document.getElementById('pCategory').options[document.getElementById('pCategory').selectedIndex].text,
            currentPrice: parseInt(document.getElementById('pPrice').value)||0,
            oldPrice: parseInt(document.getElementById('pOldPrice').value)||0,
            imageUrl: document.getElementById('pImageUrl').value.trim(),
            concern: document.getElementById('pConcern').value.trim(),
        };
        if (!data.sku || !data.title) return showToast('SKU dan Judul wajib!', 'warning');
        const editing = !!editingSku;
        try {
            const res = await fetch(
                editing ? '/api/products/' + encodeURIComponent(editingSku) : '/api/products',
                {
                    method: editing ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }
            );
            const result = await res.json();
            if (result.success) {
                showToast(editing ? 'Produk berhasil diperbarui!' : 'Produk berhasil ditambahkan!', 'success');
                resetProductForm();
                loadDashboardData();
                if (editing) switchTab('tab-products');
            } else showToast('Gagal: '+(result.message||'terjadi kesalahan'), 'error');
        } catch (err) { showToast('Error: '+err.message, 'error'); }
    });

    /* ================================================================
       UTILITIES
       ================================================================ */
    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
    function escHtml(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function formatPrice(n) { return Number(n).toLocaleString('id-ID'); }

    function showToast(msg, type='info') {
        let el = document.getElementById('adminToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'adminToast';
            el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;padding:12px 18px;border-radius:10px;font-size:0.85rem;display:none;animation:fadeIn 0.3s ease;max-width:320px;';
            document.body.appendChild(el);
        }
        const colors = { success:'rgba(57,255,20,0.12);border:1px solid rgba(57,255,20,0.3);color:#39ff14', error:'rgba(255,80,80,0.12);border:1px solid rgba(255,80,80,0.3);color:#ff5252', warning:'rgba(255,193,7,0.12);border:1px solid rgba(255,193,7,0.3);color:#ffc107', info:'rgba(0,229,255,0.12);border:1px solid rgba(0,229,255,0.3);color:#00e5ff' };
        el.style.cssText += 'background:' + (colors[type]||colors.info) + ';';
        el.innerHTML = msg;
        el.style.display = 'block';
        clearTimeout(el._t);
        el._t = setTimeout(() => el.style.display = 'none', 3500);
    }
});
