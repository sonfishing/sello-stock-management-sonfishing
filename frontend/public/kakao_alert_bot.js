// ======================================================================
//  카카오톡 키워드 감지 → 서버 전송 봇 (메신저봇R용)
//  이 파일: https://item.sonfishing.co.kr/kakao_alert_bot.js
//
//  서버 설정: https://item.sonfishing.co.kr/kakao_alert 페이지의 "⚙️ 설정"
//             (방이름/키워드를 웹에서 변경, 봇에 최대 10분 내 반영)
//  서버 설정이 없거나 비어있으면 아래 로컬 기본값을 사용합니다.
//  채팅방에서 "..설정" 을 입력하면 현재 적용 중인 설정을 확인할 수 있습니다.
// ======================================================================
var bot = BotManager.getCurrentBot();

/* ============ 로컬 기본값 (서버 설정이 없을 때 사용) ============ */
var TARGET_ROOM  = "우리방이름";                  // 감시할 채팅방 이름 (정확히 일치)
var KEYWORDS     = ["공지", "긴급", "모집"];      // 검색할 단어
var API_URL      = "https://item.sonfishing.co.kr/api/kakao_alert";  // 메시지 전송
var CONFIG_URL   = "https://item.sonfishing.co.kr/api/kakao_config"; // 설정 조회
var CONFIG_TTL   = 10 * 60 * 1000;                // 설정 재조회 간격 (10분)
var LOCAL_BACKUP = true;                          // 단말에도 백업 저장
var NOTIFY       = false;                         // 감지 시 방에 알림 여부
/* ================================================================ */

var ROOT = (bot.getRootPath ? bot.getRootPath()
          : "/sdcard/메신저봇폴더/Bots/키워드저장");
if (ROOT.charAt(ROOT.length - 1) === "/") ROOT = ROOT.substring(0, ROOT.length - 1);
var LOG_FILE = ROOT + "/Data/matched.json";

(function () {
  var d = new java.io.File(ROOT + "/Data/");
  if (!d.exists()) d.mkdirs();
})();

var cfg = { room: "", keywords: [], fetchedAt: 0 };

function fetchConfig() {
  try {
    var res = org.jsoup.Jsoup.connect(CONFIG_URL)
      .ignoreContentType(true)
      .timeout(10000)
      .execute();
    var data = JSON.parse(res.body());
    if (data && data.success && data.data) {
      cfg = {
        room: String(data.data.room || "").trim(),
        keywords: (data.data.keywords instanceof Array ? data.data.keywords : [])
          .map(function (s) { return String(s).trim(); })
          .filter(function (s) { return s.length > 0; }),
        fetchedAt: Date.now()
      };
      Log.d("kakao_alert", "서버 설정 로드 - 방: [" + room() + "] 키워드: [" + keywords().join(", ") + "]");
      return;
    }
  } catch (e) {
    Log.e("kakao_alert", "설정 조회 실패: " + e);
  }
  cfg.fetchedAt = Date.now(); // 실패해도 곧바로 재요청하지 않도록
}

function ensureConfig() {
  if (Date.now() - cfg.fetchedAt > CONFIG_TTL) fetchConfig();
}

function room() { return cfg.room || TARGET_ROOM; }          // 서버 설정 우선
function keywords() { return cfg.keywords.length ? cfg.keywords : KEYWORDS; }

function now() {
  return new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date());
}

function matchKeyword(text) {
  var kws = keywords();
  for (var i = 0; i < kws.length; i++)
    if (text.indexOf(kws[i]) !== -1) return kws[i];
  return null;
}

function postToServer(payload) {                 // 실패해도 앱이 죽지 않도록 try/catch
  try {
    org.jsoup.Jsoup.connect(API_URL)
      .header("Content-Type", "application/json")
      .ignoreContentType(true)
      .timeout(10000)
      .requestBody(JSON.stringify(payload))
      .post();
    Log.d("kakao_alert", "서버 전송 완료");
  } catch (e) {
    Log.e("kakao_alert", "서버 전송 실패: " + e);
  }
}

function onMessage(msg) {
  ensureConfig();

  // 현재 적용 중인 설정 확인용
  if (msg.content === "..설정") {
    msg.reply("[현재 설정]"
      + "\n감시 방: " + room() + (cfg.room ? "" : " (스크립트 기본값)")
      + "\n키워드: " + keywords().join(", ") + (cfg.keywords.length ? "" : " (스크립트 기본값)")
      + "\n마지막 설정 조회: " + (cfg.fetchedAt
          ? new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date(cfg.fetchedAt))
          : "미조회"));
    return;
  }

  if (msg.room !== room()) return;               // 설정된 방만 처리
  if (!msg.content) return;                      // 이미지 등 빈 내용 제외

  var kw = matchKeyword(msg.content);
  if (kw === null) return;

  var payload = {
    room: msg.room,
    sender: msg.author.name,
    msg: msg.content,
    time: now(),
    keyword: kw
  };

  postToServer(payload);                         // 웹(kakao_alert 페이지)에 시간순 저장
  if (LOCAL_BACKUP) {
    try { FileStream.append(LOG_FILE, JSON.stringify(payload) + "\n"); } catch (e) {}
  }
  Log.d("kakao_alert", "[" + kw + "] " + msg.room + " / " + msg.author.name + " / " + msg.content);
  if (NOTIFY) msg.reply("[저장됨] 키워드 '" + kw + "' 감지");
}
bot.addListener(Event.MESSAGE, onMessage);
