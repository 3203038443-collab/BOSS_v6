# -*- coding: utf-8 -*-
import random, struct
"""BOSS直聘半自动助手v6.0 - 最终稳定版"""
import asyncio, json, sys, subprocess, time, os
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_DIR = SCRIPT_DIR.parent
EXT_PATH = str(PROJECT_DIR / "boss_extension")
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
USER_DATA_DIR = str(SCRIPT_DIR / "chrome_profile")
BOSS_URL = "https://www.zhipin.com/web/chat/index"
WS_PORT = 9876
sys.path.insert(0, str(SCRIPT_DIR))
import websockets

if sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except:
        pass

TEMPLATES = {
    "1": "您好，看到您对这个岗位感兴趣，方便先简单了解一下您的情况吗？",
    "2": "方便发一份简历过来吗？我看一下您的经历是否匹配。",
    "3": "看了您的简历，觉得挺适合的，方便约个时间聊聊吗？",
    "4": "感谢您的关注，目前不太匹配，祝您早日找到合适的工作！",
    "5": "您好，之前有给您发过消息，不知道您是否还有意向呢？"
}

class Bot:
    def __init__(self):
        self.ws = None
        self.connected = False
        self.candidates = []
        self.actions = 0
        self.max_actions = 15
        self.loop = None
        self.server = None
        self.page_title = ""
        self.min_delay = 4
        self.max_delay = 10

    def rand_delay(self):
        return random.uniform(self.min_delay, self.max_delay)

    async def handler(self, websocket):
        self.ws = websocket
        self.connected = True
        print()
        print("  [OK] 扩展已连接")
        try:
            async for msg in websocket:
                data = json.loads(msg)
                t = data.get("type", "")
                d = data.get("data", {})
                if t == "candidates":
                    self.candidates = d.get("candidates", [])
                    print()
                    print("  " + "=" * 45)
                    print("  扫描到 " + str(len(self.candidates)) + " 个候选人:")
                    print("  " + "=" * 45)
                    for i, c in enumerate(self.candidates, 1):
                        u = " [新消息]" if c.get("has_unread") else ""
                        print("    " + str(i).rjust(2) + ". " + c.get("name", "?") + u)
                    if not self.candidates:
                        print("  (未找到候选人，可能页面结构变化)")
                elif t == "chat_content":
                    txt = d.get("full_text", "")[:200]
                    if txt:
                        print()
                        print("  [聊天内容] " + txt[:120])
                elif t == "detail":
                    print()
                    print("  === 页面诊断 ===")
                    print("  标题: " + str(d.get("title", "?")))
                    print("  正文: " + str(d.get("bodyLength", 0)) + "字符")
                    print("  [元素]")
                    for el in d.get("elements", [])[:15]:
                        t2 = el.get("text", "")
                        if t2.strip():
                            m = ">" if el.get("clickable") else " "
                            print("    " + m + " <" + el.get("tag","") + "> " + t2[:40])
                    ins = d.get("inputs", [])
                    if ins:
                        print("  [输入框]")
                        for inp in ins:
                            print("    <" + inp.get("tag","") + "> " + inp.get("placeholder","?"))
                    else:
                        print("  [输入框] 未找到")
                    print("  ===============")
                elif t == "status":
                    s = d
                    if isinstance(s, str):
                        if "sent" in s:
                            self.actions += 1
                            print("  [OK] 已发送(第" + str(self.actions) + "次)")
                        elif "clicked" in s:
                            print("  [OK] 已点击")
                        elif "error" in s:
                            print("  [!] " + s)
                        else:
                            print("  [i] " + s)
                elif t == "error":
                    s = d
                    if isinstance(s, str):
                        print("  [错误] " + s)
                    else:
                        print("  [错误] " + str(s))
                elif t == "connected":
                 self.page_title = d.get("title", "")
                 print("  页面: " + self.page_title[:40])
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print("  [!] 消息异常: " + str(e)[:60])
        finally:
            self.connected = False
            print()
            print("  [!] 连接已断开")

    async def cmd(self, cmd, params=None):
        if not self.ws: return
        m = {"cmd": cmd}
        if params: m["params"] = params
        try:
            await self.ws.send(json.dumps(m))
        except Exception as e:
            print("  [!] 发送失败: " + str(e)[:40])

    async def async_input(self, prompt=""):
        return await self.loop.run_in_executor(None, lambda: input(prompt))

    async def run(self):
        self.loop = asyncio.get_event_loop()
        print()
        print("=" * 55)
        print("  BOSS直聘 半自动助手 v6.0")
        print("=" * 55)
        print()
        print("[1/3] 准备Chrome...")
        try:
            subprocess.run(["taskkill", "/f", "/im", "chrome.exe"], capture_output=True, timeout=5)
            time.sleep(2)
        except:
            pass
        try:
            subprocess.Popen([CHROME_PATH, "--load-extension=" + EXT_PATH,
                "--user-data-dir=" + USER_DATA_DIR, BOSS_URL,
                "--disable-session-crashed-bubble", "--no-first-run", "--new-window"], shell=False)
            print("  Chrome已启动(扩展已加载)")
        except Exception as e:
            print("  [!] Chrome启动失败: " + str(e))
            return

        print()
        print("[2/3] 等待扩展连接...")
        self.server = await websockets.serve(self.handler, "127.0.0.1", WS_PORT)
        for i in range(60):
            if self.connected:
                break
            if i == 30:
                print("  提示: 检查扩展是否加载")
            await asyncio.sleep(1)

        if not self.connected:
            print()
            print("  [!] 扩展未连接!")
            print("  请打开 chrome://extensions/ 检查扩展是否启用")
            input("  按 Enter 继续等待...")
            for i in range(30):
                if self.connected:
                    break
                await asyncio.sleep(1)
            if not self.connected:
                print("  仍然未连接")
                self.server.close()
                return

        print()
        print("[3/3] 就绪!")
        while True:
            print()
            print("  操作: " + str(self.actions) + "/" + str(self.max_actions))
            print("  1.扫描候选人  2.打开对话")
            print("  3.发送模板    4.自定义回复")
            print("  5.批量回复    6.查看聊天")
            print("  7.页面诊断    8.编辑话术")
            print("  9.测试连接    0.退出")
            c = (await self.async_input("  选择: ")).strip()

            if c == "0":
                break
            elif c == "1":
                await self.cmd("scan_candidates")
                await asyncio.sleep(3)
            elif c == "7":
                await self.cmd("scan_detail")
                await asyncio.sleep(2)
            elif c == "6":
                await self.cmd("read_chat")
                await asyncio.sleep(1.5)
            elif c == "2":
                if not self.candidates:
                    await self.cmd("scan_candidates")
                    await asyncio.sleep(3)
                if self.candidates:
                    for i, ca in enumerate(self.candidates, 1):
                        u = " [新]" if ca.get("has_unread") else ""
                        print("  " + str(i) + ". " + ca.get("name", "?") + u)
                    s = (await self.async_input("  序号: ")).strip()
                    if s.isdigit() and 1 <= int(s) <= len(self.candidates):
                        n = self.candidates[int(s) - 1].get("name", "")
                        await self.cmd("click_candidate", {"name": n})
                        await asyncio.sleep(3)
                        await self.cmd("read_chat")
                        await asyncio.sleep(1.5)
            elif c == "9":
                print("  测试ping...")
                await self.cmd("ping_test")
                await asyncio.sleep(2)
            elif c == "3":
                for k, v in TEMPLATES.items():
                    print("  " + k + ". " + v[:40] + "...")
                s = (await self.async_input("  模板: ")).strip()
                if s in TEMPLATES:
                    ok = (await self.async_input("  确认? (y/n): ")).strip().lower()
                    if ok == "y":
                        await self.cmd("send_message", {"text": TEMPLATES[s]})
                        await asyncio.sleep(3)
            elif c == "4":
                t = (await self.async_input("  内容: ")).strip()
                if t:
                    ok = (await self.async_input("  确认? (y/n): ")).strip().lower()
                    if ok == "y":
                        await self.cmd("send_message", {"text": t})
                        await asyncio.sleep(3)
            elif c == "5":
                if not self.candidates:
                    await self.cmd("scan_candidates")
                    await asyncio.sleep(3)
                if not self.candidates:
                    continue
                for k, v in TEMPLATES.items():
                print("  " + k + ". " + v[:40] + "...")
                print("  1.全部发送  2.仅未回复")
                sc = (await self.async_input("  选择(1/2): ")).strip()
                s = (await self.async_input("  模板: ")).strip()
                if s not in TEMPLATES: continue
                ok = (await self.async_input("  确认? (y/n): ")).strip().lower()
                if ok != "y": continue
                total = len(self.candidates)
                sent_cnt = 0
                for i, ca in enumerate(self.candidates):
                if self.actions >= self.max_actions: break
                name = ca.get("name", "")
                if not name: continue
                if sc == "2":                last_msg = ca.get("last_msg", "").strip()                if last_msg:                skip = False                for tk in TEMPLATES:                tv = TEMPLATES[tk]                if tv[:15] in last_msg or last_msg[:15] in tv:                skip = True; break                if skip:                print("  " + "[" + str(i+1) + "/" + str(total) + "] " + name + " - \u5df2\u53d1\u8fc7\u8df3\u8fc7")                continue
                print("  " + "[" + str(i+1) + "/" + str(total) + "] " + name)
                await self.cmd("click_candidate", {"name": name})
                await asyncio.sleep(self.rand_delay())
                await self.cmd("send_message", {"text": TEMPLATES[s]})
                await asyncio.sleep(self.rand_delay())
                sent_cnt += 1
                self.actions += 1
                print("  \u5df2\u53d1\u9001: " + str(sent_cnt) + "/" + str(total))                    if self.actions >= self.max_actions:
                        break
                    name = ca.get("name", "")
                    if not name:
                        continue
                    print("  [" + str(i + 1) + "/" + str(len(self.candidates)) + "] " + name)
                    await self.cmd("click_candidate", {"name": name})
                    await asyncio.sleep(4)
                    await self.cmd("send_message", {"text": TEMPLATES[s]})
                    await asyncio.sleep(self.rand_delay())
            elif c == "8":
                print("  话术模板:")
                for k, v in TEMPLATES.items():
                    print("  " + k + ". " + v[:50] + "...")
            else:
                print("  输入0-9")
        self.server.close()

if __name__ == "__main__":
    try:
        asyncio.run(Bot().run())
    except KeyboardInterrupt:
        print()
        print("  Bye!")
    except Exception as e:
        print()
        print("  [错误] " + str(e))
        input("  按Enter退出...")
