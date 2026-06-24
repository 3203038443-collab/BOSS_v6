// BOSS直聘助手 v6.1 - Background Service Worker
// WebSocket桥接: Python服务器 <-> BOSS页面内容脚本

var ws = null;
var wsDebugPort = 9876;
var keepAliveInterval = null;
var reconnectTimer = null;
var wsRetryCount = 0;
var isConnecting = false;
var hostUrlPattern = "*://*.zhipin.com/*";

function log(msg) {
  console.log("[BG] " + msg);
}

function sendToServer(msg) {
  if (ws && ws.readyState === 1) {
    try {
      var data = typeof msg === 'string' ? msg : JSON.stringify(msg);
      ws.send(data);
    } catch(e) {}
  }
}

function tryInjectAndSend(tabId, msg, callback) {
  chrome.tabs.sendMessage(tabId, msg, function(resp) {
    if (chrome.runtime.lastError) {
      // 注入内容脚本后重试
      chrome.scripting.executeScript({
        target: {tabId: tabId},
        files: ["content.js"]
      }, function() {
        if (chrome.runtime.lastError) {
          if (callback) callback(false);
          return;
        }
        setTimeout(function() {
          chrome.tabs.sendMessage(tabId, msg, function(resp2) {
            if (chrome.runtime.lastError) {
              if (callback) callback(false);
            } else if (resp2) {
              sendToServer(resp2);
              if (callback) callback(true);
            }
          });
        }, 500);
      });
    } else if (resp) {
      sendToServer(resp);
      if (callback) callback(true);
    }
  });
}

function forwardCmdToContent(msg) {
  var sent = false;
  var callback = function(success) { if (!success && !sent) sent = success; };

  chrome.tabs.query({url: hostUrlPattern}, function(tabs) {
    if (!tabs || tabs.length === 0) {
      // 尝试更宽泛匹配
      chrome.tabs.query({}, function(allTabs) {
        var bossTabs = [];
        for (var i = 0; i < allTabs.length; i++) {
          var url = allTabs[i].url || '';
          if (url.indexOf('zhipin.com') >= 0) {
            bossTabs.push(allTabs[i]);
          }
        }
        if (bossTabs.length === 0) {
          sendToServer({type: "error", data: "no_boss_tab_found"});
          return;
        }
        for (var j = 0; j < bossTabs.length; j++) {
          tryInjectAndSend(bossTabs[j].id, msg, callback);
        }
      });
      return;
    }
    for (var i = 0; i < tabs.length; i++) {
      tryInjectAndSend(tabs[i].id, msg, callback);
    }
  });
}

// 内容脚本消息(connected, ping) -> 服务器
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg && msg.type === 'ping') {
    sendResponse({pong: true});
    return false;
  }
  
  sendToServer(msg);
  
  if (sender && sender.tab) {
    sendToServer({type: "_tab_info", data: {tabId: sender.tab.id, url: sender.tab.url}});
  }
  return false;
});

function connect() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    ws = new WebSocket('ws://127.0.0.1:' + wsDebugPort);

    ws.onopen = function() {
      log('已连接服务器');
      wsRetryCount = 0;
      isConnecting = false;
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      keepAliveInterval = setInterval(function() {
        if (ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify({type: 'ping'})); } catch(e) {}
        }
      }, 20000);
      // 连接后广播ping到标签页
      forwardCmdToContent({cmd: "ping", params: {}});
    };

    ws.onclose = function() {
      log('连接断开, ' + Math.min(3 + wsRetryCount * 2, 15) + '秒后重连');
      ws = null;
      isConnecting = false;
      wsRetryCount++;
      if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, Math.min(3000 + wsRetryCount * 2000, 15000));
    };

    ws.onerror = function() {
      log('连接错误');
      isConnecting = false;
      if (ws) try { ws.close(); } catch(e) {}
    };

    ws.onmessage = function(e) {
      try {
        var msg = JSON.parse(e.data);
        log("收到命令: " + msg.cmd);

        if (msg.cmd === 'ping_test') {
          sendToServer({type: 'pong', data: 'ok'});
          return;
        }

        forwardCmdToContent(msg);
      } catch(ex) {
        log("解析消息失败: " + ex.message);
        sendToServer({type: 'error', data: 'parse_failed:' + ex.message});
      }
    };
  } catch(e) {
    log("创建WebSocket失败: " + e.message);
    isConnecting = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 3000);
  }
}

chrome.alarms.create('keepalive', {periodInMinutes: 0.25});
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'keepalive') {
    if (ws && ws.readyState !== 1) {
      log('保活检查: WebSocket断开, 尝试重连');
      connect();
    }
  }
});

connect();
log('后台服务已就绪 v6.1');
