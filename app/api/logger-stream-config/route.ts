import { NextResponse } from "next/server";
import {
  buildLoggerStreamUrl,
  LoggerStreamConfigurationError,
} from "src/lib/logger-stream/url";

export const dynamic = "force-dynamic";

export function GET() {
  const url = process.env.DEFAULT_LOGGER_STREAM_URL ?? "";
  const headers = { "Cache-Control": "no-store" };
  try {
    buildLoggerStreamUrl(url, "configuration-check");
    return NextResponse.json({ url }, { headers });
  } catch (error) {
    const code =
      error instanceof LoggerStreamConfigurationError
        ? error.code
        : "invalidUrl";
    return NextResponse.json({ error: code }, { status: 503, headers });
  }
}
