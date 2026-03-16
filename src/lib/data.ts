import { promises as fs } from "fs";
import path from "path";

// Vercel serverless: /tmp/ is writable, process.cwd() is read-only
const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL ? "/tmp/flyfx-data" : path.join(process.cwd(), "data");

export const LATEST_FILE = path.join(DATA_DIR, "latest.json");
export const RATINGS_FILE = path.join(DATA_DIR, "ratings.json");
export const PHONES_LOG = path.join(DATA_DIR, "phone_reveals.json");
export const IMPORT_QUEUE_FILE = path.join(DATA_DIR, "import_queue.json");
export const STATUSES_FILE = path.join(DATA_DIR, "statuses.json");

export async function ensureDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {}
}

export async function readJSON(filePath: string): Promise<any> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeJSON(filePath: string, data: any) {
  await ensureDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export function datedFile(prefix: string, date: string, ext: string = "json") {
  return path.join(DATA_DIR, `${prefix}_${date}.${ext}`);
}
