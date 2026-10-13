// ======================================================================
//  카카오톡 키워드 감지 → 서버 전송 봇 (메신저봇R API1 방식)
//  이 파일: https://item.sonfishing.co.kr/kakao_alert_bot.js
//
//  서버 설정: https://item.sonfishing.co.kr/kakao_alert 페이지의 "⚙️ 설정"
//             (방이름 + 검색키워드 쌍을 여러 개 등록 가능, 최대 10분 내 반영)
//  채팅방 명령어:
//    ..설정     → 현재 적용 중인 규칙 확인
//    ..새로고침 → 서버 설정을 즉시 다시 받아 적용 (10분 주기와 무관)
//  서버 설정이 없으면 아래 로컬 기본값을 사용합니다.
// ======================================================================

var Jsoup = org.jsoup.Jsoup;

/* ============ 로컬 기본값 (서버 설정이 없을 때 사용) ============ */
var TARGET_ROOM  = "우리방이름";                  // 감시할 채팅방 이름 (정확히 일치)
var KEYWORDS     = ["공지", "긴급", "모집"];      // 검색할 단어
var API_URL      = "https://item.sonfishing.co.kr/api/kakao_alert";  // 메시지 전송
var CONFIG_URL   = "https://item.sonfishing.co.kr/api/kakao_config"; // 설정 조회
var CONFIG_TTL   = 10 * 60 * 1000;                // 설정 자동 재조회 간격 (10분)
var NOTIFY       = false;                         // 감지 시 방에 알림 여부
/* ================================================================ */

var cfg = { rules: [], fetchedAt: 0 };
// rules: [{ room: "방이름", keywords: ["키워드", ...] }, ...]

function now() {
  return new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date());
}

function fmtTime(ms) {
  return new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date(ms));
}

function fetchConfig() {
  try {
    var res = Jsoup.connect(CONFIG_URL)
      .ignoreContentType(true)
      .timeout(10000)
      .execute();
    var data = JSON.parse(res.body());
    if (data && data.success && data.data) {
      var d = data.data;
      var rules = [];
      if (d.rules instanceof Array) {
        for (var i = 0; i < d.rules.length; i++) {
          var r = d.rules[i] || {};
          var kws = [];
          var rk = (r.keywords instanceof Array ? r.keywords : []);
          for (var j = 0; j < rk.length; j++) {
            var k = String(rk[j]).trim();
            if (k.length > 0) kws.push(k);
          }
          rules.push({ room: String(r.room || "").trim(), keywords: kws });
        }
      } else if (typeof d.room === "string" || d.keywords instanceof Array) {
        // 이전 단일 설정 형식 대비
        var old = [];
        var ok = (d.keywords instanceof Array ? d.keywords : []);
        for (var m = 0; m < ok.length; m++) {
          var s = String(ok[m]).trim();
          if (s.length > 0) old.push(s);
        }
        rules.push({ room: String(d.room || "").trim(), keywords: old });
      }
      cfg = { rules: rules, fetchedAt: Date.now() };
      return;
    }
    cfg.fetchedAt = Date.now();
  } catch (e) {
    Log.error("kakao_alert 설정 조회 실패: " + e);
    cfg.fetchedAt = Date.now(); // 실패해도 TTL 내 무한 재시도 방지
  }
}

function ensureConfig() {
  if (Date.now() - cfg.fetchedAt <= CONFIG_TTL) return;
  cfg.fetchedAt = Date.now(); // 완료 전 중복 조회 방지
  new java.lang.Thread(function () { fetchConfig(); }).start();
}

// 이 방에 적용할 키워드 목록 반환 (없으면 빈 배열 = 감시 안함)
function keywordsForRoom(name) {
  if (!cfg.rules.length) {              // 서버 설정 없음 → 로컬 기본값
    return name === TARGET_ROOM ? KEYWORDS : [];
  }
  var hit = [], matched = false;
  for (var i = 0; i < cfg.rules.length; i++) {
    var r = cfg.rules[i];
    var roomOk = (r.room === name) || (r.room === "" && name === TARGET_ROOM);
    if (roomOk) {
      matched = true;
      hit = hit.concat(r.keywords);
    }
  }
  if (!matched) return [];              // 규칙에 없는 방은 감시 안함
  return hit.length ? hit : KEYWORDS;   // 규칙은 있으나 키워드 비면 로컬 기본값
}

function matchKeywords(text, kws) {     // 주어진 키워드 중 메시지에 포함된 것 전체 반환
  var hit = [];
  for (var i = 0; i < kws.length; i++)
    if (text.indexOf(kws[i]) !== -1) hit.push(kws[i]);
  return hit;
}

function postToServer(payload) {        // 실패해도 앱이 죽지 않도록 try/catch
  try {
    Jsoup.connect(API_URL)
      .header("Content-Type", "application/json; charset=utf-8")
      .requestBody(JSON.stringify(payload))
      .ignoreContentType(true)
      .timeout(10000)
      .post();
  } catch (e) {
    Log.error("kakao_alert 서버 전송 실패: " + e);
  }
}

function describeConfig() {
  var lines = ["[현재 설정]"];
  if (cfg.rules.length) {
    for (var i = 0; i < cfg.rules.length; i++) {
      var r = cfg.rules[i];
      lines.push((i + 1) + ") 방: " + (r.room || (TARGET_ROOM + " (기본값)"))
        + " | 키워드: "
        + (r.keywords.length ? r.keywords.join(", ") : (KEYWORDS.join(", ") + " (기본값)")));
    }
    lines.push("(서버 규칙 " + cfg.rules.length + "개 적용 중)");
  } else {
    lines.push("서버 규칙 없음 → 스크립트 기본값");
    lines.push("1) 방: " + TARGET_ROOM + " | 키워드: " + KEYWORDS.join(", "));
  }
  lines.push("마지막 설정 조회: " + (cfg.fetchedAt ? fmtTime(cfg.fetchedAt) : "미조회"));
  lines.push("(..새로고침 으로 즉시 재조회 가능)");
  return lines.join("\n");
}

function response(room, msg, sender, isGroupChat, replier, image, packageName) {
  if (!msg) return;                                  // 이미지 등 빈 내용 제외

  // 채팅방 관리 명령어 (모든 방에서 동작)
  if (msg === "..새로고침") {
    new java.lang.Thread(function () {
      try {
        fetchConfig();                               // 즉시 재조회
        replier.reply("[새로고침 완료] 규칙 " + cfg.rules.length + "개 적용"
          + (cfg.rules.length ? "" : " (없음 → 스크립트 기본값)"));
      } catch (e) {
        Log.error("kakao_alert 새로고침 실패: " + e);
        replier.reply("[새로고침 실패] " + e);
      }
    }).start();
    return;
  }
  if (msg === "..설정") {
    replier.reply(describeConfig());
    return;
  }

  ensureConfig();                                    // TTL 지났으면 백그라운드 재조회

  var kws = keywordsForRoom(room);                   // 이 방에 적용되는 키워드
  if (kws.length === 0) return;                      // 감시하지 않는 방이면 무시

  var hits = matchKeywords(msg, kws);
  if (hits.length === 0) return;                     // 키워드가 하나도 없으면 무시

  var payload = {
    room: String(room),
    sender: String(sender),
    msg: String(msg),
    time: now(),
    keyword: hits.join(", ")                         // 여러 키워드도 한 항목으로 합쳐 저장
  };

  // 네트워크 전송은 별도 스레드 (메인 스레드 블록 방지)
  new java.lang.Thread(function () { postToServer(payload); }).start();

  if (NOTIFY) {
    try { replier.reply("[저장됨] 키워드 '" + payload.keyword + "' 감지"); } catch (e) {}
  }
}
