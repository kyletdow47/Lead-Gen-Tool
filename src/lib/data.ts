import { promises as fs } from "fs";
import path from "path";
import type { Contact, DealStatus, DailyData, PipelineRunMeta, Brain, BrainInsight, ChatMessage } from "./types";

// ── Storage backend ─────────────────────────────────────────
// Vercel Blob for production (persistent), local filesystem for dev
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const DATA_DIR = path.join(process.cwd(), "data");
const SEED_DIR = path.join(process.cwd(), "public", "memory");

// Blob path keys (used on Vercel) / file path fallbacks (used locally)
export const LATEST_FILE = "latest.json";
export const RATINGS_FILE = "ratings.json";
export const PHONES_LOG = "phone_reveals.json";
export const IMPORT_QUEUE_FILE = "import_queue.json";
export const STATUSES_FILE = "statuses.json";
export const MARKET_CACHE_FILE = "market_cache.json";
export const MEMORY_FILE = "memory.json";
export const GRANOLA_CACHE_FILE = "granola_cache.json";
export const CONTACTS_FILE = "contacts.json";
export const RUNS_INDEX_FILE = "runs_index.json";
export const LEAD_POOL_FILE = "lead_pool.json";
export const HUBSPOT_CACHE_FILE = "hubspot_cache.json";

// Legacy exports for compatibility
export const DATA_DIR_PATH = DATA_DIR;
export const RUNS_DIR = path.join(DATA_DIR, "runs");
export { DATA_DIR };

// ── Core read/write (Blob on Vercel, filesystem locally) ────

export async function ensureDir() {
  if (!USE_BLOB) {
    try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
  }
}

export async function readJSON(key: string): Promise<any> {
  if (USE_BLOB) {
    return blobRead(key);
  }
  // Local: resolve against DATA_DIR if not absolute
  const filePath = path.isAbsolute(key) ? key : path.join(DATA_DIR, key);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeJSON(key: string, data: any) {
  if (USE_BLOB) {
    return blobWrite(key, data);
  }
  // Local: resolve against DATA_DIR if not absolute
  await ensureDir();
  const filePath = path.isAbsolute(key) ? key : path.join(DATA_DIR, key);
  const dir = path.dirname(filePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export function datedFile(prefix: string, date: string, ext: string = "json") {
  return `${prefix}_${date}.${ext}`;
}

// ── Vercel Blob helpers ─────────────────────────────────────

// Cache blob URLs so reads don't need list() API calls
const blobUrlCache = new Map<string, string>();

async function blobWrite(key: string, data: any): Promise<boolean> {
  try {
    const { put } = await import("@vercel/blob");
    const json = JSON.stringify(data, null, 2);
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const blob = await put(key, json, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      ...(token ? { token } : {}),
    });
    // Cache the URL for immediate reads
    blobUrlCache.set(key, blob.url);
    console.log(`[BLOB] write ${key} OK (${json.length} bytes) → ${blob.url}`);
    return true;
  } catch (err: any) {
    console.error(`[BLOB] write ${key} FAILED: ${err.message}`);
    return false;
  }
}

async function blobRead(key: string): Promise<any> {
  try {
    // Try cached URL first (fastest — direct fetch, no list() call)
    const cachedUrl = blobUrlCache.get(key);
    if (cachedUrl) {
      try {
        const res = await fetch(cachedUrl, {});
        if (res.ok) {
          console.log(`[BLOB] read ${key} → cache hit`);
          return res.json();
        }
      } catch {}
      blobUrlCache.delete(key);
    }

    // Fall back to list() with exact match
    const { list } = await import("@vercel/blob");
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const { blobs } = await list({ prefix: key, limit: 5, ...(token ? { token } : {}) });
    const match = blobs.find((b) => b.pathname === key);
    if (match) {
      blobUrlCache.set(key, match.url);
      const res = await fetch(match.url, {});
      if (res.ok) {
        console.log(`[BLOB] read ${key} → list hit`);
        return res.json();
      }
    }

    console.log(`[BLOB] read ${key} → miss`);
    return null;
  } catch (err: any) {
    console.error(`[BLOB] read ${key} FAILED: ${err.message}`);
    return null;
  }
}

// ── Seed helper — loads from public/memory/ on first access ──

async function readWithSeed(key: string, seedFile: string): Promise<any> {
  let data = await readJSON(key);
  if (data !== null) return data;

  // First access — try seeding from bundled file
  const seedPath = path.join(SEED_DIR, seedFile);
  try {
    const raw = await fs.readFile(seedPath, "utf-8");
    data = JSON.parse(raw);
    if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
      await writeJSON(key, data);
    }
    return data;
  } catch {
    return Array.isArray(data) ? [] : {};
  }
}

// ── Contacts collection ────────────────────────────────────

export async function loadContacts(): Promise<Record<string, Contact>> {
  return (await readWithSeed(CONTACTS_FILE, "contacts.json")) || {};
}

export async function saveContacts(contacts: Record<string, Contact>) {
  await writeJSON(CONTACTS_FILE, contacts);
}

export async function upsertContact(contact: Contact) {
  const contacts = await loadContacts();
  const existing = contacts[contact.id];
  if (existing) {
    contacts[contact.id] = {
      ...existing,
      ...contact,
      status: existing.status,
      notes: existing.notes || contact.notes,
      tags: Array.from(new Set([...(existing.tags || []), ...(contact.tags || [])])),
      dateAdded: existing.dateAdded,
      lastUpdated: new Date().toISOString(),
    };
  } else {
    contacts[contact.id] = contact;
  }
  await saveContacts(contacts);
}

export async function updateContactStatus(key: string, status: DealStatus, notes?: string | null) {
  const contacts = await loadContacts();
  if (contacts[key]) {
    contacts[key].status = status;
    contacts[key].lastUpdated = new Date().toISOString();
    if (notes !== undefined) contacts[key].notes = notes || null;
    await saveContacts(contacts);
  }
}

export async function getContactKeys(): Promise<Set<string>> {
  const contacts = await loadContacts();
  return new Set(Object.keys(contacts));
}

// ── Run history ─────────────────────────────────────────────

export async function saveRun(date: string, data: DailyData) {
  await writeJSON(`runs/${date}.json`, data);

  const index: PipelineRunMeta[] = (await loadRunsIndex());
  const meta: PipelineRunMeta = {
    date,
    dealCount: data.deals.length,
    hotCount: data.deals.filter((d) => d.priority === "hot").length,
    warmCount: data.deals.filter((d) => d.priority === "warm").length,
    kyleCount: data.deals.filter((d) => d.assignedTo === "kyle").length,
    gusCount: data.deals.filter((d) => d.assignedTo === "gus").length,
  };
  const existingIdx = index.findIndex((r) => r.date === date);
  if (existingIdx >= 0) index[existingIdx] = meta;
  else index.unshift(meta);
  await writeJSON(RUNS_INDEX_FILE, index);
}

export async function loadRunsIndex(): Promise<PipelineRunMeta[]> {
  return (await readWithSeed(RUNS_INDEX_FILE, "runs_index.json")) || [];
}

export async function loadRun(date: string): Promise<DailyData | null> {
  return readJSON(`runs/${date}.json`);
}

// ── Lead pool ───────────────────────────────────────────────

import type { LeadPoolEntry } from "./types";

export async function loadLeadPool(): Promise<LeadPoolEntry[]> {
  return (await readJSON(LEAD_POOL_FILE)) || [];
}

export async function saveLeadPool(pool: LeadPoolEntry[]) {
  await writeJSON(LEAD_POOL_FILE, pool);
}

// ── HubSpot cache ───────────────────────────────────────────

interface HubSpotCacheEntry {
  email: string | null;
  company: string;
  ownerId: string | null;
}

interface HubSpotCache {
  contacts: HubSpotCacheEntry[];
  fetchedAt: string;
}

export async function loadHubSpotCache(): Promise<HubSpotCache | null> {
  const cache = await readJSON(HUBSPOT_CACHE_FILE);
  if (!cache?.fetchedAt) return null;

  // Check if cache is less than 24h old
  const age = Date.now() - new Date(cache.fetchedAt).getTime();
  if (age > 24 * 60 * 60 * 1000) return null; // stale

  return cache;
}

export async function saveHubSpotCache(cache: HubSpotCache) {
  await writeJSON(HUBSPOT_CACHE_FILE, cache);
}

// ── Brain (intelligence chatbot knowledge base) ──────────────

export const BRAIN_FILE = "brain.json";
export const CHAT_HISTORY_FILE = "chat_history.json";

let brainIdCounter = 0;

function generateInsightId(): string {
  brainIdCounter++;
  return `ins_${Date.now()}_${brainIdCounter}`;
}

export async function loadBrain(): Promise<Brain> {
  const data = await readJSON(BRAIN_FILE);
  if (data && Array.isArray(data.insights)) return data as Brain;
  return { insights: [], lastUpdated: new Date().toISOString() };
}

export async function saveBrain(brain: Brain): Promise<void> {
  brain.lastUpdated = new Date().toISOString();
  await writeJSON(BRAIN_FILE, brain);
}

export async function appendInsight(insight: Omit<BrainInsight, "id">): Promise<BrainInsight> {
  const brain = await loadBrain();
  const full: BrainInsight = { id: generateInsightId(), ...insight };
  brain.insights.push(full);
  await saveBrain(brain);
  return full;
}

export async function updateInsight(id: string, updates: Partial<BrainInsight>): Promise<BrainInsight | null> {
  const brain = await loadBrain();
  const idx = brain.insights.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  brain.insights[idx] = { ...brain.insights[idx], ...updates, id }; // id is immutable
  await saveBrain(brain);
  return brain.insights[idx];
}

export async function deleteInsight(id: string): Promise<boolean> {
  const brain = await loadBrain();
  const before = brain.insights.length;
  brain.insights = brain.insights.filter((i) => i.id !== id);
  if (brain.insights.length === before) return false;
  await saveBrain(brain);
  return true;
}

export async function loadChatHistory(): Promise<ChatMessage[]> {
  const data = await readJSON(CHAT_HISTORY_FILE);
  if (Array.isArray(data)) return data;
  return [];
}

export async function saveChatHistory(messages: ChatMessage[]): Promise<void> {
  // Keep last 100 messages
  const trimmed = messages.slice(-100);
  await writeJSON(CHAT_HISTORY_FILE, trimmed);
}
