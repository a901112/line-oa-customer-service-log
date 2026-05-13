import crypto from "crypto";

const LINE_API_BASE = "https://api.line.me";

export function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

async function lineFetch(path, options = {}) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
  }

  const response = await fetch(`${LINE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE API ${path} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function replyFixedMessage(replyToken) {
  if (!replyToken) {
    return;
  }

  await lineFetch("/v2/bot/message/reply", {
    method: "POST",
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: "text",
          text: "您好，我們已收到您的訊息，客服人員會盡快為您回覆。"
        }
      ]
    })
  });
}

export async function getDisplayName(source) {
  const userId = source?.userId;
  if (!userId) {
    return "";
  }

  try {
    let profile;

    if (source.type === "group" && source.groupId) {
      profile = await lineFetch(`/v2/bot/group/${source.groupId}/member/${userId}`);
    } else if (source.type === "room" && source.roomId) {
      profile = await lineFetch(`/v2/bot/room/${source.roomId}/member/${userId}`);
    } else {
      profile = await lineFetch(`/v2/bot/profile/${userId}`);
    }

    return profile?.displayName || "Unknown";
  } catch (error) {
    console.error("Failed to fetch LINE profile:", error);
    return "Unknown";
  }
}
