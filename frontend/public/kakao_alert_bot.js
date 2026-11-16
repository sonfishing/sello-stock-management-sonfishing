// ======================================================================
//  카카오톡 키워드 감지 → 서버 전송 봇 (메신저봇R API2 방식)
//  이 파일: https://item.sonfishing.co.kr/kakao_alert_bot.js
//
//  서버 설정: https://item.sonfishing.co.kr/kakao_alert 페이지의 "⚙️ 설정"
//             (방이름 + 검색키워드 쌍을 여러 개 등록 가능, 최대 10분 내 반영)
//             방 이름이 발신자 이름으로 오는 경우 규칙의 "채널ID"에
//             ..방이름 답변의 채널ID를 붙여넣으면 ID로 정확히 매칭됨
//  채팅방 명령어:
//    ..설정     → 현재 적용 중인 규칙 확인
//    ..방이름   → 봇이 받은 방 이름과 규칙 일치 여부 확인 (알림이 안 올 때)
//    ..새로고침 → 서버 설정을 즉시 다시 받아 적용 (10분 주기와 무관)
//    ..핑       → 봇 → 서버 전송 연결 테스트
//  서버 설정이 없으면 아래 로컬 기본값을 사용합니다.
//  (주: 레거시 API 체크는 해제하고 사용 — API2 전용 스크립트)
// ======================================================================

var bot = BotManager.getCurrentBot();

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

function safeLog(msg) {
  try { Log.d("kakao_alert", msg); } catch (e) {}
}

function now() {
  return new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date());
}

function fmtTime(ms) {
  return new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date(ms));
}

/* ===== 순수 Java HTTP (Jsoup 의존 없음 — 버전 업데이트에 안전) ===== */
function httpGet(url) {
  var conn = new java.net.URL(url).openConnection();
  conn.setConnectTimeout(10000);
  conn.setReadTimeout(10000);
  conn.setRequestMethod("GET");
  var br = new java.io.BufferedReader(new java.io.InputStreamReader(conn.getInputStream(), "UTF-8"));
  var line, out = [];
  while ((line = br.readLine()) != null) out.push(line);
  br.close();
  conn.disconnect();
  return out.join("\n");
}

function httpPost(url, jsonBody) {
  var conn = new java.net.URL(url).openConnection();
  conn.setConnectTimeout(10000);
  conn.setReadTimeout(10000);
  conn.setRequestMethod("POST");
  conn.setDoOutput(true);
  conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
  var os = conn.getOutputStream();
  os.write(new java.lang.String(jsonBody).getBytes("UTF-8"));
  os.close();
  conn.getResponseCode(); // 전송 완료 확인
  conn.disconnect();
}
/* ================================================================ */

function fetchConfig() {
  try {
    var body = httpGet(CONFIG_URL);
    var data = JSON.parse(body);
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
          rules.push({
            room: String(r.room || "").trim(),
            channelId: String(r.channelId || "").trim(),  // 채널ID 규칙은 이름 대신 ID로 매칭
            keywords: kws
          });
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
      safeLog("서버 설정 로드 - 규칙 " + rules.length + "개");
      return;
    }
    cfg.fetchedAt = Date.now();
  } catch (e) {
    safeLog("설정 조회 실패: " + e);
    cfg.fetchedAt = Date.now(); // 실패해도 TTL 내 무한 재시도 방지
  }
}

function ensureConfig() {
  if (Date.now() - cfg.fetchedAt <= CONFIG_TTL) return;
  cfg.fetchedAt = Date.now(); // 완료 전 중복 조회 방지
  new java.lang.Thread(function () { fetchConfig(); }).start();
}

// 이 방에 맞는 규칙 찾기 → { room: 웹 표시용 방이름, keywords: [...] } 또는 null
// 매칭 규칙:
//   - 규칙에 channelId(채널ID) 있음 → 봇이 받은 channelId와 일치할 때만 (방 이름 문자열이 틀려도OK)
//   - channelId 없음 → 규칙의 방 이름과 봇이 받은 방 이름이 일치할 때
function matchRule(name, channelId) {
  var id = (channelId === undefined || channelId === null) ? "" : String(channelId);
  if (!cfg.rules.length) {              // 서버 설정 없음 → 로컬 기본값
    return name === TARGET_ROOM ? { room: TARGET_ROOM, keywords: KEYWORDS } : null;
  }
  var hit = [], label = "", matched = false;
  for (var i = 0; i < cfg.rules.length; i++) {
    var r = cfg.rules[i];
    var ok = false;
    if (r.channelId) {                  // 채널ID 규칙: ID로만 매칭
      ok = (id !== "" && r.channelId === id);
    } else {                            // 이름 규칙: 방 이름으로만 매칭
      ok = (r.room === name) || (r.room === "" && name === TARGET_ROOM);
    }
    if (ok) {
      matched = true;
      if (!label && r.room) label = r.room;
      hit = hit.concat(r.keywords);
    }
  }
  if (!matched) return null;            // 규칙에 없는 방은 감시 안함
  if (!label) label = name;             // 표시용 방이름이 규칙에 없으면 받은 이름 사용
  return { room: label, keywords: hit.length ? hit : KEYWORDS }; // 키워드 비면 로컬 기본값
}

function matchKeywords(text, kws) {     // 주어진 키워드 중 메시지에 포함된 것 전체 반환
  var hit = [];
  for (var i = 0; i < kws.length; i++)
    if (text.indexOf(kws[i]) !== -1) hit.push(kws[i]);
  return hit;
}

function postToServer(payload) {        // 실패해도 앱이 죽지 않도록 try/catch
  try {
    httpPost(API_URL, JSON.stringify(payload));
    safeLog("서버 전송 완료");
  } catch (e) {
    safeLog("서버 전송 실패: " + e);
  }
}

function describeConfig() {
  var lines = ["[현재 설정]"];
  if (cfg.rules.length) {
    for (var i = 0; i < cfg.rules.length; i++) {
      var r = cfg.rules[i];
      lines.push((i + 1) + ") 방: " + (r.room || (TARGET_ROOM + " (기본값)"))
        + (r.channelId ? " | 채널ID: " + r.channelId : "")
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

function onMessage(msg) {
  var content = msg.content;
  if (!content) return;                                  // 이미지 등 빈 내용 제외

  // 채팅방 관리 명령어 (모든 방에서 동작)
  if (content === "..새로고침") {
    new java.lang.Thread(function () {
      try {
        fetchConfig();                                   // 즉시 재조회
        msg.reply("[새로고침 완료] 규칙 " + cfg.rules.length + "개 적용"
          + (cfg.rules.length ? "" : " (없음 → 스크립트 기본값)"));
      } catch (e) {
        safeLog("새로고침 실패: " + e);
        msg.reply("[새로고침 실패] " + e);
      }
    }).start();
    return;
  }
  if (content === "..설정") {
    msg.reply(describeConfig());
    return;
  }

  // 방 이름 확인: 이 방에서 입력하면 봇이 받은 방 이름/채널ID와 규칙 일치 여부를 알려줌
  if (content === "..방이름") {
    var cid = "";
    try { cid = String(msg.channelId); } catch (e) { cid = "(확인불가)"; }
    var m = matchRule(msg.room, msg.channelId);
    var lines2 = ["[방 이름 확인]",
      "봇이 받은 방 이름: [" + msg.room + "]",
      "채널ID: [" + cid + "]",
      "보낸 사람: [" + msg.author.name + "]",
      "대화 유형: " + (msg.isGroupChat ? "단체방" : "1:1 대화")];
    if (cfg.rules.length) {
      lines2.push("규칙 일치: " + (m ? "O → 감시 중 (표시이름: " + m.room + ")" : "X → 감시 안함"));
      for (var n = 0; n < cfg.rules.length; n++) {
        var rr = cfg.rules[n];
        lines2.push("규칙 " + (n + 1) + ": [" + rr.room + "]"
          + (rr.channelId ? " (채널ID: " + rr.channelId + ")" : ""));
      }
      lines2.push("(채널ID 규칙은 설정창의 채널ID 칸에 위ID를 붙여넣어 등록)");
    } else {
      lines2.push("서버 규칙 없음 → 스크립트 기본값 방: [" + TARGET_ROOM + "]");
    }
    msg.reply(lines2.join("\n"));
    return;
  }
  if (content === "..핑") {
    var pingPayload = {
      room: String(msg.room),
      sender: String(msg.author.name),
      msg: "[핑] 봇 → 서버 연결 테스트 (" + now() + ")",
      time: now(),
      keyword: "테스트"
    };
    new java.lang.Thread(function () {
      try {
        httpPost(API_URL, JSON.stringify(pingPayload));
        msg.reply("[핑] 전송 완료 → 웹 kakao_alert 페이지에서 확인");
      } catch (e) {
        safeLog("핑 실패: " + e);
        msg.reply("[핑] 서버 전송 실패: " + e);
      }
    }).start();
    return;
  }

  ensureConfig();                                    // TTL 지났으면 백그라운드 재조회

  var rule = matchRule(msg.room, msg.channelId);     // 이 방에 맞는 규칙 (없으면 null)
  if (!rule) return;                                 // 감시하지 않는 방이면 무시

  var hits = matchKeywords(content, rule.keywords);
  if (hits.length === 0) return;                     // 키워드가 하나도 없으면 무시

  var payload = {
    room: String(rule.room),                         // 웹 표시용 방이름 (채널ID 매칭 시 규칙의 방이름 사용)
    sender: String(msg.author.name),
    msg: String(content),
    time: now(),
    keyword: hits.join(", ")                         // 여러 키워드도 한 항목으로 합쳐 저장
  };

  // 네트워크 전송은 별도 스레드 (메인 스레드 블록 방지)
  new java.lang.Thread(function () { postToServer(payload); }).start();

  if (NOTIFY) {
    try { msg.reply("[저장됨] 키워드 '" + payload.keyword + "' 감지"); } catch (e) {}
  }
}
bot.addListener(Event.MESSAGE, onMessage);
