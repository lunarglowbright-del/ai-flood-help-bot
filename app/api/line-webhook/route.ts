import { LineBotClient, validateSignature } from "@line/bot-sdk";
import { DEFAULT_REPLY, askGemini } from "@/lib/gemini";
import { findNearestServices, formatNearbyServices } from "@/lib/locations";
import { getFaqCsv } from "@/lib/sheet";

export const runtime = "nodejs";
export const maxDuration = 30;

const HANDLER_DEADLINE_MS = 10_000;
const REPLY_RESERVE_MS = 1_000;
const LOCATION_REQUEST_REPLY =
  "กรุณาแชร์ตำแหน่งปัจจุบันผ่าน LINE โดยแตะ + แล้วเลือก Location ครับ ผมจะค้นหาจุดใกล้ที่สุดแยกตามประเภทให้ โดยระยะทางเป็นระยะเส้นตรง ไม่ใช่ระยะตามถนนครับ";

let lineClient: LineBotClient | null = null;

type LineTextMessageEvent = {
  replyToken: string;
  messageType: "text";
  text: string;
};

type LineLocationMessageEvent = {
  replyToken: string;
  messageType: "location";
  latitude: number;
  longitude: number;
};

type LineMessageEvent = LineTextMessageEvent | LineLocationMessageEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorDetails(error: unknown): { message: string; status: number | null } {
  if (error instanceof Error) {
    const status =
      "status" in error && typeof error.status === "number"
        ? error.status
        : "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : null;
    return { message: error.message, status };
  }

  return { message: String(error), status: null };
}

function jsonResponse(body: { ok: boolean }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function getMessageEvent(value: unknown): LineMessageEvent | null {
  if (!isRecord(value) || value.type !== "message" || !isRecord(value.message)) {
    return null;
  }

  if (typeof value.replyToken !== "string" || !value.replyToken) {
    return null;
  }

  if (value.message.type === "text" && typeof value.message.text === "string") {
    return {
      replyToken: value.replyToken,
      messageType: "text",
      text: value.message.text
    };
  }

  if (
    value.message.type === "location" &&
    typeof value.message.latitude === "number" &&
    Number.isFinite(value.message.latitude) &&
    value.message.latitude >= -90 &&
    value.message.latitude <= 90 &&
    typeof value.message.longitude === "number" &&
    Number.isFinite(value.message.longitude) &&
    value.message.longitude >= -180 &&
    value.message.longitude <= 180
  ) {
    return {
      replyToken: value.replyToken,
      messageType: "location",
      latitude: value.message.latitude,
      longitude: value.message.longitude
    };
  }

  return null;
}

function isUrgentRequest(text: string): boolean {
  return /(ช่วยด้วย|ช่วยฉัน|ฉุกเฉิน|ด่วน|อันตราย|ติดอยู่|จมน้ำ|หนีน้ำ|น้ำกำลังเข้าบ้าน)/i.test(
    text
  );
}

function isNearbyRequest(text: string): boolean {
  return /(ใกล้|แถวนี้|บริเวณนี้|พิกัด|location|โลเคชัน)/i.test(text);
}

async function replySafely(replyToken: string, text: string): Promise<void> {
  try {
    if (!lineClient) {
      const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (!channelAccessToken) {
        throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
      }

      lineClient = LineBotClient.fromChannelAccessToken({ channelAccessToken });
    }

    await lineClient.replyMessage({
      replyToken,
      messages: [{ type: "text", text }]
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "line_reply_error",
        ...errorDetails(error)
      })
    );
  }
}

async function createReply(text: string, deadline: number): Promise<string> {
  try {
    const sheetTimeout = Math.max(
      0,
      Math.min(3_000, deadline - Date.now() - REPLY_RESERVE_MS)
    );
    const faqCsv = await getFaqCsv(sheetTimeout);
    const geminiTimeout = Math.max(
      0,
      Math.min(8_000, deadline - Date.now() - REPLY_RESERVE_MS)
    );

    if (geminiTimeout === 0) {
      console.error(JSON.stringify({ event: "webhook_deadline_exceeded", phase: "gemini" }));
      return DEFAULT_REPLY;
    }

    return await askGemini(faqCsv, text, geminiTimeout);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "webhook_processing_error",
        ...errorDetails(error)
      })
    );
    return DEFAULT_REPLY;
  }
}

async function createNearbyReply(
  latitude: number,
  longitude: number,
  deadline: number
): Promise<string> {
  try {
    const sheetTimeout = Math.max(
      0,
      Math.min(3_000, deadline - Date.now() - REPLY_RESERVE_MS)
    );
    if (sheetTimeout === 0) {
      throw new Error("Webhook deadline exceeded before fetching the service directory");
    }

    const csv = await getFaqCsv(sheetTimeout);
    const result = findNearestServices(csv, latitude, longitude);
    console.log(
      JSON.stringify({
        event: "nearby_search",
        resultCount: result.services.length,
        skippedCoordinateRows: result.skippedCoordinateRows
      })
    );

    if (result.services.length === 0) {
      return DEFAULT_REPLY;
    }

    return formatNearbyServices(result.services);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "nearby_search_error",
        ...errorDetails(error)
      })
    );
    return DEFAULT_REPLY;
  }
}

export async function POST(request: Request): Promise<Response> {
  let signatureValidated = false;
  let pendingReplyToken: string | null = null;

  try {
    const body = await request.text();
    const signature = request.headers.get("x-line-signature");
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    let validSignature = false;
    if (signature && channelSecret) {
      try {
        validSignature = validateSignature(body, channelSecret, signature);
      } catch {
        validSignature = false;
      }
    }

    if (!validSignature) {
      return jsonResponse({ ok: false }, 401);
    }
    signatureValidated = true;

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "webhook_invalid_json",
          ...errorDetails(error)
        })
      );
      return jsonResponse({ ok: true });
    }

    const events =
      isRecord(payload) && Array.isArray(payload.events) ? payload.events : [];
    const deadline = Date.now() + HANDLER_DEADLINE_MS;

    for (const event of events) {
      const messageEvent = getMessageEvent(event);
      if (!messageEvent) {
        continue;
      }

      pendingReplyToken = messageEvent.replyToken;
      let reply: string;
      if (messageEvent.messageType === "location") {
        reply = await createNearbyReply(
          messageEvent.latitude,
          messageEvent.longitude,
          deadline
        );
      } else if (isUrgentRequest(messageEvent.text)) {
        reply = DEFAULT_REPLY;
      } else if (isNearbyRequest(messageEvent.text)) {
        reply = LOCATION_REQUEST_REPLY;
      } else {
        reply = await createReply(messageEvent.text, deadline);
      }

      await replySafely(messageEvent.replyToken, reply);
      pendingReplyToken = null;
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "webhook_unexpected_error",
        ...errorDetails(error)
      })
    );

    if (signatureValidated && pendingReplyToken) {
      await replySafely(pendingReplyToken, DEFAULT_REPLY);
    }

    return jsonResponse({ ok: true });
  }
}
