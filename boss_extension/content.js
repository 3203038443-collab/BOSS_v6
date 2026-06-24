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
        // Check for \u5df2\u8bfb (\u5df2\u8bfb) indicator
        var hasReadStatus = false;
        try {
          if (item && item.parentElement) {
            var pt = item.parentElement.innerText || "";
            if (pt.indexOf("\u5df2\u8bfb") >= 0 || pt.indexOf("read") >= 0 || item.querySelector("[class*=read]") || item.querySelector("[class*=yidu]")) {
              hasReadStatus = true;
            }
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
        if (/^[\u4e00-\u9fa5]{2,4}$/.test(t)) {
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

  // ===== 发送消息 (多层策略+暴力发送) =====
  async function sendMsg(text) {
    console.log("[CT] sendMsg");

    // 找输入框 - 使用更全面选择器
    var inputEl = null;
    var leftBound = window.innerWidth * 0.3;
    var inputSelectors = [
      'textarea', 'input[type="text"]',
      '[contenteditable="true"]', '[contenteditable]', '[role="textbox"]',
      '[class*=input]', '[class*=editor]',
      '[class*=chat-input]', '[class*=msg-input]',
      '[class*=message-input]', '[aria-label*=输入]', '[aria-label*=message]',
      '[placeholder*=输入]', '[placeholder*=说]'
    ];
    for (var s = 0; s < inputSelectors.length; s++) {
      var els = document.querySelectorAll(inputSelectors[s]);
      for (var e = 0; e < els.length; e++) {
        var r = els[e].getBoundingClientRect();
        if (r.width > 80 && r.height > 20 && r.left > leftBound && r.top < window.innerHeight * 0.9) {
          inputEl = els[e]; break;
        }
      }
      if (inputEl) break;
    }

    // 兜底: 任何可见输入元素
    if (!inputEl) {
      var allInputs = document.querySelectorAll("textarea, [contenteditable], input[type=text], [role=textbox]");
      for (var i = 0; i < allInputs.length; i++) {
        var r = allInputs[i].getBoundingClientRect();
        if (r.width > 80 && r.height > 20) { inputEl = allInputs[i]; break; }
      }
    }

    if (!inputEl) { console.log("[CT] input not found"); return false; }

    // 聚焦并清空输入框
    inputEl.focus();
    inputEl.click();
    await sleep(rand(200, 400));

    // 清空
    if (inputEl.isContentEditable) {
      inputEl.innerHTML = "";
      inputEl.dispatchEvent(new InputEvent("input", {bubbles: true, cancelable: true}));
    } else if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
      inputEl.value = "";
      inputEl.dispatchEvent(new Event("input", {bubbles: true}));
    }

    // ***** 逐字输入 (人类打字延迟，防检测) *****
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var delay = rand(60, 160);
      if (Math.random() < 0.1) delay += rand(300, 1200);
      await sleep(delay);

      if (inputEl.isContentEditable) {
        try { document.execCommand("insertText", false, ch); } catch(e) {}
        inputEl.dispatchEvent(new InputEvent("input", {bubbles: true, cancelable: true}));
        inputEl.dispatchEvent(new Event("change", {bubbles: true}));
      } else if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
        try {
          var proto = inputEl.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
          var setter = Object.getOwnPropertyDescriptor(proto.prototype, "value").set;
          var cursor = inputEl.selectionStart || inputEl.value.length;
          var newVal = inputEl.value.slice(0, cursor) + ch + inputEl.value.slice(inputEl.selectionEnd || cursor);
          setter.call(inputEl, newVal);
          inputEl.dispatchEvent(new Event("input", {bubbles: true}));
          inputEl.setSelectionRange(cursor + 1, cursor + 1);
        } catch(e) {
          inputEl.value += ch;
          inputEl.dispatchEvent(new Event("input", {bubbles: true}));
        }
      }
    }

    await sleep(rand(300, 800));

    // ===== 暴力发送: 尝试6种策略 =====
    console.log("[CT] trying send strategies...");

    // 策略1: 按文本/类名找发送按钮
    function findAllSendButtons() {
      var ir = inputEl.getBoundingClientRect();
      var results = [];
      var allElements = document.querySelectorAll("button, [role=button], a, span, div, i, svg, [class*=send], [class*=fabu], [class*=icon]");
      for (var i = 0; i < allElements.length; i++) {
        var el = allElements[i];
        var r = el.getBoundingClientRect();
        if (r.width < 16 || r.height < 16) continue;
        var t = (el.innerText || el.textContent || el.getAttribute("aria-label") || "").trim().toLowerCase();
        var cls = (el.className || "").toLowerCase();
        var score = 0;
        if (t.indexOf("\u53d1\u9001") >= 0) score += 200;
        if (t.indexOf("send") >= 0) score += 150;
        if (t.indexOf("\u63d0\u4ea4") >= 0) score += 100;
        if (t.indexOf("\u786e\u5b9a") >= 0) score += 50;
        if (cls.indexOf("send") >= 0) score += 100;
        if (cls.indexOf("fabu") >= 0) score += 100;
        if (cls.indexOf("chat-send") >= 0) score += 200;
        if (cls.indexOf("btn-send") >= 0) score += 150;
        if (el.tagName === "BUTTON") score += 30;
        if (el.tagName === "I" || el.tagName === "SVG") score += 10;
        if (r.left > ir.left + ir.width * 0.5 && r.left < ir.right + 200) score += 50;
        if (r.top > ir.top - 20 && r.top < ir.bottom + 20) score += 40;
        if (score > 0) results.push({el: el, score: score, r: r, tag: el.tagName});
      }
      results.sort(function(a,b) { return b.score - a.score; });
      return results;
    }

    // 策略2: 找右下角所有可点击元素
    function findBottomRightClickables() {
      var results = [];
      var viewH = window.innerHeight;
      var viewW = window.innerWidth;
      var allEls = document.querySelectorAll("button, [role=button], a, [onclick], [class*=btn], [class*=send], [class*=fabu]");
      for (var i = 0; i < allEls.length; i++) {
        var r = allEls[i].getBoundingClientRect();
        if (r.width < 20 || r.height < 20) continue;
        if (r.top < viewH * 0.55 || r.top > viewH - 10) continue;
        if (r.left < viewW * 0.4) continue;
        results.push({el: allEls[i], r: r, dist: r.top + r.left});
      }
      results.sort(function(a,b) { return b.r.left - a.r.left; });
      return results;
    }

    // 通用点击函数 - 用多种方法点击元素
    function clickElement(el) {
      var methods = [
        function() { try { el.click(); } catch(e) {} },
        function() { el.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, cancelable: true, button: 0})); el.dispatchEvent(new MouseEvent("mouseup", {bubbles: true, button: 0})); el.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, button: 0})); },
        function() { el.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, cancelable: true, pointerId: 1})); el.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 1})); },
        function() { el.dispatchEvent(new PointerEvent("click", {bubbles: true, cancelable: true})); }
      ];
      for (var i = 0; i < methods.length; i++) {
        try { methods[i](); } catch(e) {}
      }
    }

    // Stage 1: 按优先级找发送按钮并点击
    var sendButtons = findAllSendButtons();
    for (var i = 0; i < sendButtons.length && i < 5; i++) {
      clickElement(sendButtons[i].el);
      console.log("[CT] tried send btn:", sendButtons[i].tag, "score:", sendButtons[i].score);
    }

    // Stage 2: 尝试右下角所有按钮
    var bottomBtns = findBottomRightClickables();
    for (var i = 0; i < bottomBtns.length && i < 5; i++) {
      clickElement(bottomBtns[i].el);
      console.log("[CT] tried bottom btn:", bottomBtns[i].el.tagName, "cls:", (bottomBtns[i].el.className||"").slice(0,30));
    }

    // Stage 3: 发送Enter键
    inputEl.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true}));
    inputEl.dispatchEvent(new KeyboardEvent("keypress", {key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true}));
    inputEl.dispatchEvent(new KeyboardEvent("keyup", {key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true}));
    console.log("[CT] tried Enter key");

    // Stage 4: contenteditable插入换行触发发送
    if (inputEl.isContentEditable) {
      try {
        document.execCommand("insertText", false, "\n");
        inputEl.dispatchEvent(new Event("input", {bubbles: true}));
        inputEl.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", code: "Enter", keyCode: 13, bubbles: true}));
        console.log("[CT] tried insertText newline");
      } catch(e) {}
    }

    // Stage 5: 尝试直接调用React的__reactProps
    try {
      var key = Object.keys(inputEl).find(function(k) { return k.indexOf("__reactProps") >= 0 || k.indexOf("__reactEvent") >= 0 || k.indexOf("__reactFiber") >= 0; });
      if (key) {
        var props = inputEl[key];
        if (props && props.onKeyDown) {
          var fakeEvent = {key: "Enter", keyCode: 13, which: 13, target: inputEl, currentTarget: inputEl, bubbles: true, preventDefault: function(){}, stopPropagation: function(){}};
          props.onKeyDown(fakeEvent);
          console.log("[CT] tried React onKeyDown");
        }
      }
    } catch(e) { console.log("[CT] React prop error:", e.message); }

    // Stage 6: 类名带send/fabu的button全部点击
    try {
      var allButtons = document.querySelectorAll("button[class*=send], button[class*=fabu], button[class*=btn], [class*=send-btn], [class*=send_btn], [class*=chat-send], [class*=chatSend]");
      for (var i = 0; i < allButtons.length; i++) {
        var r = allButtons[i].getBoundingClientRect();
        if (r.width > 20 && r.height > 20) { clickElement(allButtons[i]); console.log("[CT] tried class-based btn"); }
      }
    } catch(e) {}

    // Phase 7: 终极方案 - 遍历DOM找发送按钮
    try {
      // 找输入框右下角所有可能的发送按钮
      var ir = inputEl.getBoundingClientRect();
      var viewH = window.innerHeight;
      var viewW = window.innerWidth;
      
      // 搜索发送图标区域 (右下角)
      var allElements = document.querySelectorAll("span, i, button, div, svg");
      for (var ci = 0; ci < allElements.length; ci++) {
        var cel = allElements[ci];
        var cr = cel.getBoundingClientRect();
        // 在输入框附近右下角
        if (cr.width < 10 || cr.height < 10) continue;
        if (cr.top < ir.top - 80 || cr.top > ir.bottom + 60) continue;
        if (cr.left < viewW * 0.6) continue;
        
        var ctag = cel.tagName.toLowerCase();
        var ccls = (cel.className || "").toLowerCase();
        var ctitle = (cel.title || cel.getAttribute("aria-label") || "").toLowerCase();
        
        // 尝试点击所有有可能是发送按钮的元素
        if (ccls.indexOf("send") >= 0 || ccls.indexOf("fabu") >= 0 || ccls.indexOf("chat") >= 0 || ccls.indexOf("send") >= 0 || ccls.indexOf("btn") >= 0 || ctag === "button" || ctag === "i" || ctag === "svg") {
          // 多种点击方式
          try { cel.click(); } catch(e) {}
          cel.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, button: 0}));
          cel.dispatchEvent(new MouseEvent("mouseup", {bubbles: true, button: 0}));
          cel.dispatchEvent(new MouseEvent("click", {bubbles: true, button: 0}));
          cel.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, pointerId: 1}));
          cel.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 1}));
          
          // 如果SVG图标有父级button, 也点击
          if (ctag === "svg" || ctag === "i") {
            var parentBtn = cel.closest("button, [role=button], a") || cel.parentElement;
            if (parentBtn) {
              try { parentBtn.click(); } catch(e) {}
              parentBtn.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, button: 0}));
              parentBtn.dispatchEvent(new MouseEvent("mouseup", {bubbles: true, button: 0}));
              parentBtn.dispatchEvent(new MouseEvent("click", {bubbles: true, button: 0}));
            }
          }
        }
      }
    } catch(e) { console.log("[CT] Phase 7 error:", e.message); }

    await sleep(2000 + rand(0, 1000));
    console.log("[CT] send done");
    return true;
  }

  // ===== 读取聊天 =====
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



