import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PLANS, PaymentStatus, PlanId, SubscriptionPlan, SubscriptionStatus, UserRole } from '@/lib/subscription';
import { hashPassword } from '@/lib/server/password';

export interface UserRecord {
  id: string;
  name: string;
  mobile: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: SubscriptionStatus;
  proStartDate?: string;
  proEndDate?: string;
  proActiveDates: string[];
  blockedAt?: string;
  disclaimerAcceptedAt?: string;
  googleSub?: string;
  authProvider?: 'password' | 'google';
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRequestRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planId: PlanId;
  planName: string;
  amount: number;
  utr: string;
  paymentDate: string;
  screenshotUrl?: string;
  status: PaymentStatus;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface AdminSettings {
  upiId: string;
  qrImageUrl: string;
  paymentInstructions: string;
  updatedAt: string;
}

export interface PredictionLogRecord {
  id: string;
  userId?: string;
  symbol: string;
  signal: string;
  confidence: number;
  createdAt: string;
}

export interface PortfolioHoldingRecord {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currency: 'INR' | 'USD';
  updatedAt: string;
}

export interface TradeHistoryRecord {
  id: string;
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  currency: 'INR' | 'USD';
  realizedPnl?: number;
  stopLoss?: number;
  target?: number;
  createdAt: string;
}

export interface PaperAccountRecord {
  userId: string;
  virtualBalance: number;
  holdings: PortfolioHoldingRecord[];
  trades: TradeHistoryRecord[];
  updatedAt: string;
}

export interface WatchlistRecord {
  userId: string;
  symbols: string[];
  updatedAt: string;
}

export interface StockSenseDb {
  version: 1;
  users: UserRecord[];
  plans: SubscriptionPlan[];
  paymentRequests: PaymentRequestRecord[];
  settings: AdminSettings;
  predictionLogs: PredictionLogRecord[];
  paperAccounts: PaperAccountRecord[];
  watchlists: WatchlistRecord[];
  updatedAt: string;
}

const DEFAULT_ADMIN_EMAIL = 'admin@stocksense.local';
const DEFAULT_ADMIN_PASSWORD = 'Admin@12345';
const DEFAULT_REMOTE_DB_KEY = 'stocksense:db:v1';

let writeQueue = Promise.resolve();

interface RemoteDbConfig {
  url: string;
  token: string;
  key: string;
}

interface RedisRestResponse<T> {
  result?: T;
  error?: string;
}

function getRemoteDbConfig(): RemoteDbConfig | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  return {
    url: url.replace(/\/+$/, ''),
    token,
    key: process.env.STOCKSENSE_DB_KEY || DEFAULT_REMOTE_DB_KEY,
  };
}

async function redisCommand<T>(config: RemoteDbConfig, command: unknown[]): Promise<T | null> {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  const payload = await response.json().catch(() => null) as RedisRestResponse<T> | null;
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || `Remote DB request failed with ${response.status}`);
  }

  return payload && 'result' in payload ? payload.result ?? null : null;
}

async function readRemoteDb(config: RemoteDbConfig): Promise<StockSenseDb> {
  const raw = await redisCommand<string>(config, ['GET', config.key]);
  if (raw) {
    return hydrateDb(JSON.parse(raw) as StockSenseDb);
  }

  const db = await createSeedDb();
  await redisCommand<string>(config, ['SET', config.key, JSON.stringify(db)]);
  return hydrateDb(db);
}

async function writeRemoteDb(config: RemoteDbConfig, db: StockSenseDb) {
  await redisCommand<string>(config, ['SET', config.key, JSON.stringify(db)]);
}

function getDbPath() {
  if (process.env.STOCKSENSE_DB_PATH) {
    return path.resolve(process.env.STOCKSENSE_DB_PATH);
  }

  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), 'stocksense-db.json');
  }

  return path.join(process.cwd(), 'data', 'stocksense-db.json');
}

function nowIso() {
  return new Date().toISOString();
}

async function createSeedDb(): Promise<StockSenseDb> {
  const timestamp = nowIso();
  const adminEmail = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || 'StockSense Admin';
  const adminMobile = process.env.ADMIN_MOBILE || '0000000000';

  return {
    version: 1,
    users: [
      {
        id: crypto.randomUUID(),
        name: adminName,
        mobile: adminMobile,
        email: adminEmail,
        passwordHash: hashPassword(adminPassword),
        role: 'admin',
        status: 'pro',
        proActiveDates: [],
        authProvider: 'password',
        disclaimerAcceptedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    plans: DEFAULT_PLANS,
    paymentRequests: [],
    settings: {
      upiId: process.env.UPI_ID || '',
      qrImageUrl: process.env.UPI_QR_IMAGE_URL || '',
      paymentInstructions: 'Pay using the configured UPI ID or QR code, then submit your UTR/transaction ID for admin verification.',
      updatedAt: timestamp,
    },
    predictionLogs: [],
    paperAccounts: [],
    watchlists: [],
    updatedAt: timestamp,
  };
}

async function ensureDbFile() {
  const dbPath = getDbPath();
  try {
    await fs.access(dbPath);
  } catch {
    const db = await createSeedDb();
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8');
  }
}

function hydrateDb(raw: StockSenseDb): StockSenseDb {
  return {
    ...raw,
    plans: raw.plans?.length ? raw.plans : DEFAULT_PLANS,
    paymentRequests: raw.paymentRequests || [],
    predictionLogs: raw.predictionLogs || [],
    paperAccounts: raw.paperAccounts || [],
    watchlists: raw.watchlists || [],
    settings: raw.settings || {
      upiId: '',
      qrImageUrl: '',
      paymentInstructions: 'Pay using the configured UPI ID or QR code, then submit your UTR/transaction ID for admin verification.',
      updatedAt: nowIso(),
    },
  };
}

export async function readDb(): Promise<StockSenseDb> {
  const remoteConfig = getRemoteDbConfig();
  if (remoteConfig) {
    return readRemoteDb(remoteConfig);
  }

  await ensureDbFile();
  const dbPath = getDbPath();
  const raw = await fs.readFile(dbPath, 'utf8');
  return hydrateDb(JSON.parse(raw) as StockSenseDb);
}

export async function updateDb<T>(mutator: (db: StockSenseDb) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const db = await readDb();
    const result = await mutator(db);
    db.updatedAt = nowIso();
    const remoteConfig = getRemoteDbConfig();
    if (remoteConfig) {
      await writeRemoteDb(remoteConfig, db);
    } else {
      await fs.mkdir(path.dirname(getDbPath()), { recursive: true });
      await fs.writeFile(getDbPath(), JSON.stringify(db, null, 2), 'utf8');
    }
    return result;
  };

  const next = writeQueue.then(run, run);
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

export function publicPlan(plan: SubscriptionPlan): SubscriptionPlan {
  return { ...plan };
}
