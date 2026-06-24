(function() {
  "use strict";

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
  function rand(a, b) { return Math.random() * (b - a) + a; }

  // ===== 鎵弿鍊欓€変汉 (澶氬眰绛栫暐) =====
  function scanAll() {
    var result = {candidates: [], page_url: location.href, page_title: document.title, debug: ""};
    var viewW = window.innerWidth;
    var viewH = window.innerHeight;
    var seen = {};

    // 绛栫暐1: 鎵惧乏渚ч潰鏉?
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
              var parentText = (item.parentElement.innerText || item.textContent || "");
              if (parentText.indexOf("\u5df2\u8bfb") >= 0 || parentText.indexOf("read") >= 0 || item.querySelector("[class*=read]") || item.querySelector("[class*=yidu]")) {
                hasReadStatus = true;
              }
            } catch(e) {}
            return {name: name.slice(0,20), last_msg: lastMsg, has_unread: unreadNum > 0, unread_count: unreadNum, has_read: hasReadStatus, x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)};
      } catch(e) { return null; }
    }

    // 绛栫暐2: 鍦ㄥ乏渚ч潰鏉垮唴鎵炬潯鐩?
    if (bestPanel) {
      result.debug = "panelFound";
      var items = bestPanel.querySelectorAll("li, div, [class*=item], [class*=row], [class*=card], [class*=chat], [class*=list]");
      for (var i = 0; i < items.length; i++) {
        var c = extractName(items[i]);
        if (c && c.name && !seen[c.name]) { seen[c.name] = true; result.candidates.push(c); }
      }
    }

    // 绛栫暐3: 鍏ㄩ〉闈㈡壘涓枃鍚嶏紙宸﹀崐鍖哄煙锛?
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

    // 绛栫暐4: 灏濊瘯鐢?role 灞炴€ф壘鍒楄〃
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

    // 绛栫暐5: TreeWalker鏀堕泦宸︿晶鎵€鏈夋枃鏈妭鐐?(缁堟瀬鍏滃簳)
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
    // 绛栫暐6: 缁堟瀬鍏滃簳 - 鏀堕泦鎵€鏈夊彲瑙佹枃鏈腑鐤戜技浜哄悕鐨勫唴瀹?
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
        if (/^[涓€-榫{2,4}$/.test(t)) {
          seen[t] = true;
          result.candidates.push({name: t.slice(0,20), last_msg: "", has_unread: false, x: Math.round(r.left), y: Math.round(r.top)});
        }
      }
    }

    // 绛栫暐7: 鏆村姏鏂囨湰鏀堕泦 - 鏀堕泦椤甸潰宸︿晶鎵€鏈夊彲瑙佹枃鏈妭鐐圭殑鍏ㄩ儴鍐呭
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

  // ===== 鐐瑰嚮鍊欓€変汉 =====
  async function clickCand(name) {
    console.log("[CT] clickCand:", name);

    // 鏂规硶1: TreeWalker鎵炬枃鏈妭鐐?
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

    // 鏂规硶2: 閬嶅巻鎵€鏈夊厓绱犳壘绮剧‘鍖归厤
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
      // 鎵惧彲鐐瑰嚮鐨勭埗鍏冪礌
      var clickTarget = best.closest("a, button, [role=button], [role=link]") || best;
      var r = clickTarget.getBoundingClientRect();

      // 妯℃嫙榧犳爣绉诲姩锛堥槻妫€娴嬶級
      clickTarget.dispatchEvent(new MouseEvent("mouseover", {bubbles: true}));
      await sleep(rand(50, 200));

      // 鐐瑰嚮
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

  // ===== 鍙戦€佹秷鎭?(澶氬眰绛栫暐) =====
  async function sendMsg(text) {
  console.log("[CT] sendMsg");
  return new Promise(function(resolve) {
    var timer = setTimeout(function() {
      resolve({type: "error", data: "send_timeout"});
    }, 12000);
    
    try {
      // 鎵炬墍鏈夊彲鑳界殑杈撳叆鍏冪礌
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
      
      if (!inputEl) {
        clearTimeout(timer);
        resolve({type: "status", data: "error:input_not_found"});
        return;
      }
      
      // 鑱氱劍杈撳叆
      inputEl.focus();
      inputEl.click();
      
      setTimeout(function() {
        try {
          // 鍐欏叆鏂囨湰 (绠€鍖? 涓€娆℃€у啓鍏?
          if (inputEl.isContentEditable) {
            inputEl.innerHTML = "";
            try { document.execCommand("insertText", false, text); } catch(e) { inputEl.innerHTML = text; }
            inputEl.dispatchEvent(new Event("input", {bubbles: true}));
            inputEl.dispatchEvent(new Event("change", {bubbles: true}));
          } else if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
            try {
              var proto = inputEl.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
              var setter = Object.getOwnPropertyDescriptor(proto.prototype, "value").set;
              setter.call(inputEl, text);
            } catch(e) { inputEl.value = text; }
            inputEl.dispatchEvent(new Event("input", {bubbles: true}));
          }
          
          // 鎵惧彂閫佹寜閽?
          
          // Aggressive send: find and click the send button
          var sendBtn = findSendButton(inputEl);
          
          if (sendBtn) {
            // Method 1: native click
            try { sendBtn.click(); } catch(e) {}
            // Method 2: React __reactProps direct call
            try {
              var sk = Object.keys(sendBtn).find(function(k) { return k.indexOf("__reactProps") >= 0 || k.indexOf("__reactEventHandlers") >= 0; });
              if (sk && sendBtn[sk] && sendBtn[sk].onClick) { sendBtn[sk].onClick(); }
            } catch(e) {}
            // Method 3: MouseEvent dispatch
            sendBtn.dispatchEvent(new MouseEvent("click", {bubbles: true, button: 0, cancelable: true}));
          }
          
          // Also try Enter on input
          try {
            inputEl.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true}));
            inputEl.dispatchEvent(new KeyboardEvent("keyup", {key: "Enter", code: "Enter", keyCode: 13, bubbles: true}));
            // Ctrl+Enter
            inputEl.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", code: "Enter", keyCode: 13, ctrlKey: true, bubbles: true}));
            inputEl.dispatchEvent(new KeyboardEvent("keyup", {key: "Enter", code: "Enter", keyCode: 13, ctrlKey: true, bubbles: true}));
          } catch(e) {}
          
          clearTimeout(timer);
          resolve({type: "status", data: "sent"});
        } catch(e) {
          clearTimeout(timer);
          resolve({type: "error", data: "send_err3:" + (e.message || e)});
        }
      }, 400);
    } catch(e) {
      clearTimeout(timer);
      resolve({type: "error", data: "send_err2:" + (e.message || e)});
    }
  }, 300);
} catch(e) {
  clearTimeout(timer);
  resolve({type: "error", data: "send_err1:" + (e.message || e)});
}
};

function findSendButton(inputEl) {
  // Helper: find ANY clickable element near the input that looks like a send button
  var candidates = [];
  var inputRect = inputEl.getBoundingClientRect();
  
  // Strategy 1: Find ALL elements with text matching
  var allEls = document.querySelectorAll("button, [role=button], a, span, div, i, svg");
  for (var i = 0; i < allEls.length; i++) {
    var el = allEls[i];
    var r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) continue;
    // Near the bottom-right (chat input area)
    if (r.top < inputRect.top - 80 || r.top > inputRect.bottom + 80) continue;
    if (r.left < inputRect.left) continue;
    
    var t = (el.innerText || el.textContent || "").trim().toLowerCase();
    // Score: higher = better match
    var score = 0;
    if (t.indexOf("发送") >= 0) score += 100;
    if (t.indexOf("send") >= 0) score += 50;
    if (t.indexOf("回复") >= 0) score += 30;
    if (t === "" || t === " " || t === "\n") score += 5; // Icon buttons often have empty text
    // Bonus for being to the right of the input
    if (r.left > inputRect.right) score += 20;
    // Bonus for being at similar height
    var heightDiff = Math.abs(r.top - inputRect.top);
    if (heightDiff < 30) score += 20;
    if (heightDiff < 60) score += 10;
    
    if (score > 0) {
      candidates.push({el: el, score: score});
    }
  }
  
  // Sort by score descending
  candidates.sort(function(a,b) { return b.score - a.score; });
  
  if (candidates.length > 0) {
    if (candidates[0].score > 10) return candidates[0].el;
    // Low score - try multiple candidates
    for (var i = 0; i < candidates.length && i < 3; i++) {
      try { candidates[i].el.click(); } catch(e) {}
    }
    return candidates[0].el;
  }
  
  // Strategy 2: Find the rightmost-interactive element in the bottom toolbar
  var toolbar = null;
  var allDivs = document.querySelectorAll("div");
  for (var i = 0; i < allDivs.length; i++) {
    var r = allDivs[i].getBoundingClientRect();
    if (Math.abs(r.top - inputRect.top) < 50 && r.width > 200 && r.left > inputRect.left - 100) {
      // This might be the toolbar
      var lastChild = allDivs[i].lastElementChild || allDivs[i].children[allDivs[i].children.length - 1];
      if (lastChild) { return lastChild; }
    }
  }
  
  return null;
}
 catch(e) {
              clearTimeout(timer);
              resolve({type: "error", data: "send_err3:" + (e.message || e)});
            }
          }, 800);
        } catch(e) {
          clearTimeout(timer);
          resolve({type: "error", data: "send_err2:" + (e.message || e)});
        }
      }, 500);
    } catch(e) {
      clearTimeout(timer);
      resolve({type: "error", data: "send_err1:" + (e.message || e)});
    }
  });
}

// ===== 璇诲彇鑱婂ぉ =====// ===== 璇诲彇鑱婂ぉ =====
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

  // ===== 椤甸潰璇婃柇 =====
  function scanDetail() {
    var result = {url: location.href, title: document.title, viewport: window.innerWidth+"x"+window.innerHeight, bodyLength: (document.body.innerText||"").length, elements: [], inputs: [], allText: []};
    // 鏀堕泦鎵€鏈夊彲瑙佹枃鏈?
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

  // ===== 娑堟伅鐩戝惉 =====
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
        sendMsg(msg.params.text).then(function(resp) { sendResponse(resp); }).catch(function(e) { sendResponse({type: "error", data: "send_err:" + (e.message || e)}); });
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

  // 閫氱煡鍚庡彴
  chrome.runtime.sendMessage({type: "connected", data: {url: location.href, title: document.title}});

  // 蹇冭烦
  setInterval(function() { chrome.runtime.sendMessage({type: "ping"}); }, 15000);

  console.log("[CT] BOSS鐩磋仒鍔╂墜 v6.1 鍔犺浇瀹屾垚");
})();

