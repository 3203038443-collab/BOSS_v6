  console.log("[CT] sendMsg");
  return new Promise(function(resolve) {
    var timer = setTimeout(function() { resolve({type: "error", data: "send_timeout"}); }, 12000);
    try {
      var inputEl = null;
      var sels = ["[contenteditable="true"]","[contenteditable]","[role="textbox"]","textarea","input[type="text"]"];
      for (var si = 0; si < sels.length; si++) {
        var els = document.querySelectorAll(sels[si]);
        for (var ei = 0; ei < els.length; ei++) {
          var r = els[ei].getBoundingClientRect();
          if (r.width > 40 && r.height > 16) { inputEl = els[ei]; break; }
        }
        if (inputEl) break;
      }
      if (!inputEl) { clearTimeout(timer); resolve({type: "status", data: "error:input_not_found"}); return; }
      
      inputEl.focus();
      inputEl.click();
      
      setTimeout(function() {
        try {
          if (inputEl.isContentEditable) {
            inputEl.innerHTML = "";
            try { document.execCommand("insertText", false, text); } catch(e) { inputEl.innerHTML = text; }
            inputEl.dispatchEvent(new Event("input", {bubbles: true}));
            inputEl.dispatchEvent(new Event("change", {bubbles: true}));
          } else {
            var proto = inputEl.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
            var setter = Object.getOwnPropertyDescriptor(proto.prototype, "value").set;
            setter.call(inputEl, text);
            inputEl.dispatchEvent(new Event("input", {bubbles: true}));
          }
          
          var sendBtn = findSendButton(inputEl);
          if (sendBtn) {
            try { sendBtn.click(); } catch(e) {}
            sendBtn.dispatchEvent(new MouseEvent("click", {bubbles: true, button: 0, cancelable: true}));
          }
          inputEl.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true}));
          inputEl.dispatchEvent(new KeyboardEvent("keyup", {key: "Enter", code: "Enter", keyCode: 13, bubbles: true}));
          
          clearTimeout(timer);
          resolve({type: "status", data: "sent"});
        } catch(e) { clearTimeout(timer); resolve({type: "error", data: "send_err:" + (e.message || e)}); }
      }, 500);
    } catch(e) { clearTimeout(timer); resolve({type: "error", data: "send_err:" + (e.message || e)}); }
  });
}

function findSendButton(inputEl) {
  var candidates = [];
  var ir = inputEl.getBoundingClientRect();
  var allEls = document.querySelectorAll("button, [role=button], a, span, div, i, svg");
  for (var i = 0; i < allEls.length; i++) {
    var el = allEls[i]; var r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) continue;
    if (r.top < ir.top - 80 || r.top > ir.bottom + 80) continue;
    if (r.left < ir.left) continue;
    var t = (el.innerText || el.textContent || "").trim().toLowerCase();
    var score = 0;
    if (t.indexOf("\u53d1\u9001") >= 0) score += 100;
    if (t.indexOf("send") >= 0) score += 50;
    if (t === "" || t === " ") score += 5;
    if (r.left > ir.right) score += 20;
    var hd = Math.abs(r.top - ir.top);
    if (hd < 30) score += 20;
    if (score > 0) candidates.push({el: el, score: score});
  }
  candidates.sort(function(a,b) { return b.score - a.score; });
  if (candidates.length > 0 && candidates[0].score > 10) return candidates[0].el;
  if (candidates.length > 0) { for (var i = 0; i < candidates.length && i < 3; i++) { try { candidates[i].el.click(); } catch(e) {} } return candidates[0].el; }
  return null;
}
function readChat() {
    var result = {messages: [], full_text: ""};
    var midX = window.innerWidth * 0.4;
    var maxArea = 0, container = null;
    var divs = document.querySelectorAll("div");
    for (var i = 0; i < divs.length; i++) {
      var r = divs[i].getBoundingClientRect();
      if (r.left > midX && r.width > 200 && r.top < window.innerHeight * 0.7) {
        var area = r.width * r.height;
        if (area > maxArea) { maxArea = area; container = divs[i]; }
      }
    }
    if (container) {
      result.full_text = (container.innerText || "").trim().slice(0, 2000);
      container.querySelectorAll("[class*=message],[class*=msg],[class*=bubble],[class*=text]").forEach(function(el) {
        var t = (el.innerText || "").trim();
        if (t && result.messages.length < 20) result.messages.push(t.slice(0, 200));
      });
    }
    return result;
  }

  // ===== 页面诊断 =====
  function scanDetail() {
    var result = {url: location.href, title: document.title, viewport: window.innerWidth+"x"+window.innerHeight, bodyLength: (document.body.innerText||"").length, elements: [], inputs: [], allText: []};
    // 收集所有可见文本
    var textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var txtNode;
    while (txtNode = textWalker.nextNode()) {
      var t = (txtNode.textContent || "").trim();
      if (t.length > 0) {
        var r = txtNode.parentElement.getBoundingClientRect();
        result.allText.push({text: t.slice(0,60), x: Math.round(r.left), y: Math.round(r.top), tag: txtNode.parentElement.tagName});
      }
    }
    result = {url: location.href, title: document.title, viewport: window.innerWidth+"x"+window.innerHeight, bodyLength: (document.body.innerText||"").length, elements: [], inputs: []};
    var allEls = document.querySelectorAll("div, li, a, button, span, textarea, [contenteditable]");
    var count = 0;
    for (var i = 0; i < allEls.length && count < 60; i++) {
      var r = allEls[i].getBoundingClientRect();
      var t = (allEls[i].innerText || allEls[i].textContent || "").trim();
      if (r.width > 0 && r.height > 0 && t.length > 0 && t.length < 100) {
        result.elements.push({tag: allEls[i].tagName, cls: (allEls[i].className||"").slice(0,50), id: (allEls[i].id||""), text: t.slice(0,60), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), clickable: allEls[i].tagName === "A" || allEls[i].tagName === "BUTTON" || allEls[i].getAttribute("role") === "button" ? 1 : 0});
        count++;
      }
    }
    document.querySelectorAll("textarea, [contenteditable], input[type=text]").forEach(function(el) {
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) result.inputs.push({tag: el.tagName, editable: el.isContentEditable, placeholder: (el.placeholder || el.getAttribute("aria-label") || ""), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height)});
    });
    return result;
  }

  // ===== 消息监听 =====
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    console.log("[CT] cmd:", msg.cmd, JSON.stringify(msg.params || {}).slice(0,60));

    switch(msg.cmd) {
      case "scan_candidates":
        try {
          sendResponse({type: "candidates", data: scanAll()});
        } catch(e) {
          sendResponse({type: "error", data: "scan_error:" + (e.message || e)});
        }
        break;
      case "read_chat":
        sendResponse({type: "chat_content", data: readChat()});
        break;
      case "scan_detail":
        sendResponse({type: "detail", data: scanDetail()});
        break;
      case "click_candidate":
        clickCand(msg.params.name).then(function(ok) { sendResponse({type: "status", data: ok ? "clicked" : "error:not_found"}); }).catch(function(e) { sendResponse({type: "error", data: "click_error:" + (e.message || e)}); });
        return true;
      case "send_message":
        sendMsg(msg.params.text).then(function(ok) { sendResponse({type: "status", data: ok ? "sent" : "error:failed"}); }).catch(function(e) { sendResponse({type: "error", data: "send_error:" + (e.message || e)}); });
        return true;
      case "ping":
        sendResponse({pong: true, time: Date.now()});
        break;
      case "get_status":
        sendResponse({type: "status", data: "ready"});
        break;
      default:
        sendResponse({type: "error", data: "unknown:" + msg.cmd});
    }
    return true;
  });

  // 通知后台
  chrome.runtime.sendMessage({type: "connected", data: {url: location.href, title: document.title}});

  // 心跳
  setInterval(function() { chrome.runtime.sendMessage({type: "ping"}); }, 15000);

  console.log("[CT] BOSS直聘助手 v6.1 加载完成");
})();

