// BOSS直聘助手 v6.0 - Background Service Worker
// WebSocket桥接: Python服务器 <-> BOSS页面内容脚本

var ws = null;
var keepAliveInterval = null;
var reconnectTimer = null;
var wsRetryCount = 0;

function connect() {
    try {
        ws = new WebSocket('ws://127.0.0.1:9876');
        ws.onopen = function() {
            console.log('[BG] 已连接服务器');
            wsRetryCount = 0;
            if (keepAliveInterval) clearInterval(keepAliveInterval);
            keepAliveInterval = setInterval(function() {
                if (ws && ws.readyState === 1) {
                    try { ws.send(JSON.stringify({type: 'ping'})); } catch(e) {}
                }
            }, 20000);
        };
        ws.onclose = function() {
            console.log('[BG] 连接断开，' + Math.min(3 + wsRetryCount * 2, 15) + '秒后重连');
            ws = null;
            wsRetryCount++;
            if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connect, Math.min(3000 + wsRetryCount * 2000, 15000));
        };
        ws.onerror = function() {
            console.log('[BG] 连接错误');
            if (ws) try { ws.close(); } catch(e) {}
        };
        ws.onmessage = function(e) {
            try {
                var msg = JSON.parse(e.data);
                console.log('[BG] 收到命令:', msg.cmd);
                
                if (msg.cmd === 'ping_test') {
                    // Simple test: just respond directly
                    if (ws && ws.readyState === 1) {
                        ws.send(JSON.stringify({type: 'pong', data: 'ok'}));
                        console.log('[BG] ping_test response sent');
                    }
                    return;
                }
                
                chrome.tabs.query({url: '*://*.zhipin.com/*'}, function(tabs) {
                    if (tabs && tabs.length > 0) {
                        var totalSent = 0;
                        var totalErrors = 0;
                        for (var i = 0; i < tabs.length; i++) {
                            (function(tabId) {
                                chrome.tabs.sendMessage(tabId, msg, function(resp) {
                                    if (chrome.runtime.lastError) {
                                        totalErrors++;
                                        console.log("[BG] sendMessage error:", chrome.runtime.lastError.message);
                                        if (ws && ws.readyState === 1) {
                                            try { ws.send(JSON.stringify({type: "error", data: "bg_error:" + chrome.runtime.lastError.message})); } catch(e) {}
                                        }
                                    } else if (resp) {
                                        totalSent++;
                                        console.log("[BG] 收到响应:", JSON.stringify(resp).slice(0, 60));
                                        if (ws && ws.readyState === 1) {
                                            try { ws.send(JSON.stringify(resp)); } catch(e) {
                                                console.log("[BG] ws.send error:", e);
                                            }
                                        }
                                    }
                                });
                            })(tabs[i].id);
                        }
                        console.log('[BG] 命令 ' + msg.cmd + ' 发送到 ' + tabs.length + ' 个标签, 成功: ' + totalSent + ', 失败: ' + totalErrors);
                    } else {
                        console.log('[BG] 未找到BOSS直聘标签页');
                        if (ws && ws.readyState === 1) {
                            ws.send(JSON.stringify({type: 'error', data: 'no_boss_tab_found'}));
                        }
                    }
                });
            } catch(ex) {
                console.log('[BG] 解析消息失败:', ex);
                if (ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({type: 'error', data: 'parse_failed:' + ex.message}));
                }
            }
        };
    } catch(e) {
        console.log('[BG] 创建WebSocket失败:', e);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 3000);
    }
}

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg && msg.type === 'ping') {
        sendResponse({pong: true});
        return false;
    }
    if (ws && ws.readyState === 1) {
        try { ws.send(JSON.stringify(msg)); } catch(e) {}
    }
    return false;
});

chrome.alarms.create('keepalive', {periodInMinutes: 0.25});
chrome.alarms.onAlarm.addListener(function(alarm) {
    if (alarm.name === 'keepalive') {
        if (ws && ws.readyState !== 1) {
            console.log('[BG] 保活检查: WebSocket断开，尝试重连');
            connect();
        }
    }
});

connect();
console.log('[BG] BOSS直聘助手后台服务已就绪 v6.0');
