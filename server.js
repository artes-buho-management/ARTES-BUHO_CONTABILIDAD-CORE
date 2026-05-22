const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const APP_NAME = 'CONTABILIDAD ARTES BUHO';
const COMPANY_NAME = 'ARTES BUHO';
const DEVELOPER_NAME = 'RUBEN COTON';
const IS_VERCEL = Boolean(process.env.VERCEL);
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4070);

const ROOT_DIR = __dirname;
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'contabilidad-artes-buho-data') : path.join(ROOT_DIR, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const AUTH_FILE = 'auth.json';
const AUDIT_FILE = 'audit-log.json';
const DEFAULT_PASSWORD = process.env.CAB_PASSWORD || 'REPLACE_WITH_PASSWORD';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const MAX_AUDIT = 5000;
const LOGIN_WINDOW_MS = 1000 * 60 * 10;
const LOGIN_MAX_ATTEMPTS = 5;
const MAX_BACKUPS_PER_FILE = 40;
const PBKDF2_ITERATIONS = 120000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';
const PASSWORD_MIN_LENGTH = 10;

const sessions = new Map();
const loginAttempts = new Map();

const ROUTE_ENTITY = {
  clients: 'clients',
  suppliers: 'suppliers',
  products: 'products',
  invoices: 'invoices',
  expenses: 'expenses',
  entries: 'entries',
  'bank-movements': 'bankMovements'
};

const ENTITY_FILE = {
  clients: 'clients.json',
  suppliers: 'suppliers.json',
  products: 'products.json',
  invoices: 'invoices.json',
  expenses: 'expenses.json',
  entries: 'entries.json',
  bankMovements: 'bank-movements.json'
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const DEFAULT_CHART = [
  { code: '100', name: 'Capital social' },
  { code: '430', name: 'Clientes' },
  { code: '400', name: 'Proveedores' },
  { code: '472', name: 'HP IVA soportado' },
  { code: '477', name: 'HP IVA repercutido' },
  { code: '570', name: 'Caja' },
  { code: '572', name: 'Bancos' },
  { code: '600', name: 'Compras' },
  { code: '628', name: 'Suministros' },
  { code: '700', name: 'Ventas' }
];

function nowIso() {
  return new Date().toISOString();
}

function hashLegacyPassword(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createPasswordRecord(rawPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(rawPassword), salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return {
    hash,
    salt,
    iterations: PBKDF2_ITERATIONS
  };
}

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  if (left.length !== right.length || left.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function verifyPassword(rawPassword, auth) {
  if (auth && auth.hash && auth.salt && auth.iterations) {
    const candidate = crypto
      .pbkdf2Sync(String(rawPassword), auth.salt, Number(auth.iterations), PBKDF2_KEYLEN, PBKDF2_DIGEST)
      .toString('hex');
    return safeEqualHex(candidate, auth.hash);
  }
  return safeEqualHex(hashLegacyPassword(rawPassword), auth && auth.passwordHash);
}

function needsPasswordUpgrade(auth) {
  return !(auth && auth.hash && auth.salt && auth.iterations);
}

function slug(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function text(value) {
  return String(value || '').trim();
}

function toNum(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const normalized = String(value).replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDate(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return '';
  }
  return dt.toISOString().slice(0, 10);
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function invoiceStatus(total, paidAmount, dueDate, requestedStatus) {
  const pending = round2(Math.max(0, toNum(total) - toNum(paidAmount)));
  if (pending <= 0) {
    return 'Pagada';
  }
  if (toNum(paidAmount) > 0) {
    return 'Parcial';
  }
  const dueTime = dueDate ? new Date(dueDate).getTime() : 0;
  if (dueTime && dueTime < startOfToday()) {
    return 'Vencida';
  }
  const normalized = text(requestedStatus);
  if (normalized === 'Vencida') {
    return 'Vencida';
  }
  return 'Pendiente';
}

function isStrongPassword(value) {
  const pass = String(value || '');
  if (pass.length < PASSWORD_MIN_LENGTH) {
    return false;
  }
  const hasUpper = /[A-Z]/.test(pass);
  const hasLower = /[a-z]/.test(pass);
  const hasNumber = /\d/.test(pass);
  const hasSymbol = /[^A-Za-z0-9]/.test(pass);
  return hasUpper && hasLower && hasNumber && hasSymbol;
}

function fileDateMs(value) {
  if (!value) {
    return 0;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { ok: false, error: message });
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 4 * 1024 * 1024) {
        reject(new Error('Payload demasiado grande.'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('JSON invalido.'));
      }
    });
    req.on('error', reject);
  });
}

function initialData(fileName) {
  if (fileName === AUTH_FILE) {
    const password = createPasswordRecord(DEFAULT_PASSWORD);
    return {
      ...password,
      mustChangePassword: true,
      updatedAt: nowIso()
    };
  }
  if (fileName === AUDIT_FILE) {
    return [];
  }
  if (fileName === 'company.json') {
    return {
      appName: APP_NAME,
      empresa: COMPANY_NAME,
      desarrollador: DEVELOPER_NAME,
      nif: '',
      email: '',
      telefono: '',
      direccion: '',
      moneda: 'EUR',
      ejercicio: String(new Date().getFullYear()),
      chartOfAccounts: DEFAULT_CHART,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }
  return [];
}

async function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const files = ['company.json', AUTH_FILE, AUDIT_FILE, ...Object.values(ENTITY_FILE)];
  for (const fileName of files) {
    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(initialData(fileName), null, 2), 'utf-8');
    }
  }
  await ensureAuthSchema();
}

async function readData(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function appendAudit(action, entity, detail, actor) {
  const rows = await readData(AUDIT_FILE);
  rows.push({
    id: slug('aud'),
    at: nowIso(),
    action: text(action),
    entity: text(entity),
    detail: text(detail),
    actor: text(actor || 'usuario')
  });
  const trimmed = rows.slice(-MAX_AUDIT);
  const filePath = path.join(DATA_DIR, AUDIT_FILE);
  await fs.promises.writeFile(filePath, JSON.stringify(trimmed, null, 2), 'utf-8');
}

async function ensureAuthSchema() {
  const auth = await readData(AUTH_FILE);
  if (auth && typeof auth === 'object' && ((auth.hash && auth.salt && auth.iterations) || auth.passwordHash)) {
    return;
  }
  const fresh = {
    ...createPasswordRecord(DEFAULT_PASSWORD),
    mustChangePassword: true,
    updatedAt: nowIso()
  };
  await writeData(AUTH_FILE, fresh);
}

async function pruneBackups(fileName) {
  const files = await fs.promises.readdir(BACKUP_DIR);
  const prefix = `${fileName}.`;
  const candidates = files
    .filter(name => name.startsWith(prefix) && name.endsWith('.bak'))
    .sort()
    .reverse();
  if (candidates.length <= MAX_BACKUPS_PER_FILE) {
    return;
  }
  const toDelete = candidates.slice(MAX_BACKUPS_PER_FILE);
  await Promise.all(
    toDelete.map(name => fs.promises.unlink(path.join(BACKUP_DIR, name)).catch(() => null))
  );
}

async function backup(fileName) {
  if (fileName === AUTH_FILE || fileName === AUDIT_FILE) {
    return;
  }
  const src = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(src)) {
    return;
  }
  const stamp = nowIso().replace(/[:.]/g, '-');
  const dst = path.join(BACKUP_DIR, `${fileName}.${stamp}.bak`);
  await fs.promises.copyFile(src, dst);
  await pruneBackups(fileName);
}

async function writeData(fileName, payload, auditMeta) {
  await backup(fileName);
  const filePath = path.join(DATA_DIR, fileName);
  const tmpPath = `${filePath}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
  try {
    await fs.promises.rename(tmpPath, filePath);
  } catch (error) {
    if (error && (error.code === 'EEXIST' || error.code === 'EPERM')) {
      await fs.promises.unlink(filePath).catch(() => null);
      await fs.promises.rename(tmpPath, filePath);
    } else {
      throw error;
    }
  }
  if (auditMeta) {
    await appendAudit(auditMeta.action, auditMeta.entity, auditMeta.detail, auditMeta.actor);
  }
}

function sortByDateDesc(list) {
  return [...list].sort((a, b) => {
    const aTime = new Date(a.date || a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.date || b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function monthKey(value) {
  const dt = new Date(value || 0);
  if (Number.isNaN(dt.getTime())) {
    return '';
  }
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function filterByDateRange(rows, from, to) {
  const fromMs = from ? fileDateMs(from) : 0;
  const toMs = to ? fileDateMs(to) : Number.MAX_SAFE_INTEGER;
  return rows.filter(row => {
    const ms = fileDateMs(row.date || row.updatedAt || row.createdAt);
    return ms >= fromMs && ms <= toMs;
  });
}

function applyListFilters(rows, searchParams) {
  let out = [...rows];
  const q = text(searchParams.get('q')).toLowerCase();
  const status = text(searchParams.get('status')).toLowerCase();
  const from = text(searchParams.get('from'));
  const to = text(searchParams.get('to'));
  const limit = Math.min(Math.max(toNum(searchParams.get('limit'), 0), 0), 1000);

  if (from || to) {
    out = filterByDateRange(out, from, to);
  }
  if (status) {
    out = out.filter(row => text(row.status).toLowerCase() === status);
  }
  if (q) {
    out = out.filter(row => JSON.stringify(row).toLowerCase().includes(q));
  }
  if (limit > 0) {
    out = out.slice(0, limit);
  }
  return out;
}

function cleanupSessions() {
  const now = Date.now();
  sessions.forEach((session, token) => {
    if (!session || session.expiresAt <= now) {
      sessions.delete(token);
    }
  });
}

function canAttemptLogin(ip) {
  const row = loginAttempts.get(ip);
  if (!row) {
    return true;
  }
  const age = Date.now() - row.firstAt;
  if (age > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return true;
  }
  return row.count < LOGIN_MAX_ATTEMPTS;
}

function registerFailedLogin(ip) {
  const existing = loginAttempts.get(ip);
  if (!existing) {
    loginAttempts.set(ip, { count: 1, firstAt: Date.now() });
    return;
  }
  const age = Date.now() - existing.firstAt;
  if (age > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAt: Date.now() });
    return;
  }
  loginAttempts.set(ip, { count: existing.count + 1, firstAt: existing.firstAt });
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

function tokenFromReq(req) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }
  return '';
}

function isPublicApi(pathname) {
  return pathname === '/api/health' || pathname === '/api/auth/login';
}

function requireAuth(req, res) {
  cleanupSessions();
  const token = tokenFromReq(req);
  if (!token || !sessions.has(token)) {
    sendError(res, 401, 'No autorizado. Inicia sesion.');
    return null;
  }
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    sendError(res, 401, 'Sesion expirada.');
    return null;
  }
  return session;
}

async function sanitizeEntity(entity, payload, existingId = '') {
  if (entity === 'clients' || entity === 'suppliers') {
    const name = text(payload.name);
    const email = text(payload.email);
    if (!name) {
      throw new Error('El nombre es obligatorio.');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('El email no tiene formato valido.');
    }
    return {
      name,
      nif: text(payload.nif),
      email,
      phone: text(payload.phone),
      address: text(payload.address),
      notes: text(payload.notes)
    };
  }

  if (entity === 'products') {
    const name = text(payload.name);
    const unitPrice = round2(toNum(payload.unitPrice, 0));
    const taxRate = round2(toNum(payload.taxRate, 21));
    if (!name) {
      throw new Error('El nombre de producto/servicio es obligatorio.');
    }
    if (unitPrice < 0) {
      throw new Error('El precio no puede ser negativo.');
    }
    if (taxRate < 0 || taxRate > 30) {
      throw new Error('El IVA debe estar entre 0 y 30.');
    }
    return {
      sku: text(payload.sku),
      name,
      category: text(payload.category),
      unitPrice,
      taxRate,
      notes: text(payload.notes)
    };
  }

  if (entity === 'invoices') {
    const invoices = await readData(ENTITY_FILE.invoices);
    const date = toDate(payload.date) || toDate(new Date());
    let number = text(payload.number);
    if (!number) {
      const year = date.slice(0, 4);
      const re = new RegExp(`^F-${year}-(\\d+)$`);
      let max = 0;
      invoices.forEach(row => {
        const match = String(row.number || '').match(re);
        if (match) {
          max = Math.max(max, Number(match[1]));
        }
      });
      number = `F-${year}-${String(max + 1).padStart(3, '0')}`;
    }
    if (invoices.some(row => row.number === number && row.id !== existingId)) {
      throw new Error(`Ya existe la factura ${number}.`);
    }

    const concept = text(payload.concept);
    if (!concept) {
      throw new Error('El concepto de la factura es obligatorio.');
    }
    const clientId = text(payload.clientId);
    if (clientId) {
      const clients = await readData(ENTITY_FILE.clients);
      if (!clients.some(row => row.id === clientId)) {
        throw new Error('Cliente no encontrado.');
      }
    }

    const base = round2(toNum(payload.base, 0));
    const taxRate = round2(toNum(payload.taxRate, 21));
    if (base <= 0) {
      throw new Error('La base imponible de la factura debe ser mayor que 0.');
    }
    if (taxRate < 0 || taxRate > 30) {
      throw new Error('El IVA de la factura debe estar entre 0 y 30.');
    }
    const tax = round2((base * taxRate) / 100);
    const total = round2(base + tax);
    const paidAmount = Math.min(Math.max(0, round2(toNum(payload.paidAmount, 0))), total);
    const dueDate = toDate(payload.dueDate);

    return {
      number,
      date,
      dueDate,
      clientId,
      concept,
      base,
      taxRate,
      tax,
      total,
      paidAmount,
      status: invoiceStatus(total, paidAmount, dueDate, payload.status),
      notes: text(payload.notes)
    };
  }

  if (entity === 'expenses') {
    const concept = text(payload.concept);
    if (!concept) {
      throw new Error('El concepto del gasto es obligatorio.');
    }
    const supplierId = text(payload.supplierId);
    if (supplierId) {
      const suppliers = await readData(ENTITY_FILE.suppliers);
      if (!suppliers.some(row => row.id === supplierId)) {
        throw new Error('Proveedor no encontrado.');
      }
    }
    const base = round2(toNum(payload.base, 0));
    const taxRate = round2(toNum(payload.taxRate, 21));
    if (base <= 0) {
      throw new Error('La base imponible del gasto debe ser mayor que 0.');
    }
    if (taxRate < 0 || taxRate > 30) {
      throw new Error('El IVA del gasto debe estar entre 0 y 30.');
    }
    const tax = round2((base * taxRate) / 100);
    const total = round2(base + tax);
    const status = text(payload.status) || 'Pagado';
    if (!['Pagado', 'Pendiente'].includes(status)) {
      throw new Error('Estado de gasto no valido.');
    }
    return {
      date: toDate(payload.date) || toDate(new Date()),
      supplierId,
      concept,
      category: text(payload.category),
      paymentMethod: text(payload.paymentMethod),
      base,
      taxRate,
      tax,
      total,
      status,
      notes: text(payload.notes)
    };
  }

  if (entity === 'entries') {
    const description = text(payload.description);
    const debitAccount = text(payload.debitAccount);
    const creditAccount = text(payload.creditAccount);
    const amount = round2(toNum(payload.amount, 0));
    if (!description) {
      throw new Error('La descripcion es obligatoria.');
    }
    if (!debitAccount || !creditAccount) {
      throw new Error('Debe indicar cuenta debe y haber.');
    }
    if (amount <= 0) {
      throw new Error('El importe debe ser mayor que 0.');
    }
    return {
      date: toDate(payload.date) || toDate(new Date()),
      description,
      debitAccount,
      creditAccount,
      amount,
      reference: text(payload.reference)
    };
  }

  if (entity === 'bankMovements') {
    const type = text(payload.type) || 'Ingreso';
    if (!['Ingreso', 'Gasto'].includes(type)) {
      throw new Error('Tipo de movimiento no valido.');
    }
    const concept = text(payload.concept);
    if (!concept) {
      throw new Error('El concepto es obligatorio.');
    }
    const amount = round2(toNum(payload.amount, 0));
    if (amount <= 0) {
      throw new Error('El importe debe ser mayor que 0.');
    }
    return {
      date: toDate(payload.date) || toDate(new Date()),
      account: text(payload.account),
      type,
      concept,
      amount,
      reconciled: Boolean(payload.reconciled)
    };
  }

  throw new Error('Entidad no soportada.');
}

async function dashboardData() {
  const [clients, suppliers, products, invoices, expenses, entries, bank, company, audit] = await Promise.all([
    readData(ENTITY_FILE.clients),
    readData(ENTITY_FILE.suppliers),
    readData(ENTITY_FILE.products),
    readData(ENTITY_FILE.invoices),
    readData(ENTITY_FILE.expenses),
    readData(ENTITY_FILE.entries),
    readData(ENTITY_FILE.bankMovements),
    readData('company.json'),
    readData(AUDIT_FILE)
  ]);

  const totalSales = round2(invoices.reduce((acc, row) => acc + toNum(row.total), 0));
  const totalExpenses = round2(expenses.reduce((acc, row) => acc + toNum(row.total), 0));
  const pending = round2(invoices.reduce((acc, row) => acc + Math.max(0, toNum(row.total) - toNum(row.paidAmount)), 0));
  const overdueInvoices = invoices.filter(row => {
    const remain = round2(Math.max(0, toNum(row.total) - toNum(row.paidAmount)));
    if (remain <= 0) {
      return false;
    }
    const due = fileDateMs(row.dueDate);
    return due > 0 && due < startOfToday();
  });
  const overdueAmount = round2(overdueInvoices.reduce((acc, row) => acc + Math.max(0, toNum(row.total) - toNum(row.paidAmount)), 0));
  const bankBalance = round2(
    bank.reduce((acc, row) => acc + (row.type === 'Gasto' ? -toNum(row.amount) : toNum(row.amount)), 0)
  );
  const vatOutput = round2(invoices.reduce((acc, row) => acc + toNum(row.tax), 0));
  const vatInput = round2(expenses.reduce((acc, row) => acc + toNum(row.tax), 0));
  const currentMonth = monthKey(new Date());
  const monthSales = round2(
    invoices.filter(row => monthKey(row.date) === currentMonth).reduce((acc, row) => acc + toNum(row.total), 0)
  );
  const monthExpenses = round2(
    expenses.filter(row => monthKey(row.date) === currentMonth).reduce((acc, row) => acc + toNum(row.total), 0)
  );
  const monthCashFlow = round2(
    bank
      .filter(row => monthKey(row.date) === currentMonth)
      .reduce((acc, row) => acc + (row.type === 'Gasto' ? -toNum(row.amount) : toNum(row.amount)), 0)
  );
  const collectionRate = totalSales > 0 ? round2(((totalSales - pending) / totalSales) * 100) : 100;

  const activity = sortByDateDesc([
    ...invoices.map(row => ({ module: 'Facturas', date: row.date, title: row.number, detail: row.concept, amount: row.total })),
    ...expenses.map(row => ({ module: 'Gastos', date: row.date, title: row.concept, detail: row.category, amount: row.total })),
    ...bank.map(row => ({ module: 'Tesoreria', date: row.date, title: row.concept, detail: row.type, amount: row.amount }))
  ]).slice(0, 12);

  return {
    appName: APP_NAME,
    empresa: company.empresa || COMPANY_NAME,
    kpis: {
      totalSales,
      totalExpenses,
      margin: round2(totalSales - totalExpenses),
      totalPendingInvoices: pending,
      overdueInvoices: overdueInvoices.length,
      overdueAmount,
      collectionRate,
      monthSales,
      monthExpenses,
      monthCashFlow,
      bankBalance,
      totalInvoices: invoices.length,
      totalEntries: entries.length,
      totalClients: clients.length,
      totalSuppliers: suppliers.length,
      totalProducts: products.length
    },
    vat: { output: vatOutput, input: vatInput, net: round2(vatOutput - vatInput) },
    recentActivity: activity,
    quality: { backupsEnabled: true, auditRows: audit.length }
  };
}

function defaultRange() {
  const today = new Date();
  return {
    from: `${today.getFullYear()}-01-01`,
    to: today.toISOString().slice(0, 10)
  };
}

async function buildVatReport(fromRaw, toRaw) {
  const range = defaultRange();
  const from = text(fromRaw) || range.from;
  const to = text(toRaw) || range.to;
  const invoices = filterByDateRange(await readData(ENTITY_FILE.invoices), from, to);
  const expenses = filterByDateRange(await readData(ENTITY_FILE.expenses), from, to);
  const vatOutput = round2(invoices.reduce((acc, row) => acc + toNum(row.tax), 0));
  const vatInput = round2(expenses.reduce((acc, row) => acc + toNum(row.tax), 0));
  return {
    from,
    to,
    vatOutput,
    vatInput,
    vatNet: round2(vatOutput - vatInput),
    invoices: invoices.length,
    expenses: expenses.length
  };
}

async function buildPnlReport(fromRaw, toRaw) {
  const range = defaultRange();
  const from = text(fromRaw) || range.from;
  const to = text(toRaw) || range.to;
  const invoices = filterByDateRange(await readData(ENTITY_FILE.invoices), from, to);
  const expenses = filterByDateRange(await readData(ENTITY_FILE.expenses), from, to);
  const totalSales = round2(invoices.reduce((acc, row) => acc + toNum(row.total), 0));
  const totalExpenses = round2(expenses.reduce((acc, row) => acc + toNum(row.total), 0));
  const pending = round2(invoices.reduce((acc, row) => acc + Math.max(0, toNum(row.total) - toNum(row.paidAmount)), 0));
  const grouped = {};
  invoices.forEach(row => {
    const key = monthKey(row.date);
    if (!key) {
      return;
    }
    if (!grouped[key]) {
      grouped[key] = { month: key, sales: 0, expenses: 0, margin: 0 };
    }
    grouped[key].sales = round2(grouped[key].sales + toNum(row.total));
    grouped[key].margin = round2(grouped[key].sales - grouped[key].expenses);
  });
  expenses.forEach(row => {
    const key = monthKey(row.date);
    if (!key) {
      return;
    }
    if (!grouped[key]) {
      grouped[key] = { month: key, sales: 0, expenses: 0, margin: 0 };
    }
    grouped[key].expenses = round2(grouped[key].expenses + toNum(row.total));
    grouped[key].margin = round2(grouped[key].sales - grouped[key].expenses);
  });
  const monthly = Object.values(grouped).sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  return {
    from,
    to,
    totalSales,
    totalExpenses,
    margin: round2(totalSales - totalExpenses),
    collectionRate: totalSales > 0 ? round2(((totalSales - pending) / totalSales) * 100) : 100,
    pending,
    monthly
  };
}

async function buildSnapshot() {
  const [dashboard, config, audit, clients, suppliers, products, invoices, expenses, entries, bankMovements, pnl] = await Promise.all([
    dashboardData(),
    readData('company.json'),
    readData(AUDIT_FILE),
    readData(ENTITY_FILE.clients),
    readData(ENTITY_FILE.suppliers),
    readData(ENTITY_FILE.products),
    readData(ENTITY_FILE.invoices),
    readData(ENTITY_FILE.expenses),
    readData(ENTITY_FILE.entries),
    readData(ENTITY_FILE.bankMovements),
    buildPnlReport()
  ]);

  return {
    dashboard,
    config,
    audit: sortByDateDesc(audit).slice(0, 150),
    clients: sortByDateDesc(clients),
    suppliers: sortByDateDesc(suppliers),
    products: sortByDateDesc(products),
    invoices: sortByDateDesc(invoices),
    expenses: sortByDateDesc(expenses),
    entries: sortByDateDesc(entries),
    bankMovements: sortByDateDesc(bankMovements),
    pnl
  };
}

async function globalSearch(rawQ) {
  const q = text(rawQ).toLowerCase();
  if (!q) {
    return [];
  }
  const [clients, suppliers, products, invoices, expenses, entries, bank] = await Promise.all([
    readData(ENTITY_FILE.clients),
    readData(ENTITY_FILE.suppliers),
    readData(ENTITY_FILE.products),
    readData(ENTITY_FILE.invoices),
    readData(ENTITY_FILE.expenses),
    readData(ENTITY_FILE.entries),
    readData(ENTITY_FILE.bankMovements)
  ]);

  const out = [];
  function push(module, rows, labelFn, detailFn) {
    rows.forEach(row => {
      if (JSON.stringify(row).toLowerCase().includes(q)) {
        out.push({ id: row.id, module, label: labelFn(row), detail: detailFn(row) });
      }
    });
  }
  push('facturas', invoices, row => row.number || 'Factura', row => `${row.concept} | ${row.total} EUR`);
  push('gastos', expenses, row => row.concept || 'Gasto', row => `${row.category} | ${row.total} EUR`);
  push('clientes', clients, row => row.name || 'Cliente', row => `${row.nif || ''} ${row.email || ''}`);
  push('proveedores', suppliers, row => row.name || 'Proveedor', row => `${row.nif || ''} ${row.email || ''}`);
  push('productos', products, row => row.name || 'Producto', row => `${row.category || ''} | ${row.unitPrice} EUR`);
  push('asientos', entries, row => row.description || 'Asiento', row => `${row.debitAccount}/${row.creditAccount} | ${row.amount} EUR`);
  push('tesoreria', bank, row => row.concept || 'Movimiento', row => `${row.type} | ${row.amount} EUR`);

  return out.slice(0, 30);
}

function toCsv(rows) {
  if (!rows.length) {
    return 'sin_datos\n';
  }
  const normalized = rows.map(row => {
    const out = {};
    Object.keys(row).forEach(key => {
      const value = row[key];
      out[key] = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
    return out;
  });
  const headers = Array.from(new Set(normalized.flatMap(row => Object.keys(row))));
  const lines = [
    headers.join(';'),
    ...normalized.map(row => headers.map(header => `"${String(row[header] || '').replace(/"/g, '""')}"`).join(';'))
  ];
  return lines.join('\n');
}

async function handleAuthLogin(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (!canAttemptLogin(ip)) {
    sendError(res, 429, 'Demasiados intentos. Espera unos minutos.');
    return;
  }

  const payload = await parseBody(req);
  const pass = text(payload.password);
  if (!pass) {
    sendError(res, 400, 'Debes indicar password.');
    return;
  }
  const auth = await readData(AUTH_FILE);
  if (!verifyPassword(pass, auth)) {
    registerFailedLogin(ip);
    sendError(res, 401, 'Credenciales invalidas.');
    return;
  }

  if (needsPasswordUpgrade(auth)) {
    const upgraded = {
      ...createPasswordRecord(pass),
      mustChangePassword: auth.mustChangePassword !== false,
      updatedAt: nowIso()
    };
    await writeData(AUTH_FILE, upgraded);
  }

  clearLoginAttempts(ip);
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { actor: 'admin', expiresAt });
  await appendAudit('LOGIN', 'auth', 'Inicio de sesion', 'admin');
  sendJson(res, 200, { ok: true, token, expiresAt, mustChangePassword: Boolean(auth.mustChangePassword) });
}

async function handleApi(req, res, urlObj, session) {
  const parts = urlObj.pathname.split('/').filter(Boolean);
  const actor = session ? session.actor : 'publico';

  if (parts[1] === 'health') {
    sendJson(res, 200, {
      ok: true,
      appName: APP_NAME,
      empresa: COMPANY_NAME,
      desarrollador: DEVELOPER_NAME,
      timestamp: nowIso()
    });
    return;
  }

  if (parts[1] === 'auth' && parts[2] === 'login') {
    if (req.method !== 'POST') {
      sendError(res, 405, 'Metodo no permitido.');
      return;
    }
    await handleAuthLogin(req, res);
    return;
  }

  if (parts[1] === 'auth' && parts[2] === 'status') {
    if (req.method !== 'GET') {
      sendError(res, 405, 'Metodo no permitido.');
      return;
    }
    sendJson(res, 200, { ok: true, actor: actor, expiresAt: session.expiresAt });
    return;
  }

  if (parts[1] === 'auth' && parts[2] === 'change-password') {
    if (req.method !== 'POST') {
      sendError(res, 405, 'Metodo no permitido.');
      return;
    }
    const body = await parseBody(req);
    const currentPassword = text(body.currentPassword);
    const newPassword = text(body.newPassword);
    if (!currentPassword || !newPassword) {
      sendError(res, 400, 'Debes indicar password actual y nueva.');
      return;
    }
    if (!isStrongPassword(newPassword)) {
      sendError(res, 400, 'Password debil. Usa minimo 10 caracteres con mayuscula, minuscula, numero y simbolo.');
      return;
    }
    const auth = await readData(AUTH_FILE);
    if (!verifyPassword(currentPassword, auth)) {
      sendError(res, 401, 'Password actual incorrecta.');
      return;
    }
    const updated = {
      ...createPasswordRecord(newPassword),
      mustChangePassword: false,
      updatedAt: nowIso()
    };
    await writeData(AUTH_FILE, updated);
    await appendAudit('UPDATE_PASSWORD', 'auth', 'Password actualizada', actor);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (parts[1] === 'auth' && parts[2] === 'logout') {
    if (req.method !== 'POST') {
      sendError(res, 405, 'Metodo no permitido.');
      return;
    }
    const token = tokenFromReq(req);
    if (token) {
      sessions.delete(token);
    }
    await appendAudit('LOGOUT', 'auth', 'Cierre de sesion', actor);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (parts[1] === 'dashboard') {
    sendJson(res, 200, { ok: true, dashboard: await dashboardData() });
    return;
  }

  if (parts[1] === 'snapshot') {
    if (req.method !== 'GET') {
      sendError(res, 405, 'Metodo no permitido.');
      return;
    }
    sendJson(res, 200, { ok: true, snapshot: await buildSnapshot() });
    return;
  }

  if (parts[1] === 'search') {
    const q = urlObj.searchParams.get('q') || '';
    sendJson(res, 200, { ok: true, items: await globalSearch(q) });
    return;
  }

  if (parts[1] === 'audit') {
    if (req.method !== 'GET') {
      sendError(res, 405, 'Metodo no permitido.');
      return;
    }
    const rows = await readData(AUDIT_FILE);
    sendJson(res, 200, { ok: true, items: sortByDateDesc(rows).slice(0, 150) });
    return;
  }

  if (parts[1] === 'config') {
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, config: await readData('company.json') });
      return;
    }
    if (req.method === 'PUT') {
      const payload = await parseBody(req);
      const current = await readData('company.json');
      const updated = {
        ...current,
        ...payload,
        empresa: text(payload.empresa || current.empresa || COMPANY_NAME),
        desarrollador: text(payload.desarrollador || current.desarrollador || DEVELOPER_NAME),
        updatedAt: nowIso()
      };
      await writeData('company.json', updated, {
        action: 'UPDATE',
        entity: 'config',
        detail: 'Ajustes de empresa actualizados',
        actor
      });
      sendJson(res, 200, { ok: true, config: updated });
      return;
    }
    sendError(res, 405, 'Metodo no permitido.');
    return;
  }

  if (parts[1] === 'reports' && parts[2] === 'vat') {
    sendJson(res, 200, {
      ok: true,
      report: await buildVatReport(urlObj.searchParams.get('from'), urlObj.searchParams.get('to'))
    });
    return;
  }

  if (parts[1] === 'reports' && parts[2] === 'pnl') {
    sendJson(res, 200, {
      ok: true,
      report: await buildPnlReport(urlObj.searchParams.get('from'), urlObj.searchParams.get('to'))
    });
    return;
  }

  if (parts[1] === 'export' && parts[2]) {
    if (req.method !== 'GET') {
      sendError(res, 405, 'Metodo no permitido.');
      return;
    }
    const route = parts[2].replace('.csv', '');
    const entity = ROUTE_ENTITY[route];
    if (!entity) {
      sendError(res, 404, 'Entidad no exportable.');
      return;
    }
    const rows = await readData(ENTITY_FILE[entity]);
    const csv = toCsv(sortByDateDesc(rows));
    const name = `${route}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`
    });
    res.end(csv);
    return;
  }

  const route = parts[1];
  const entity = ROUTE_ENTITY[route];
  if (!entity) {
    sendError(res, 404, 'Ruta API no encontrada.');
    return;
  }
  const fileName = ENTITY_FILE[entity];

  if (parts.length === 2) {
    if (req.method === 'GET') {
      const rows = sortByDateDesc(await readData(fileName));
      sendJson(res, 200, { ok: true, items: applyListFilters(rows, urlObj.searchParams) });
      return;
    }
    if (req.method === 'POST') {
      try {
        const body = await parseBody(req);
        const clean = await sanitizeEntity(entity, body);
        const rows = await readData(fileName);
        const item = { id: slug(entity.slice(0, 3)), ...clean, createdAt: nowIso(), updatedAt: nowIso() };
        rows.push(item);
        await writeData(fileName, rows, {
          action: 'CREATE',
          entity,
          detail: `Nuevo registro ${item.id}`,
          actor
        });
        sendJson(res, 201, { ok: true, item });
      } catch (error) {
        sendError(res, 400, error.message || 'Datos invalidos.');
      }
      return;
    }
    sendError(res, 405, 'Metodo no permitido.');
    return;
  }

  if (parts.length === 3) {
    const itemId = parts[2];
    const rows = await readData(fileName);
    const index = rows.findIndex(row => row.id === itemId);
    if (index === -1) {
      sendError(res, 404, 'Registro no encontrado.');
      return;
    }
    if (req.method === 'PUT') {
      try {
        const body = await parseBody(req);
        const clean = await sanitizeEntity(entity, body, itemId);
        rows[index] = { ...rows[index], ...clean, updatedAt: nowIso() };
        await writeData(fileName, rows, {
          action: 'UPDATE',
          entity,
          detail: `Registro actualizado ${itemId}`,
          actor
        });
        sendJson(res, 200, { ok: true, item: rows[index] });
      } catch (error) {
        sendError(res, 400, error.message || 'Datos invalidos.');
      }
      return;
    }
    if (req.method === 'DELETE') {
      const removed = rows.splice(index, 1)[0];
      await writeData(fileName, rows, {
        action: 'DELETE',
        entity,
        detail: `Registro eliminado ${itemId}`,
        actor
      });
      sendJson(res, 200, { ok: true, item: removed });
      return;
    }
    sendError(res, 405, 'Metodo no permitido.');
    return;
  }

  sendError(res, 404, 'Ruta API no encontrada.');
}

async function serveStatic(req, res, urlObj) {
  let filePath = urlObj.pathname === '/' ? '/index.html' : urlObj.pathname;
  const fullPath = path.join(PUBLIC_DIR, filePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) {
    sendError(res, 403, 'Acceso denegado.');
    return;
  }
  try {
    const stat = await fs.promises.stat(resolved);
    if (stat.isDirectory()) {
      sendError(res, 403, 'Acceso denegado.');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const data = await fs.promises.readFile(resolved);
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch (error) {
    if (urlObj.pathname.startsWith('/api/')) {
      sendError(res, 404, 'No encontrado.');
      return;
    }
    const html = await fs.promises.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }
}

async function requestHandler(req, res) {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (urlObj.pathname.startsWith('/api/')) {
      let session = null;
      if (!isPublicApi(urlObj.pathname)) {
        session = requireAuth(req, res);
        if (!session) {
          return;
        }
      }
      await handleApi(req, res, urlObj, session);
      return;
    }
    await serveStatic(req, res, urlObj);
  } catch (error) {
    console.error('Error en servidor:', error);
    sendError(res, 500, 'Error interno del servidor.');
  }
}

async function start() {
  await ensureBoot();
  const server = http.createServer(requestHandler);
  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('==============================================');
    console.log(`${APP_NAME} listo`);
    console.log(`Empresa: ${COMPANY_NAME}`);
    console.log(`Desarrollador: ${DEVELOPER_NAME}`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`LAN:   http://${HOST}:${PORT}`);
    console.log('Login protegido activo. Cambia la password inicial en Ajustes.');
    console.log('==============================================');
    console.log('');
  });
}

let bootPromise = null;
function ensureBoot() {
  if (!bootPromise) {
    bootPromise = ensureDataFiles();
  }
  return bootPromise;
}

if (IS_VERCEL) {
  module.exports = async (req, res) => {
    await ensureBoot();
    await requestHandler(req, res);
  };
} else {
  start().catch(error => {
    console.error('No se pudo iniciar el servidor:', error);
    process.exit(1);
  });
}
