import { NextRequest, NextResponse } from "next/server";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: string };
    const urlValue = body?.url?.trim();

    if (!urlValue) {
      return NextResponse.json(
        { error: "Missing API URL." },
        { status: 400 },
      );
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(urlValue);
    } catch {
      return NextResponse.json(
        { error: "Invalid API URL." },
        { status: 400 },
      );
    }

    if (!ALLOWED_PROTOCOLS.has(targetUrl.protocol)) {
      return NextResponse.json(
        { error: "Only HTTP and HTTPS URLs are supported." },
        { status: 400 },
      );
    }

    const upstreamResponse = await fetch(targetUrl.toString(), {
      headers: {
        Accept: "application/json, application/geo+json",
      },
      cache: "no-store",
    });

    const contentType =
      upstreamResponse.headers.get("content-type") ?? "application/json";
    const payload = await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      return new NextResponse(payload || "Upstream request failed.", {
        status: upstreamResponse.status,
        headers: {
          "content-type": contentType,
        },
      });
    }

    return new NextResponse(payload, {
      status: 200,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch API URL.",
      },
      { status: 500 },
    );
  }
}
