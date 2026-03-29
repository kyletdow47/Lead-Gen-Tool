import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

const SESSION_COOKIE = "flyfx_session";
const SESSION_SALT = "flyfx_deals_machine_v1";

function makeToken(secret: string): string {
  return createHash("sha256").update(`${secret}:${SESSION_SALT}`).digest("hex");
}

// POST /api/auth — validate password, set session cookie
export async function POST(req: NextRequest) {
  const APP_PASSWORD = process.env.APP_PASSWORD;

  if (!APP_PASSWORD) {
    return NextResponse.json({ error: "APP_PASSWORD env var not configured" }, { status: 500 });
  }

  const { password } = await req.json();

  if (!password || password !== APP_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = makeToken(APP_PASSWORD);
  const isProduction = process.env.NODE_ENV === "production";

  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: isProduction,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return res;
}

// GET /api/auth — check if current session cookie is valid
export async function GET(req: NextRequest) {
  const APP_PASSWORD = process.env.APP_PASSWORD;

  if (!APP_PASSWORD) {
    return NextResponse.json({ authed: false, error: "APP_PASSWORD not configured" });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = makeToken(APP_PASSWORD);

  return NextResponse.json({ authed: token === expected });
}

// DELETE /api/auth — clear session cookie (logout)
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
