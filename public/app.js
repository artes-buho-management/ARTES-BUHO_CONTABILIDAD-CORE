(function () {
  const state = {
    token: '',
    currentView: 'dashboard',
    dashboard: null,
    pnlReport: null,
    config: null,
    audit: [],
    clients: [],
    suppliers: [],
    products: [],
    invoices: [],
    expenses: [],
    entries: [],
    bankMovements: [],
    undoStack: []
  };

  const currency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

  const refs = {
    toast: document.getElementById('toast'),
    searchInput: document.getElementById('globalSearch'),
    searchResults: document.getElementById('searchResults'),
    refreshBtn: document.getElementById('btnRefresh'),
    exportBtn: document.getElementById('btnExport'),
    undoBtn: document.getElementById('btnUndo'),
    logoutBtn: document.getElementById('btnLogout'),
    loginModal: document.getElementById('loginModal'),
    loginForm: document.getElementById('loginForm')
  };

  const runSearchDebounced = debounce(async query => {
    try {
      const response = await apiGet(`/api/search?q=${encodeURIComponent(query)}`);
      if (refs.searchInput.value.trim() !== query) {
        return;
      }
      renderSearchResults(response.items || []);
    } catch (error) {
      showToast(error.message || 'Error de busqueda', true);
    }
  }, 260);

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindNavigation();
    bindForms();
    bindFilters();
    bindSearch();
    bindTopActions();
    setupHotkeys();
    setTodayDefaults();
    setDefaultReportRange();
    updateUndoButton();
    await initAuthFlow();
  }

  async function initAuthFlow() {
    state.token = localStorage.getItem('cab_token') || '';
    if (!state.token) {
      openLogin();
      return;
    }
    try {
      await apiGet('/api/auth/status');
      closeLogin();
      await reloadAll();
    } catch (error) {
      localStorage.removeItem('cab_token');
      state.token = '';
      openLogin();
    }
  }

  function openLogin() {
    document.body.classList.add('locked');
    refs.loginModal.classList.remove('hidden');
    refs.loginForm.reset();
    setTimeout(() => {
      const input = refs.loginForm.querySelector('input[name="password"]');
      if (input) {
        input.focus();
      }
    }, 10);
  }

  function closeLogin() {
    document.body.classList.remove('locked');
    refs.loginModal.classList.add('hidden');
  }

  function setupHotkeys() {
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        refs.searchInput.focus();
        refs.searchInput.select();
      }
    });
  }

  function setTodayDefaults() {
    const today = new Date().toISOString().slice(0, 10);
    document.querySelectorAll('input[type="date"]').forEach(input => {
      if (!input.value) {
        input.value = today;
      }
    });
  }

  function setDefaultReportRange() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yearStart = `${now.getFullYear()}-01-01`;
    const pnlFrom = document.getElementById('pnlFrom');
    const pnlTo = document.getElementById('pnlTo');
    if (pnlFrom && !pnlFrom.value) {
      pnlFrom.value = yearStart;
    }
    if (pnlTo && !pnlTo.value) {
      pnlTo.value = today;
    }
  }

  function bindNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
  }

  function bindTopActions() {
    refs.refreshBtn.addEventListener('click', async () => {
      await reloadAll();
      showToast('Datos actualizados');
    });

    refs.exportBtn.addEventListener('click', async () => {
      await exportCurrentView();
    });

    if (refs.undoBtn) {
      refs.undoBtn.addEventListener('click', onUndo);
    }

    if (refs.logoutBtn) {
      refs.logoutBtn.addEventListener('click', onLogout);
    }

    refs.loginForm.addEventListener('submit', onLogin);
  }

  function bindForms() {
    document.getElementById('invoiceForm').addEventListener('submit', onSaveInvoice);
    document.getElementById('expenseForm').addEventListener('submit', onSaveExpense);
    document.getElementById('clientForm').addEventListener('submit', onSaveClient);
    document.getElementById('supplierForm').addEventListener('submit', onSaveSupplier);
    document.getElementById('productForm').addEventListener('submit', onSaveProduct);
    document.getElementById('bankForm').addEventListener('submit', onSaveBankMovement);
    document.getElementById('entryForm').addEventListener('submit', onSaveEntry);
    document.getElementById('vatForm').addEventListener('submit', onVatReport);
    document.getElementById('pnlForm').addEventListener('submit', onPnlReport);
    document.getElementById('configForm').addEventListener('submit', onSaveConfig);
    document.getElementById('passwordForm').addEventListener('submit', onChangePassword);
  }

  function bindFilters() {
    ['invoiceFilterStatus', 'invoiceFilterText'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', renderInvoices);
        el.addEventListener('change', renderInvoices);
      }
    });
    ['expenseFilterStatus', 'expenseFilterText'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', renderExpenses);
        el.addEventListener('change', renderExpenses);
      }
    });
  }

  function bindSearch() {
    refs.searchInput.addEventListener('input', event => {
      const query = event.target.value.trim();
      if (!query) {
        hideSearchResults();
        return;
      }

      if (handleInlineCommand(query)) {
        return;
      }

      runSearchDebounced(query);
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('.search-wrap')) {
        hideSearchResults();
      }
    });
  }

  function handleInlineCommand(query) {
    const map = {
      'ir inicio': 'dashboard',
      'ir dashboard': 'dashboard',
      'ir facturas': 'facturas',
      'ir gastos': 'gastos',
      'ir clientes': 'clientes',
      'ir proveedores': 'proveedores',
      'ir productos': 'productos',
      'ir tesoreria': 'tesoreria',
      'ir asientos': 'asientos',
      'ir reportes': 'reportes',
      'ir ajustes': 'ajustes'
    };
    const key = query.toLowerCase();
    if (!map[key]) {
      return false;
    }
    switchView(map[key]);
    refs.searchInput.value = '';
    hideSearchResults();
    showToast(`Comando ejecutado: ${key}`);
    return true;
  }

  function renderSearchResults(items) {
    if (!items.length) {
      refs.searchResults.innerHTML = `<div class="search-item"><strong>Sin resultados</strong><span>Prueba otro termino</span></div>`;
      refs.searchResults.classList.remove('hidden');
      return;
    }
    refs.searchResults.innerHTML = items
      .map(
        item => `
          <div class="search-item" data-module="${escapeHtml(item.module || '')}" data-id="${escapeHtml(item.id || '')}">
            <strong>${escapeHtml(item.label || '')}</strong>
            <span>${escapeHtml(item.detail || '')}</span>
          </div>
        `
      )
      .join('');

    refs.searchResults.querySelectorAll('.search-item').forEach(row => {
      row.addEventListener('click', () => {
        if (row.dataset.module === 'navegacion') {
          switchView(row.dataset.id);
        } else {
          switchView(row.dataset.module);
        }
        refs.searchInput.value = '';
        hideSearchResults();
      });
    });
    refs.searchResults.classList.remove('hidden');
  }

  function hideSearchResults() {
    refs.searchResults.classList.add('hidden');
    refs.searchResults.innerHTML = '';
  }

  async function reloadAll() {
    try {
      const response = await apiGet('/api/snapshot');
      const snapshot = response.snapshot || {};
      state.dashboard = snapshot.dashboard || null;
      state.pnlReport = snapshot.pnl || null;
      state.config = snapshot.config || null;
      state.audit = snapshot.audit || [];
      state.clients = snapshot.clients || [];
      state.suppliers = snapshot.suppliers || [];
      state.products = snapshot.products || [];
      state.invoices = snapshot.invoices || [];
      state.expenses = snapshot.expenses || [];
      state.entries = snapshot.entries || [];
      state.bankMovements = snapshot.bankMovements || [];
      renderAll();
    } catch (error) {
      showToast(error.message || 'Error cargando datos', true);
    }
  }

  function renderAll() {
    renderDashboard();
    renderPnlReport();
    renderCharts();
    renderClientSelect();
    renderSupplierSelect();
    renderInvoices();
    renderExpenses();
    renderClients();
    renderSuppliers();
    renderProducts();
    renderBank();
    renderEntries();
    renderConfig();
    updateUndoButton();
  }

  function renderDashboard() {
    const kpis = (state.dashboard && state.dashboard.kpis) || {};
    const vat = (state.dashboard && state.dashboard.vat) || {};
    document.getElementById('kpiSales').textContent = formatCurrency(kpis.totalSales || 0);
    document.getElementById('kpiExpenses').textContent = formatCurrency(kpis.totalExpenses || 0);
    document.getElementById('kpiMargin').textContent = formatCurrency(kpis.margin || 0);
    document.getElementById('kpiPending').textContent = formatCurrency(kpis.totalPendingInvoices || 0);
    document.getElementById('kpiBank').textContent = formatCurrency(kpis.bankBalance || 0);
    document.getElementById('kpiVatNet').textContent = formatCurrency(vat.net || 0);
    document.getElementById('kpiOverdue').textContent = `${Number(kpis.overdueInvoices || 0)} | ${formatCurrency(kpis.overdueAmount || 0)}`;
    document.getElementById('kpiCollection').textContent = `${Number(kpis.collectionRate || 0).toFixed(1)}%`;
    document.getElementById('kpiMonthCash').textContent = formatCurrency(kpis.monthCashFlow || 0);

    const activityRows = (state.dashboard && state.dashboard.recentActivity) || [];
    const activityTable = document.getElementById('activityTable');
    if (!activityRows.length) {
      activityTable.innerHTML = '<tr><td class="empty" colspan="5">Sin actividad</td></tr>';
    } else {
      activityTable.innerHTML = activityRows
        .map(
          row => `
            <tr>
              <td>${escapeHtml(row.module || '')}</td>
              <td>${escapeHtml(row.date || '')}</td>
              <td>${escapeHtml(row.title || '')}</td>
              <td>${escapeHtml(row.detail || '')}</td>
              <td>${formatCurrency(row.amount || 0)}</td>
            </tr>
          `
        )
        .join('');
    }

    const auditTable = document.getElementById('auditTable');
    const auditRows = state.audit.slice(0, 20);
    if (!auditRows.length) {
      auditTable.innerHTML = '<tr><td class="empty" colspan="5">Sin auditoria</td></tr>';
    } else {
      auditTable.innerHTML = auditRows
        .map(
          row => `
            <tr>
              <td>${escapeHtml((row.at || '').replace('T', ' ').slice(0, 19))}</td>
              <td>${escapeHtml(row.action || '')}</td>
              <td>${escapeHtml(row.entity || '')}</td>
              <td>${escapeHtml(row.detail || '')}</td>
              <td>${escapeHtml(row.actor || '')}</td>
            </tr>
          `
        )
        .join('');
    }
  }

  function renderClientSelect() {
    const html = ['<option value="">Seleccionar cliente</option>']
      .concat(state.clients.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`))
      .join('');
    document.getElementById('invoiceClientSelect').innerHTML = html;
  }

  function renderSupplierSelect() {
    const html = ['<option value="">Seleccionar proveedor</option>']
      .concat(state.suppliers.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`))
      .join('');
    document.getElementById('expenseSupplierSelect').innerHTML = html;
  }

  function resolveClient(id) {
    const row = state.clients.find(item => item.id === id);
    return row ? row.name : '';
  }

  function resolveSupplier(id) {
    const row = state.suppliers.find(item => item.id === id);
    return row ? row.name : '';
  }

  function badgeClass(status) {
    const value = String(status || '').toLowerCase();
    if (value.includes('pagad')) {
      return 'ok';
    }
    if (value.includes('vencid')) {
      return 'danger';
    }
    if (value.includes('parcial')) {
      return 'warn';
    }
    return 'neutral';
  }

  function renderInvoices() {
    const tbody = document.getElementById('invoicesTable');
    const statusFilter = String(document.getElementById('invoiceFilterStatus').value || '').toLowerCase();
    const textFilter = String(document.getElementById('invoiceFilterText').value || '').trim().toLowerCase();
    const rows = state.invoices.filter(row => {
      const statusOk = !statusFilter || String(row.status || '').toLowerCase() === statusFilter;
      const textOk = !textFilter || JSON.stringify(row).toLowerCase().includes(textFilter) || resolveClient(row.clientId).toLowerCase().includes(textFilter);
      return statusOk && textOk;
    });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="12">No hay facturas para el filtro aplicado</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        row => `
          <tr>
            <td>${escapeHtml(row.date || '')}</td>
            <td>${escapeHtml(row.number || '')}</td>
            <td>${escapeHtml(resolveClient(row.clientId) || 'Sin cliente')}</td>
            <td>${escapeHtml(row.concept || '')}</td>
            <td>${escapeHtml(row.dueDate || '-')}</td>
            <td>${formatCurrency(row.base || 0)}</td>
            <td>${formatCurrency(row.tax || 0)}</td>
            <td>${formatCurrency(row.total || 0)}</td>
            <td>${formatCurrency(row.paidAmount || 0)}</td>
            <td>${formatCurrency(Math.max(0, Number(row.total || 0) - Number(row.paidAmount || 0)))}</td>
            <td><span class="status-badge ${badgeClass(row.status)}">${escapeHtml(row.status || '')}</span></td>
            <td><button class="action-btn danger" data-action="delete-invoice" data-id="${escapeHtml(row.id)}">Borrar</button></td>
          </tr>
        `
      )
      .join('');

    tbody.querySelectorAll('button[data-action="delete-invoice"]').forEach(btn => {
      btn.addEventListener('click', () => onDeleteInvoice(btn.dataset.id));
    });
  }

  function renderExpenses() {
    const tbody = document.getElementById('expensesTable');
    const statusFilter = String(document.getElementById('expenseFilterStatus').value || '').toLowerCase();
    const textFilter = String(document.getElementById('expenseFilterText').value || '').trim().toLowerCase();
    const rows = state.expenses.filter(row => {
      const statusOk = !statusFilter || String(row.status || '').toLowerCase() === statusFilter;
      const textOk = !textFilter || JSON.stringify(row).toLowerCase().includes(textFilter) || resolveSupplier(row.supplierId).toLowerCase().includes(textFilter);
      return statusOk && textOk;
    });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="9">No hay gastos para el filtro aplicado</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        row => `
          <tr>
            <td>${escapeHtml(row.date || '')}</td>
            <td>${escapeHtml(resolveSupplier(row.supplierId) || 'Sin proveedor')}</td>
            <td>${escapeHtml(row.concept || '')}</td>
            <td>${escapeHtml(row.category || '')}</td>
            <td>${formatCurrency(row.base || 0)}</td>
            <td>${formatCurrency(row.tax || 0)}</td>
            <td>${formatCurrency(row.total || 0)}</td>
            <td><span class="status-badge ${badgeClass(row.status)}">${escapeHtml(row.status || '')}</span></td>
            <td><button class="action-btn danger" data-action="delete-expense" data-id="${escapeHtml(row.id)}">Borrar</button></td>
          </tr>
        `
      )
      .join('');

    tbody.querySelectorAll('button[data-action="delete-expense"]').forEach(btn => {
      btn.addEventListener('click', () => onDeleteExpense(btn.dataset.id));
    });
  }

  function renderClients() {
    const tbody = document.getElementById('clientsTable');
    if (!state.clients.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="5">No hay clientes</td></tr>';
      return;
    }
    tbody.innerHTML = state.clients
      .map(
        row => `
          <tr>
            <td>${escapeHtml(row.name || '')}</td>
            <td>${escapeHtml(row.nif || '')}</td>
            <td>${escapeHtml(row.email || '')}</td>
            <td>${escapeHtml(row.phone || '')}</td>
            <td>${escapeHtml(row.address || '')}</td>
          </tr>
        `
      )
      .join('');
  }

  function renderSuppliers() {
    const tbody = document.getElementById('suppliersTable');
    if (!state.suppliers.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="5">No hay proveedores</td></tr>';
      return;
    }
    tbody.innerHTML = state.suppliers
      .map(
        row => `
          <tr>
            <td>${escapeHtml(row.name || '')}</td>
            <td>${escapeHtml(row.nif || '')}</td>
            <td>${escapeHtml(row.email || '')}</td>
            <td>${escapeHtml(row.phone || '')}</td>
            <td>${escapeHtml(row.address || '')}</td>
          </tr>
        `
      )
      .join('');
  }

  function renderProducts() {
    const tbody = document.getElementById('productsTable');
    if (!state.products.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="5">No hay productos</td></tr>';
      return;
    }
    tbody.innerHTML = state.products
      .map(
        row => `
          <tr>
            <td>${escapeHtml(row.sku || '')}</td>
            <td>${escapeHtml(row.name || '')}</td>
            <td>${escapeHtml(row.category || '')}</td>
            <td>${formatCurrency(row.unitPrice || 0)}</td>
            <td>${escapeHtml(String(row.taxRate || 0))}%</td>
          </tr>
        `
      )
      .join('');
  }

  function renderBank() {
    const tbody = document.getElementById('bankTable');
    if (!state.bankMovements.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="7">No hay movimientos</td></tr>';
      return;
    }
    tbody.innerHTML = state.bankMovements
      .map(
        row => `
          <tr>
            <td>${escapeHtml(row.date || '')}</td>
            <td>${escapeHtml(row.account || '')}</td>
            <td>${escapeHtml(row.type || '')}</td>
            <td>${escapeHtml(row.concept || '')}</td>
            <td>${formatCurrency(row.amount || 0)}</td>
            <td>${row.reconciled ? 'Si' : 'No'}</td>
            <td><button class="action-btn warn" data-action="toggle-reconcile" data-id="${escapeHtml(row.id)}">${row.reconciled ? 'Deshacer' : 'Conciliar'}</button></td>
          </tr>
        `
      )
      .join('');

    tbody.querySelectorAll('button[data-action="toggle-reconcile"]').forEach(btn => {
      btn.addEventListener('click', () => onToggleReconcile(btn.dataset.id));
    });
  }

  function renderEntries() {
    const tbody = document.getElementById('entriesTable');
    if (!state.entries.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="6">No hay asientos</td></tr>';
      return;
    }
    tbody.innerHTML = state.entries
      .map(
        row => `
          <tr>
            <td>${escapeHtml(row.date || '')}</td>
            <td>${escapeHtml(row.description || '')}</td>
            <td>${escapeHtml(row.debitAccount || '')}</td>
            <td>${escapeHtml(row.creditAccount || '')}</td>
            <td>${formatCurrency(row.amount || 0)}</td>
            <td>${escapeHtml(row.reference || '')}</td>
          </tr>
        `
      )
      .join('');
  }

  function renderConfig() {
    if (!state.config) {
      return;
    }
    const form = document.getElementById('configForm');
    form.appName.value = state.config.appName || '';
    form.empresa.value = state.config.empresa || '';
    form.desarrollador.value = state.config.desarrollador || '';
    form.nif.value = state.config.nif || '';
    form.email.value = state.config.email || '';
    form.telefono.value = state.config.telefono || '';
    form.direccion.value = state.config.direccion || '';
    form.moneda.value = state.config.moneda || '';
    form.ejercicio.value = state.config.ejercicio || '';
  }

  function renderPnlReport() {
    const report = state.pnlReport || {};
    document.getElementById('pnlSales').textContent = formatCurrency(report.totalSales || 0);
    document.getElementById('pnlExpenses').textContent = formatCurrency(report.totalExpenses || 0);
    document.getElementById('pnlMargin').textContent = formatCurrency(report.margin || 0);
    document.getElementById('pnlCollection').textContent = `${Number(report.collectionRate || 0).toFixed(1)}%`;
    const tbody = document.getElementById('pnlMonthlyTable');
    const rows = report.monthly || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="4">Sin datos para el rango seleccionado</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        row => `
          <tr>
            <td>${escapeHtml(row.month || '')}</td>
            <td>${formatCurrency(row.sales || 0)}</td>
            <td>${formatCurrency(row.expenses || 0)}</td>
            <td>${formatCurrency(row.margin || 0)}</td>
          </tr>
        `
      )
      .join('');
  }

  function renderCharts() {
    drawFinanceChart();
    drawMonthlyChart();
  }

  function drawFinanceChart() {
    const canvas = document.getElementById('financeChart');
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    const kpis = (state.dashboard && state.dashboard.kpis) || {};
    const labels = ['Ventas', 'Gastos', 'Margen', 'Pendiente'];
    const values = [kpis.totalSales || 0, kpis.totalExpenses || 0, kpis.margin || 0, kpis.totalPendingInvoices || 0];
    drawBars(ctx, canvas, labels, values, ['#c9152d', '#ef6b4c', '#a70f24', '#f39a5b']);
  }

  function drawMonthlyChart() {
    const canvas = document.getElementById('monthlyChart');
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    const rows = (state.pnlReport && state.pnlReport.monthly) || [];
    if (!rows.length) {
      drawEmptyChart(ctx, canvas, 'Sin datos mensuales');
      return;
    }
    const labels = rows.map(row => row.month || '');
    const values = rows.map(row => row.margin || 0);
    drawBars(ctx, canvas, labels, values, labels.map(() => '#d4363f'));
  }

  function drawEmptyChart(ctx, canvas, text) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fdf0f3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#7c3240';
    ctx.font = '14px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  function drawBars(ctx, canvas, labels, values, colors) {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff8fa';
    ctx.fillRect(0, 0, width, height);

    const margin = { top: 20, right: 24, bottom: 50, left: 36 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;
    const max = Math.max(...values.map(v => Math.abs(v)), 1);
    const barW = chartW / values.length * 0.56;
    const gap = chartW / values.length;

    ctx.strokeStyle = '#f0c8d0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + chartH);
    ctx.lineTo(margin.left + chartW, margin.top + chartH);
    ctx.stroke();

    values.forEach((value, i) => {
      const normalized = Math.abs(value) / max;
      const h = normalized * (chartH - 10);
      const x = margin.left + i * gap + (gap - barW) / 2;
      const y = margin.top + chartH - h;
      ctx.fillStyle = colors[i] || '#c9152d';
      ctx.fillRect(x, y, barW, h);

      ctx.fillStyle = '#5f1e2b';
      ctx.font = '12px Trebuchet MS';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barW / 2, height - 16);

      ctx.fillStyle = '#7c3240';
      ctx.font = '11px Trebuchet MS';
      ctx.fillText(formatShortNumber(value), x + barW / 2, y - 6);
    });
  }

  function formatShortNumber(value) {
    const num = Number(value || 0);
    if (Math.abs(num) >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(num) >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return String(Math.round(num));
  }

  function updateUndoButton() {
    if (!refs.undoBtn) {
      return;
    }
    const pending = state.undoStack.length;
    refs.undoBtn.disabled = pending === 0;
    refs.undoBtn.textContent = pending > 0 ? `Deshacer (${pending})` : 'Deshacer';
  }

  function pushUndo(action) {
    state.undoStack.push(action);
    if (state.undoStack.length > 25) {
      state.undoStack.shift();
    }
    updateUndoButton();
  }

  async function onUndo() {
    const action = state.undoStack.pop();
    updateUndoButton();
    if (!action) {
      showToast('No hay cambios para deshacer');
      return;
    }
    try {
      if (action.kind === 'delete') {
        await apiPost(`/api/${action.entity}`, action.item);
      } else if (action.kind === 'update') {
        await apiPut(`/api/${action.entity}/${action.id}`, action.before);
      }
      await reloadAll();
      showToast('Cambio deshecho');
    } catch (error) {
      showToast(error.message || 'No se pudo deshacer', true);
    }
  }

  async function onDeleteInvoice(id) {
    const row = state.invoices.find(item => item.id === id);
    if (!row) {
      return;
    }
    if (!window.confirm(`Se borrara la factura ${row.number || ''}. ¿Continuar?`)) {
      return;
    }
    try {
      await apiDelete(`/api/invoices/${id}`);
      pushUndo({ kind: 'delete', entity: 'invoices', item: row });
      await reloadAll();
      showToast('Factura eliminada. Puedes deshacer.');
    } catch (error) {
      showToast(error.message || 'No se pudo borrar la factura', true);
    }
  }

  async function onDeleteExpense(id) {
    const row = state.expenses.find(item => item.id === id);
    if (!row) {
      return;
    }
    if (!window.confirm(`Se borrara el gasto \"${row.concept || ''}\". ¿Continuar?`)) {
      return;
    }
    try {
      await apiDelete(`/api/expenses/${id}`);
      pushUndo({ kind: 'delete', entity: 'expenses', item: row });
      await reloadAll();
      showToast('Gasto eliminado. Puedes deshacer.');
    } catch (error) {
      showToast(error.message || 'No se pudo borrar el gasto', true);
    }
  }

  async function onToggleReconcile(id) {
    const row = state.bankMovements.find(item => item.id === id);
    if (!row) {
      return;
    }
    const before = { ...row };
    const payload = {
      date: row.date,
      account: row.account,
      type: row.type,
      concept: row.concept,
      amount: row.amount,
      reconciled: !row.reconciled
    };
    try {
      await apiPut(`/api/bank-movements/${id}`, payload);
      pushUndo({ kind: 'update', entity: 'bank-movements', id, before });
      await reloadAll();
      showToast(payload.reconciled ? 'Movimiento conciliado' : 'Conciliacion deshecha');
    } catch (error) {
      showToast(error.message || 'No se pudo cambiar conciliacion', true);
    }
  }

  function formToObject(form) {
    const out = {};
    Array.from(form.elements).forEach(input => {
      if (input.name) {
        out[input.name] = input.value;
      }
    });
    return out;
  }

  function toNumeric(value) {
    const parsed = Number(String(value || '0').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isStrongPasswordLocal(value) {
    const pass = String(value || '');
    return pass.length >= 10 && /[A-Z]/.test(pass) && /[a-z]/.test(pass) && /\d/.test(pass) && /[^A-Za-z0-9]/.test(pass);
  }

  async function onLogin(event) {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    try {
      const response = await apiPostPublic('/api/auth/login', payload);
      state.token = response.token;
      localStorage.setItem('cab_token', state.token);
      closeLogin();
      await reloadAll();
      if (response.mustChangePassword) {
        switchView('ajustes');
        showToast('Cambia la password inicial para proteger la app', true);
      } else {
        showToast('Sesion iniciada');
      }
    } catch (error) {
      showToast(error.message || 'No se pudo iniciar sesion', true);
    }
  }

  async function onLogout() {
    try {
      await apiPost('/api/auth/logout', {});
    } catch (error) {
      // Si la sesion ya no existe, se limpia local igualmente.
    }
    localStorage.removeItem('cab_token');
    state.token = '';
    state.undoStack = [];
    updateUndoButton();
    openLogin();
    showToast('Sesion cerrada');
  }

  async function onSaveInvoice(event) {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    payload.base = toNumeric(payload.base);
    payload.taxRate = toNumeric(payload.taxRate);
    payload.paidAmount = toNumeric(payload.paidAmount);
    await saveEntity('/api/invoices', payload, event.currentTarget, 'Factura guardada');
  }

  async function onSaveExpense(event) {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    payload.base = toNumeric(payload.base);
    payload.taxRate = toNumeric(payload.taxRate);
    await saveEntity('/api/expenses', payload, event.currentTarget, 'Gasto guardado');
  }

  async function onSaveClient(event) {
    event.preventDefault();
    await saveEntity('/api/clients', formToObject(event.currentTarget), event.currentTarget, 'Cliente guardado');
  }

  async function onSaveSupplier(event) {
    event.preventDefault();
    await saveEntity('/api/suppliers', formToObject(event.currentTarget), event.currentTarget, 'Proveedor guardado');
  }

  async function onSaveProduct(event) {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    payload.unitPrice = toNumeric(payload.unitPrice);
    payload.taxRate = toNumeric(payload.taxRate);
    await saveEntity('/api/products', payload, event.currentTarget, 'Producto guardado');
  }

  async function onSaveBankMovement(event) {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    payload.amount = toNumeric(payload.amount);
    payload.reconciled = payload.reconciled === 'true';
    await saveEntity('/api/bank-movements', payload, event.currentTarget, 'Movimiento guardado');
  }

  async function onSaveEntry(event) {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    payload.amount = toNumeric(payload.amount);
    await saveEntity('/api/entries', payload, event.currentTarget, 'Asiento guardado');
  }

  async function onSaveConfig(event) {
    event.preventDefault();
    try {
      await apiPut('/api/config', formToObject(event.currentTarget));
      showToast('Ajustes guardados');
      await reloadAll();
    } catch (error) {
      showToast(error.message || 'No se pudo guardar', true);
    }
  }

  async function onChangePassword(event) {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    if (!isStrongPasswordLocal(payload.newPassword)) {
      showToast('Password debil: usa 10+ caracteres, mayuscula, minuscula, numero y simbolo', true);
      return;
    }
    try {
      await apiPost('/api/auth/change-password', payload);
      event.currentTarget.reset();
      showToast('Password actualizada');
      await reloadAll();
    } catch (error) {
      showToast(error.message || 'No se pudo cambiar password', true);
    }
  }

  async function onVatReport(event) {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    const params = new URLSearchParams();
    if (payload.from) {
      params.set('from', payload.from);
    }
    if (payload.to) {
      params.set('to', payload.to);
    }
    try {
      const response = await apiGet(`/api/reports/vat?${params.toString()}`);
      const report = response.report || {};
      document.getElementById('vatOutput').textContent = formatCurrency(report.vatOutput || 0);
      document.getElementById('vatInput').textContent = formatCurrency(report.vatInput || 0);
      document.getElementById('vatNet').textContent = formatCurrency(report.vatNet || 0);
      showToast('Reporte generado');
    } catch (error) {
      showToast(error.message || 'No se pudo generar reporte', true);
    }
  }

  async function onPnlReport(event) {
    event.preventDefault();
    const payload = formToObject(event.currentTarget);
    const params = new URLSearchParams();
    if (payload.from) {
      params.set('from', payload.from);
    }
    if (payload.to) {
      params.set('to', payload.to);
    }
    try {
      const response = await apiGet(`/api/reports/pnl?${params.toString()}`);
      state.pnlReport = response.report || null;
      renderPnlReport();
      showToast('Reporte PYG generado');
    } catch (error) {
      showToast(error.message || 'No se pudo generar reporte PYG', true);
    }
  }

  async function saveEntity(url, payload, form, successText) {
    try {
      await apiPost(url, payload);
      form.reset();
      setTodayDefaults();
      showToast(successText);
      await reloadAll();
    } catch (error) {
      showToast(error.message || 'No se pudo guardar', true);
    }
  }

  async function exportCurrentView() {
    const map = {
      facturas: 'invoices',
      gastos: 'expenses',
      clientes: 'clients',
      proveedores: 'suppliers',
      productos: 'products',
      tesoreria: 'bank-movements',
      asientos: 'entries'
    };
    const route = map[state.currentView];
    if (!route) {
      showToast('Esta vista no tiene exportacion CSV');
      return;
    }

    try {
      const response = await fetch(`/api/export/${route}.csv`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${state.token}`
        }
      });
      if (response.status === 401) {
        openLogin();
        throw new Error('Sesion no valida.');
      }
      if (!response.ok) {
        throw new Error('No se pudo exportar CSV.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${route}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('CSV descargado');
    } catch (error) {
      showToast(error.message || 'Error exportando', true);
    }
  }

  function switchView(view) {
    state.currentView = view;
    document.querySelectorAll('.view').forEach(section => {
      section.classList.toggle('active', section.dataset.view === view);
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
  }

  function debounce(fn, delayMs = 240) {
    let timerId = 0;
    return (...args) => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        fn(...args);
      }, delayMs);
    };
  }

  function showToast(text, isError = false) {
    refs.toast.textContent = text;
    refs.toast.classList.remove('hidden', 'error');
    if (isError) {
      refs.toast.classList.add('error');
    }
    setTimeout(() => {
      refs.toast.classList.add('hidden');
      refs.toast.classList.remove('error');
    }, 2800);
  }

  function formatCurrency(value) {
    return currency.format(Number(value || 0));
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function apiGet(url) {
    return apiRequest(url, { method: 'GET' }, false);
  }

  async function apiPost(url, body) {
    return apiRequest(url, {
      method: 'POST',
      body: JSON.stringify(body)
    }, false);
  }

  async function apiPut(url, body) {
    return apiRequest(url, {
      method: 'PUT',
      body: JSON.stringify(body)
    }, false);
  }

  async function apiDelete(url) {
    return apiRequest(url, {
      method: 'DELETE'
    }, false);
  }

  async function apiPostPublic(url, body) {
    return apiRequest(url, {
      method: 'POST',
      body: JSON.stringify(body)
    }, true);
  }

  async function apiRequest(url, options, isPublic) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (!isPublic && state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }
    const response = await fetch(url, { ...options, headers });
    let json = {};
    try {
      json = await response.json();
    } catch (error) {
      json = {};
    }
    if (response.status === 401) {
      localStorage.removeItem('cab_token');
      state.token = '';
      openLogin();
      throw new Error((json && json.error) || 'Sesion caducada.');
    }
    if (!response.ok || json.ok === false) {
      throw new Error((json && json.error) || 'Error de API.');
    }
    return json;
  }
})();
