/** 서버에서 확인한 제공자 오류를 API 응답까지 보존합니다. */
export class RouteSearchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details: string[] = [],
    public readonly status = 502,
  ) {
    super(message);
    this.name = "RouteSearchError";
  }
}

// 제공자가 요청 URL/인증값을 오류 메시지에 되돌려 주더라도 브라우저에 노출하지 않습니다.
export function safeProviderMessage(value: unknown): string {
  let message = typeof value === "string" ? value : "응답 오류";
  for (const key of [process.env.TMAP_APP_KEY, process.env.TMAP_WALK_APP_KEY, process.env.KAKAO_REST_API_KEY]) {
    if (!key) continue;
    for (const encoded of [key, encodeURIComponent(key), encodeURIComponent(key).replace(/%[0-9A-F]{2}/g, (part) => part.toLowerCase())]) {
      message = message.split(encoded).join("[비공개]");
    }
  }
  return message.replace(/https?:\/\/\S+/gi, "[요청 주소]")
    .replace(/(?:api[_-]?key|appkey|authorization|servicekey)\s*[=:]\s*\S+/gi, "인증값=[비공개]")
    .replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

export function tmapRouteError(rawCode: unknown, rawMessage: unknown, httpStatus = 502): RouteSearchError {
  const code = safeProviderMessage(String(rawCode ?? "UNKNOWN")).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "UNKNOWN";
  const message = safeProviderMessage(rawMessage);
  let help = "잠시 후 다시 시도해 주세요. 같은 오류가 반복되면 오류 내용을 복사해 주세요.";
  if (["11", "12", "13", "14", "NO_RESULTS"].includes(code)) {
    help = "출발 위치와 목적지 주소를 확인해 주세요. TMAP이 이 구간의 대중교통 경로를 반환하지 않았습니다. 가까운 목적지는 보행자 API 권한이 있으면 도보·달리기 경로도 조회합니다.";
  } else if (httpStatus === 429 || /quota|limit|초과|호출.*제한|한도/i.test(message)) {
    help = "SK open API의 해당 앱에서 대중교통 상품의 호출 한도와 이용 상태를 확인해 주세요.";
  } else if (httpStatus === 401 || httpStatus === 403 || /auth|app.?key|api.?key|인증|권한|구독|subscription/i.test(message)) {
    help = "SK open API에서 앱의 appKey와 대중교통 API 상품 사용 권한을 확인해 주세요. .env.local의 TMAP_APP_KEY를 수정했다면 서버를 재시작해 주세요.";
  } else if (code === "INVALID_RESPONSE") {
    help = "TMAP 응답에서 안내 가능한 경로를 읽지 못했습니다. 오류 내용을 복사해 주세요.";
  } else if (code === "NO_SERVICE") {
    help = "조회 시각에 운행 종료로 표시된 경로만 반환되었습니다. 다른 시각이나 출발 지점을 확인해 주세요.";
  }
  return new RouteSearchError("TMAP 대중교통 경로를 불러오지 못했습니다.", `TMAP_${code}`, [`TMAP 오류 (${code}): ${message}`, help], 502);
}
