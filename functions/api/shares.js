
const MAX_BYTES = 100_000;

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function validTrip(trip) {
  return trip &&
    typeof trip === "object" &&
    !Array.isArray(trip) &&
    typeof trip.destination === "string" &&
    trip.destination.length > 0 &&
    trip.itineraries &&
    typeof trip.itineraries === "object" &&
    !Array.isArray(trip.itineraries);
}

export async function onRequestPost({ request, env }) {
  if (!env.TRIP_SHARES) {
    return respond({ error: "KV 尚未綁定" }, 503);
  }

  const origin = request.headers.get("Origin");

  if (origin && origin !== new URL(request.url).origin) {
    return respond({ error: "不允許跨網站建立分享" }, 403);
  }

  const length = Number(
    request.headers.get("Content-Length") || 0
  );

  if (length > MAX_BYTES) {
    return respond({ error: "行程資料超過 100 KB" }, 413);
  }

  let text;

  try {
    text = await request.text();

    if (new TextEncoder().encode(text).length > MAX_BYTES) {
      return respond({ error: "行程資料超過 100 KB" }, 413);
    }
  } catch {
    return respond({ error: "無法讀取資料" }, 400);
  }

  let trip;

  try {
    trip = JSON.parse(text);
  } catch {
    return respond({ error: "JSON 格式錯誤" }, 400);
  }

  if (!validTrip(trip)) {
    return respond({ error: "行程資料不完整" }, 400);
  }

  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);

  const id = Array.from(bytes, b =>
    b.toString(16).padStart(2, "0")
  ).join("");

  try {
    await env.TRIP_SHARES.put(
      "trip:" + id,
      text
    );
  } catch {
    return respond({ error: "儲存分享行程失敗" }, 500);
  }

  return respond({
    id,
    url: new URL(request.url).origin + "/#s=" + id,
    expiresInDays: null
  }, 201);
}

export async function onRequestGet({ request, env }) {
  if (!env.TRIP_SHARES) {
    return respond({ error: "KV 尚未綁定" }, 503);
  }

  const id = new URL(request.url).searchParams.get("id") || "";

  if (!/^[a-f0-9]{24}$/.test(id)) {
    return respond({ error: "分享代碼格式錯誤" }, 400);
  }

  try {
    const text = await env.TRIP_SHARES.get("trip:" + id);

    if (!text) {
      return respond({
        error: "分享不存在或已被刪除"
      }, 404);
    }

    return new Response(text, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return respond({ error: "讀取分享行程失敗" }, 500);
  }
}
