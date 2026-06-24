(function() {
  "use strict";

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
  function rand(a, b) { return Math.random() * (b - a) + a; }

  // ===== 扫描候选人 (多层策略) =====
  function scanAll() {
    var result = {candidates: [], page_url: location.href, page_title: document.title, debug: ""};
    var viewW = window.innerWidth;
    var viewH = window.innerHeight;
    var seen = {};

    // 策略1: 找左侧面板
    var panels = document.querySelectorAll("div");
    var bestPanel = null, bestArea = 0;
    for (var i = 0; i < panels.length; i++) {
      var r = panels[i].getBoundingClientRect();
      if (r.left >= 0 && r.left < viewW * 0.4 && r.width > 150 && r.height > 200) {
        var area = r.width * r.height;
        if (area > bestArea) { bestArea = area; bestPanel = panels[i]; }
      }
    }

    function extractName(item) {
      try {
        var text = (item.innerText || "").trim();
        if (!text || text.length < 2) return null;
        var r = item.getBoundingClientRect();
        if (r.width < 50 || r.height < 20) return null;
        var lines = text.split("\n").filter(function(l) { return l.trim(); });
        if (lines.length === 0) return null;
        var name = lines[0].trim();
        if (name.length < 1 || name.length > 20 || /^\d+$/.test(name)) return null;
        var lastMsg = lines.length > 1 ? lines[1].trim().slice(0, 80) : "";
        var unreadNum = 0;
        var children = item.querySelectorAll("*");
        for (var j = 0; j < children.length; j++) {
          var t = (children[j].innerText || "").trim();
          if (/^\d{1,2}$/.test(t)) { var n = parseInt(t, 10); if (n > 0 && n < 100) unreadNum = n; }
        }
        // Check for \u5df2\u8bfb indicator
        var hasReadStatus = false;
        try {
          var pt = (item.parentElement.innerText || item.textContent || "");
          if (pt.indexOf("\u5df2\u8bfb") >= 0 || pt.indexOf("read") >= 0 || item.querySelector("[class*=read]") || item.querySelector("[class*=yidu]")) {
            hasReadStatus = true;
          }
        } catch(e) {}
        return {name: name.slice(0,20), last_msg: lastMsg, has_unread: unreadNum > 0, unread_count: unreadNum, has_read: hasReadStatus, x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)};
      } catch(e) { return null; }
    }

    // 策略2: 在左侧面板内找条目
    if (bestPanel) {
      result.debug = "panelFound";
      var items = bestPanel.querySelectorAll("li, div, [class*=item], [class*=row], [class*=card], [class*=chat], [class*=list]");
      for (var i = 0; i < items.length; i++) {
        var c = extractName(items[i]);
        if (c && c.name && !seen[c.name]) { seen[c.name] = true; result.candidates.push(c); }
      }
    }

    // 策略3: 全页面找中文名（左半区域）
    if (result.candidates.length === 0) {
      result.debug = "fallbackTextScan";
      var allEls = document.querySelectorAll("div, li, a, span, button");
      for (var i = 0; i < allEls.length; i++) {
        var r = allEls[i].getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.left > viewW * 0.5 || r.top < 40 || r.top > viewH * 0.9) continue;
        var t = (allEls[i].innerText || "").trim();
        if (!t || t.length < 2 || t.length > 100) continue;
        var lines = t.split("\n").filter(function(l) { return l.trim(); });
        if (lines.length === 0) continue;
        var name = lines[0].trim();
        if (name.length > 20 || name.length < 1 || /^\d+$/.test(name) || seen[name]) continue;
        seen[name] = true;
        result.candidates.push({name: name.slice(0,20), last_msg: lines.length > 1 ? lines[1].trim().slice(0,80) : "", has_unread: false, unread_count: 0, x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)});
      }
    }

    // 策略4: 尝试用 role 属性找列表
    if (result.candidates.length === 0) {
      result.debug = "roleListScan";
      var lists = document.querySelectorAll('[role="list"], [role="listbox"], [role="menu"]');
      if (lists.length > 0) {
        for (var li = 0; li < lists.length; li++) {
          var r = lists[li].getBoundingClientRect();
          if (r.left < viewW * 0.4) {
            var childItems = lists[li].querySelectorAll("[role=listitem], li, > div");
            for (var ci = 0; ci < childItems.length; ci++) {
              var c = extractName(childItems[ci]);
              if (c && c.name && !seen[c.name]) { seen[c.name] = true; result.candidates.push(c); }
            }
            if (result.candidates.length > 0) break;
          }
        }
      }
    }

    // 策略5: TreeWalker收集左侧所有文本节点 (终极兜底)
    if (result.candidates.length === 0) {
      result.debug = "treeWalker_fallback";
      try {
        var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var tn, txtSeen = {};
        while ((tn = tw.nextNode())) {
          var t = (tn.textContent || "").trim();
          if (!t || t.length < 2 || t.length > 20 || /^\d+$/.test(t) || t.indexOf("\n") >= 0) continue;
          var r = tn.parentElement.getBoundingClientRect();
          if (r.left > window.innerWidth * 0.5 || r.width === 0 || r.height === 0) continue;
          if (/^[\u4e00-\u9fa5]{2,4}$/.test(t) || /^[a-zA-Z\u4e00-\u9fa5]{2,10}$/.test(t)) {
            if (!txtSeen[t]) { txtSeen[t] = true; result.candidates.push({name: t.slice(0,20), last_msg: "", has_unread: false, x: Math.round(r.left), y: Math.round(r.top)}); }
          }
        }
      } catch(e) { result.debug = "treeWalker_error"; }
    }
    // 策略6: 终极兜底 - 收集所有可见文本中疑似人名的内容
    if (result.candidates.length === 0) {
      result.debug = "ultimateCatchAll";
      var allElements = document.querySelectorAll("div, li, a, span, button, p, h1, h2, h3, h4");
      for (var si = 0; si < allElements.length; si++) {
        var el = allElements[si];
        var r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.left > viewW * 0.5) continue;
        if (r.top < 50 || r.bottom > viewH) continue;
        var t = (el.innerText || el.textContent || "").trim();
        if (!t || t.length < 2 || t.length > 20) continue;
        if (/^\d+$/.test(t) || seen[t]) continue;
        if (/^[一-龥]{2,4}$/.test(t)) {
          seen[t] = true;
          result.candidates.push({name: t.slice(0,20), last_msg: "", has_unread: false, x: Math.round(r.left), y: Math.round(r.top)});
        }
      }
    }

    // 策略7: 暴力文本收集 - 收集页面左侧所有可见文本节点的全部内容
    if (result.debug.startsWith("ultimate") || result.candidates.length < 3) {
      result.debug = "textDumpAll";
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      var node;
      var textSeen = {};
      while ((node = walker.nextNode())) {
        var t = (node.textContent || "").trim();
        if (!t || t.length < 2 || textSeen[t]) continue;
        textSeen[t] = true;
        var r = node.parentElement.getBoundingClientRect();
        if (r.left > viewW * 0.55 || r.top < 30 || r.width === 0) continue;
        if (t.length <= 20 && !/^\d+$/.test(t) && !seen[t]) {
          seen[t] = true;
          result.candidates.push({name: t.slice(0,20), last_msg: "", has_unread: false, x: Math.round(r.left), y: Math.round(r.top)});
        }
      }
    }

        console.log("[CT] scanAll:", result.candidates.length, "candidates, debug:", result.debug);
    return result;
  }

  // ===== 点击候选人 =====
  async function clickCand(name) {
    console.log("[CT] clickCand:", name);

    // 方法1: TreeWalker找文本节点
    var best = null;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      var t = (node.textContent || "").trim();
      if (t.indexOf(name) >= 0 && t.length < 50) {
        var el = node.parentElement;
        for (var i = 0; i < 8; i++) {
          if (!el) break;
          var tag = el.tagName.toLowerCase();
          var role = el.getAttribute("role") || "";
          if (tag === "a" || tag === "button" || role === "button" || role === "link" || el.style.cursor === "pointer") { best = el; break; }
          el = el.parentElement;
        }
        if (!best) best = node.parentElement;
        break;
      }
    }

    // 方法2: 遍历所有元素找精确匹配
    if (!best) {
      var allEls = document.querySelectorAll("div, li, a, span, button");
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        var t = (el.innerText || "").trim();
        if (t === name || t.indexOf(name) === 0) {
          var r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.left < window.innerWidth * 0.5) {
            if (!best || t.length < (best.innerText || "").trim().length) best = el;
          }
        }
      }
    }

    if (!best) { console.log("[CT] clickCand: not found"); return false; }

    try {
      // 找可点击的父元素
      var clickTarget = best.closest("a, button, [role=button], [role=link]") || best;
      var r = clickTarget.getBoundingClientRect();

      // 模拟鼠标移动（防检测）
      clickTarget.dispatchEvent(new MouseEvent("mouseover", {bubbles: true}));
      await sleep(rand(50, 200));

      // 点击
      clickTarget.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, button: 0}));
      await sleep(rand(30, 80));
      clickTarget.dispatchEvent(new MouseEvent("mouseup", {bubbles: true, button: 0}));
      clickTarget.dispatchEvent(new MouseEvent("click", {bubbles: true, button: 0}));

      await sleep(2000 + rand(0, 2000));
      console.log("[CT] click done");
      return true;
    } catch(e) {
      console.log("[CT] click error:", e);
      return false;
    }
  }

  // ===== 发送消息 (多层策略) =====
  
async function sendMsg(text) {
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

