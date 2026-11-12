import { NextResponse } from "next/server";
import { LoggerHistoryRequestError } from "src/lib/logger-history";
import { requestLoggerHistory } from "src/lib/logger-history-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const history = await requestLoggerHistory(
      new URL(request.url).searchParams,
      {
        configuredUrl: process.env.DEFAULT_LOGGER_HISTORY_URL,
        signal: request.signal,
      },
    );
    return NextResponse.json(history, { headers });
  } catch (error) {
    const code =
      error instanceof LoggerHistoryRequestError ? error.code : "requestFailed";
    const status =
      code === "notConfigured"
        ? 503
        : code === "invalidRange" ||
            code === "invalidSampleLimit" ||
            code === "invalidInterval" ||
            code === "invalidDeviceId"
          ? 400
          : 502;
    return NextResponse.json({ error: code }, { status, headers });
  }
}
