route-service

세 프로젝트(on-time-route-ui, hackathon-route-data-layer, Newbiethon33)와
REALTIME_DEADLINE_ROUTING_ALGORITHM.md(DARTS)를 하나로 합친 서비스입니다.

배포 주소: https://route-service-fixed.vercel.app

이 서비스는 단순히 이동시간이 가장 짧은 경로를 고르는 대신, 사용자가 입력한 도착 마감시간 안에
도착할 확률을 계산합니다. 현재 위치, 대중교통·자동차 경로, 사용자 이동 조건을 종합해 후보를
비교하고, 이동 중 더 안전한 경로가 발견되면 다음 행동을 다시 제안합니다.

주요 기능

목적지와 도착 마감시간 입력 및 브라우저 현재 위치 확인

Kakao Local을 이용한 목적지 검색

Tmap 대중교통과 Kakao Mobility 자동차 경로를 동시에 조회해 최대 4개 후보 구성

후보별 예상 도착시각, 정시 도착 확률, 비용, 환승 횟수, 도보 거리 비교

DARTS 기반 위험도(SAFE, CAUTION, DANGER, LATE) 및 추천 경로 계산

Kakao Maps에 선택한 경로, 현재 위치, 목적지 표시

GPS 변화에 따른 현재 위치 마커 이동과 조건부 경로 재평가

비용·도보 거리·택시 허용 여부를 반영한 사용자 맞춤 추천

API 키 또는 외부 API 호출에 문제가 있을 때 Mock 데이터로 자동 전환

버튼 한 번으로 교통체증과 추천 경로 변경 과정을 확인하는 데모 시나리오

서비스 동작 흐름

flowchart TD
    A["목적지·마감시간 입력"] --> B["브라우저 GPS로 출발 좌표 확인"]
    B --> C["Kakao Local로 목적지 좌표 검색"]
    C --> D["POST /api/evaluate"]
    D --> E["Tmap 대중교통 + Kakao 자동차 후보 조회"]
    E --> F["RawRoute를 DARTS 정책으로 변환"]
    F --> G["500회 시뮬레이션 및 위험도 계산"]
    G --> H["추천 경로·다음 행동·대안 생성"]
    H --> I["현황판·지도·경로 비교 UI 갱신"]
    I --> J{"150m 이상 이동하고 3분 이상 경과?"}
    J -- 예 --> D
    J -- 아니요 --> K["지도 위치 마커만 즉시 이동"]

GPS 좌표는 watchPosition으로 계속 수신하므로 지도 위 현재 위치 마커는 좌표가 들어올 때마다
움직입니다. 다만 유료 API 호출량을 줄이기 위해 서버 경로 재평가는 마지막 평가 후 3분 이상
경과하고 150m 이상 이동한 경우에만 실행합니다.

구성

src/components, src/hooks/use-trip-demo.ts, src/types/trip.ts — UI (구 on-time-route-ui)

src/lib/routes, src/lib/location, src/lib/places, src/app/api/routes, src/app/api/places — 위치·경로 데이터 레이어 (구 hackathon-route-data-layer)

src/lib/algorithm/* — DARTS 알고리즘 구현 (신규, REALTIME_DEADLINE_ROUTING_ALGORITHM.md 기반)

src/app/api/evaluate — 후보 경로 조회 + DARTS 평가를 합친 서버 API

src/services/trip-service.ts — ApiTripService가 위 API를 호출해 UI가 쓰는 TripSnapshot으로 변환

코드 기능 설명

1. 화면과 사용자 입력

파일

기능

src/app/page.tsx

앱 진입점으로 AppShell을 렌더링합니다.

src/components/app-shell.tsx

검색 전에는 랜딩 화면, 검색 후에는 이동 현황 화면을 보여줍니다.

src/components/destination-form.tsx

목적지·마감시간을 검증하고 현재 위치 권한을 요청합니다.

src/components/trip-dashboard.tsx

상태, 알림, 추천 행동, 지도, 후보 경로, 이동 조건을 한 화면에 조합합니다.

src/components/trip-status-card.tsx

현재시각, 마감시간, 예상 도착, 남은 시간과 정시 도착 확률을 표시합니다.

src/components/route-comparison.tsx

후보 경로를 카드 형태로 비교하고 지도에 표시할 경로를 선택합니다.

src/components/user-preference-panel.tsx

최대 추가비용, 도보 거리, 뛰기 가능 여부, 택시 허용 여부를 입력받습니다.

src/components/map/RouteMap.tsx

Kakao Maps 경로선과 위치 마커를 표시하며, 지도 키가 없으면 SVG 경로 도식으로 대체합니다.

2. 위치 추적과 상태 관리

src/hooks/use-trip-demo.ts가 클라이언트의 이동 상태를 총괄합니다.

길찾기 시작 시 tripService.startTrip()으로 최초 경로를 평가합니다.

이동이 시작되면 watchCurrentPosition()으로 GPS를 계속 구독합니다.

새 좌표는 즉시 livePosition에 저장돼 지도 마커를 움직입니다.

150m 이동 및 3분 경과 조건을 모두 만족하면 /api/evaluate를 다시 호출합니다.

재평가 결과에 따라 추천 경로, 정시 도착 확률, 위험도, 알림을 갱신합니다.

위치 추적이나 자동 갱신이 일시적으로 실패하면 마지막 위치와 경로를 유지하고 다음 위치 변화 때
다시 시도합니다.

src/services/trip-service.ts의 ApiTripService는 UI와 서버 API 사이의 어댑터입니다. 목적지 문자열을
좌표로 변환하고, 트립별 출발지·목적지·마감시간·선호도·경로 전환 이력을 메모리에 보관합니다. 서버의
TripEvaluation은 UI가 바로 표시할 수 있는 TripSnapshot으로 변환됩니다. 이동 조건만 변경한 경우에는
직전에 받은 RawRoute를 재사용해 외부 경로 API를 추가 호출하지 않습니다.

3. 장소와 경로 데이터

모듈

역할

src/lib/location/geolocation.ts

navigator.geolocation을 이용한 1회 위치 조회와 연속 위치 추적을 제공합니다.

src/lib/places/kakao.ts

Kakao Local 키워드 검색 결과를 공통 PlaceResult 형식으로 변환합니다.

src/lib/routes/providers/tmap.ts

Tmap 대중교통 응답을 도보·버스·지하철 구간과 지도용 polyline으로 변환합니다.

src/lib/routes/providers/kakao-mobility.ts

Kakao 자동차 길찾기 결과에서 시간, 거리, 택시비, 도로명, polyline을 추출합니다.

src/lib/routes/service.ts

두 provider를 병렬 호출해 최대 4개 후보를 구성합니다. 대중교통이 3개 이상이면 대중교통 3개와 자동차 1개를 우선 사용합니다.

src/lib/routes/mock.ts

정상/정체 상황의 재현 가능한 대중교통·자동차 후보를 생성합니다.

ROUTE_DATA_MODE에 따른 동작은 다음과 같습니다.

값

동작

auto

실제 API를 먼저 호출하고, 사용할 수 있는 후보가 하나도 없으면 Mock으로 전환합니다. 기본값입니다.

live

실제 API 결과만 사용하며 모든 provider가 실패하면 오류를 반환합니다.

demo

외부 경로 API를 호출하지 않고 항상 Mock 시나리오를 사용합니다.

두 실제 provider 중 하나만 실패하면 성공한 provider의 경로는 그대로 사용하고, 실패 원인은 warnings에
담습니다. 두 provider에서 후보를 하나도 얻지 못한 경우에만 auto 모드가 전체 Mock 경로로 전환됩니다.

4. DARTS 평가 과정

src/lib/algorithm/evaluateTrip.ts가 알고리즘의 단일 진입점이며 다음 순서로 동작합니다.

정책 생성 — policyBuilder.ts가 RawRoute를 구간별 RoutePolicy로 변환하고 같은 노선 조합의
중복 후보 중 더 빠른 경로만 남깁니다.

불확실성 모델링 — distribution.ts가 교통수단별 변동성과 데이터 신선도에 따라 각 구간의
P10·P50·P90 시간 분포와 신뢰도를 만듭니다.

확률 시뮬레이션 — simulate.ts가 정책마다 500회 몬테카를로 시뮬레이션을 수행합니다. 버스,
자동차, 택시는 같은 정체 영향을 받도록 공유 정체 변수를 사용하며 승차·환승 실패 가능성도 반영합니다.

위험도 계산 — risk.ts가 정시 도착 확률, P90 여유시간, 예측 신뢰도를 이용해 위험도를 나눕니다.

정책 선택 — selectPolicy.ts가 비용·도보 거리·택시 허용 여부를 하드 제약으로 적용한 뒤,
목표 확률을 만족하는 후보를 P90 도착시각 → 비용 → 환승 → 도보 순으로 비교합니다.

전환 안정화 — 추천이 자주 뒤집히지 않도록 확률 및 시간 개선 폭, 연속 확인 횟수, 45초 쿨다운을
검사합니다. 현재 경로의 정시 도착 확률이 50% 미만이면 즉시 전환할 수 있습니다.

행동 생성 — actionComposer.ts가 KEEP, SWITCH, PREPARE_TAXI 중 다음 행동과 이유,
실행 기준 시각, fallback 경로를 만듭니다.

위험도 판정 기준은 다음과 같습니다.

위험도

기준

SAFE

정시 확률 90% 이상, P90 기준 5분 이상 여유, 신뢰도 0.7 이상

CAUTION

정시 확률 75% 이상이며 P90 기준 마감시간 이내

DANGER

정시 확률 40% 이상

LATE

정시 확률 40% 미만

알고리즘이 제안하는 재평가 주기는 SAFE 45초, CAUTION 30초, DANGER·LATE 10초입니다. 현재
MVP의 실제 외부 API 재호출은 비용 절약을 위한 클라이언트 조건(3분 및 150m)을 따르므로 이 값은 추천
행동의 다음 확인 시각을 계산하는 데 사용됩니다.

5. API

Method

경로

설명

GET

/api/places?keyword=서울역&lat=37.5&lng=127.0

목적지 후보를 검색합니다.

GET

/api/routes?originLat=...&originLng=...&destinationLat=...&destinationLng=...

가공 전 경로 후보와 provider 정보를 반환합니다.

POST

/api/evaluate

경로 후보 조회부터 DARTS 평가까지 한 번에 수행합니다. UI가 사용하는 핵심 API입니다.

POST /api/evaluate 요청 예시:

{
  "origin": { "lat": 37.586, "lng": 127.029 },
  "destination": { "lat": 37.555, "lng": 126.970 },
  "deadline": 1789192800000,
  "preferences": {
    "maxExtraCost": 10000,
    "walkingDistanceMeters": 800,
    "canRun": false,
    "allowTaxi": true
  },
  "history": { "candidateStreak": 0 }
}

응답에는 원본 routes, 각 정책의 확률·위험도, recommendedPolicyId, 경로 전환 여부,
추천 행동, 데이터 출처(live 또는 mock), provider 경고가 포함됩니다. 모든 API 응답은
Cache-Control: no-store로 반환됩니다.

실행 방법

npm install
cp .env.example .env.local   # Windows: Copy-Item .env.example .env.local
npm run dev

http://localhost:3000 접속. API 키가 없어도 그대로 동작합니다 — lib/routes/service.ts가
Kakao/Tmap 호출 실패를 자동으로 감지해 Mock 경로 데이터로 전환하고, DARTS 평가 코드는 실제 데이터와
동일한 방식으로 그 Mock 데이터를 평가합니다.

데모에서 검색 가능한 목적지(Mock 장소 DB): 서울역, 고려대학교, 강남역, 서울시청.

API 키가 준비되면

.env.local에 아래 값을 채우고 개발 서버를 재시작하면 실제 데이터로 자동 전환됩니다. 코드 변경은
필요 없습니다.

NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY=
KAKAO_REST_API_KEY=
TMAP_API_KEY=

TMAP_API_KEY는 openapi.sk.com에서 앱 생성 후 "대중교통" 상품을 등록하면
appKey로 발급됩니다. HTTP 헤더(appKey) 인증이라 Kakao Local과 마찬가지로 서버 발신 IP 제약이 없습니다.

알고리즘 모듈 (src/lib/algorithm)

파일

역할 (문서 섹션)

distribution.ts

신선도/신뢰도 계산, 모드별 경험적 TimeDistribution 합성 (§5-A)

policyBuilder.ts

RawRoute → RoutePolicy 변환, 중복 후보 제거, 정책 단위 fallback 지정 (§5-C)

simulate.ts

정책별 500회 몬테카를로 시뮬레이션, 공유 정체 변수 적용 (§5-E)

risk.ts

calculateRiskLevel (§6)

selectPolicy.ts

하드 제약, 확률 목표, 사전식 비교, 전환 히스테리시스 (§5-G, §5-H)

actionComposer.ts

다음 행동/이유/실행 시각/fallback 생성 (§5-I)

replanScheduler.ts

위험도별 재평가 주기 (§7)

evaluateTrip.ts

위 모듈을 묶는 단일 진입점 (§8 runDarts의 API 버전)

알려진 MVP 단순화

사용자별 도보 속도 학습(§5-B), 실제 이동편 단위 fallback(§4 FallbackBranch)은 정책 단위 fallback으로 단순화했습니다.

전환 확인 횟수·쿨다운(§5-H)은 브라우저의 ApiTripService 메모리에 저장되며, 페이지를 새로고침하면 초기화됩니다(DB 없음).

Tmap 대중교통 API 무료 티어는 일 10건 호출 제한이 있습니다(SK Open API "대중교통" 상품 기준). 한도를 넘으면 Mock으로 자동 전환됩니다.

canRun 값은 UI와 데이터 타입에는 포함되지만 현재 경로 provider가 RUN 구간을 생성하지 않아 실제 추천 결과에는 반영되지 않습니다.

Tmap 대중교통 응답은 현재 조회 시점의 경로 후보이며 코드상 isRealtime: false로 처리합니다. Kakao 자동차 경로만 isRealtime: true로 표시됩니다.

제공자 응답을 모의한 회귀 테스트와 React/jsdom 상호작용 테스트를 사용합니다. TMAP 헤더·좌표·단위·다양한 수단, 중간 달리기, 도보 전용 경로, 오류 코드, GPS 이동·재탐색·오래된 응답 무시, 지도 유지와 마커 보간을 확인합니다. 실제 TMAP appKey가 없어 계정 권한과 실제 경로 응답은 검증하지 못했습니다. 실제 휴대폰 GPS와 브라우저 시각 검증은 별도입니다.

공식 명세: [TMAP 상세 대중교통](https://transit.tmapmobility.com/docs/routes), [대중교통 appKey 헤더](https://tmap-public-skopenapi.readme.io/reference/대중교통-api), [TMAP 보행자 경로안내](https://tmap-skopenapi.readme.io/reference/보행자-경로안내).
