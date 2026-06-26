# -*- coding: utf-8 -*-
import random
"""BOSS直聘半自动助手v6.0 - 最终稳定版"""
import asyncio, json, sys, subprocess, time, os
from pathlib import Path
import socket
from collections import OrderedDict

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_DIR = SCRIPT_DIR.parent
EXT_PATH = str(PROJECT_DIR / "boss_extension")
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
USER_DATA_DIR = str(SCRIPT_DIR / "chrome_profile")
BOSS_URL = "https://www.zhipin.com/web/chat/index"
COMM_URL = "https://www.zhipin.com/web/chat/index"
RECOMMEND_URL = "https://www.zhipin.com/web/chat/recommend"
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
        self.clients = {}
        self.connected = False
        self.candidates = []
        self.recommend_candidates = []
        self.recommend_groups = {}
        self.last_read_status = None
        self.actions = 0
        self.max_actions = 15
        self.loop = None
        self.server = None
        self.min_delay = 4
        self.max_delay = 10
        self.page_title = ""
        self.page_url = ""
        self.last_detail = None
        self.recommend_scan_best_score = None
        self.recommend_scan_debug = ""
        self.recommend_card_samples = []

    def frame_meta(self, websocket=None, payload=None):
        meta = {}
        if websocket in self.clients:
            meta.update(self.clients[websocket].get("meta", {}))
        if payload and isinstance(payload, dict):
            meta.update(payload)
        return meta

    def update_client_meta(self, websocket, payload=None):
        if websocket not in self.clients:
            self.clients[websocket] = {"meta": {}, "last_detail": None}
        if payload and isinstance(payload, dict):
            self.clients[websocket]["meta"].update(payload)

    def select_client(self, purpose="default", require_top=False):
        alive = list(self.clients.keys())
        if not alive:
            return self.ws
        best_ws = None
        best_score = None
        for websocket in alive:
            client = self.clients.get(websocket, {})
            meta = client.get("meta", {})
            detail = client.get("last_detail") or {}
            is_top = 1 if meta.get("is_top_frame") else 0
            body_length = int(detail.get("bodyLength", meta.get("body_length", 0)) or 0)
            url = str(meta.get("frame_url") or meta.get("url") or "")
            recommend_hit = 1 if url.startswith(RECOMMEND_URL) else 0
            current_hit = 1 if url.startswith(self.page_url or "") and self.page_url else 0
            if purpose == "recommend":
                score = (recommend_hit, body_length, -is_top)
            elif purpose == "detail":
                score = (current_hit, body_length, -is_top)
            else:
                score = (is_top, current_hit, body_length)
            if require_top and not is_top:
                continue
            if best_score is None or score > best_score:
                best_ws = websocket
                best_score = score
        if best_ws:
            return best_ws
        return self.ws

    def reset_recommend_scan_state(self):
        self.recommend_candidates = []
        self.recommend_groups = {}
        self.recommend_scan_best_score = None
        self.recommend_scan_debug = ""
        self.recommend_card_samples = []

    def recommend_response_score(self, websocket, payload):
        candidates = payload.get("candidates", []) if isinstance(payload, dict) else []
        groups = payload.get("groups", {}) if isinstance(payload, dict) else {}
        client = self.clients.get(websocket, {})
        meta = client.get("meta", {})
        detail = client.get("last_detail") or {}
        body_length = int(detail.get("bodyLength", meta.get("body_length", 0)) or 0)
        is_top = 1 if meta.get("is_top_frame") else 0
        group_total = 0
        if isinstance(groups, dict):
            for items in groups.values():
                if isinstance(items, list):
                    group_total += len(items)
        return (len(candidates), group_total, body_length, -is_top)

    def record_recommend_scan_response(self, websocket, payload):
        if not isinstance(payload, dict):
            return False
        score = self.recommend_response_score(websocket, payload)
        if self.recommend_scan_best_score is not None and score <= self.recommend_scan_best_score:
            return False
        self.recommend_scan_best_score = score
        self.recommend_candidates = payload.get("candidates", [])
        self.recommend_groups = payload.get("groups", {})
        self.recommend_scan_debug = str(payload.get("debug", "") or "")
        self.recommend_card_samples = payload.get("card_samples", []) if isinstance(payload.get("card_samples", []), list) else []
        return True

    def cleanup_port(self):
        try:
            cmd = [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-NetTCPConnection -LocalPort " + str(WS_PORT) + " -ErrorAction SilentlyContinue | "
                "Select-Object -ExpandProperty OwningProcess -Unique | "
                "ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
            ]
            subprocess.run(cmd, capture_output=True, timeout=8)
            time.sleep(1)
        except Exception:
            pass

    def port_available(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind(("127.0.0.1", WS_PORT))
            return True
        except OSError:
            return False
        finally:
            try:
                sock.close()
            except Exception:
                pass

    def get_status_label(self, cand):
        if cand.get("has_read"):
            return "【已读】"
        if cand.get("has_unread"):
            return "【新消息】"
        return "【未读】"

    def page_matches(self, url_prefix=None, need_recommend_signals=False):
        detail = getattr(self, "last_detail", None) or {}
        detail_url = str(detail.get("url") or "")
        detail_title = str(detail.get("title") or "")
        current_url = str(self.page_url or "")
        current_title = str(self.page_title or "")
        if url_prefix and ((current_url and current_url.startswith(url_prefix)) or (detail_url and detail_url.startswith(url_prefix))):
            return True
        if need_recommend_signals:
            merged_title = detail_title + " " + current_title
            if "推荐" in merged_title:
                return True
            for el in detail.get("elements", []):
                txt = (el.get("text") or "").strip()
                if txt in ("推荐", "精选", "最新", "打招呼"):
                    return True
        return False

    async def wait_for_page_ready(self, url_prefix=None, timeout_seconds=20, min_body_len=200, need_recommend_signals=False):
        deadline = time.monotonic() + timeout_seconds
        last_detail = None
        while time.monotonic() < deadline:
            last_detail = getattr(self, "last_detail", None)
            if self.page_matches(url_prefix, need_recommend_signals):
                if last_detail and last_detail.get("bodyLength", 0) >= min_body_len:
                    return True
                if need_recommend_signals and last_detail and last_detail.get("bodyLength", 0) >= 120:
                    return True
            await self.cmd("scan_detail")
            await asyncio.sleep(1)
        return False

    def filter_candidates(self, mode):
        if mode == "read":
            return [c for c in self.candidates if c.get("has_read")]
        if mode == "unread":
            return [c for c in self.candidates if not c.get("has_read")]
        return list(self.candidates)

    def resolve_comm_batch_targets(self, choice):
        if choice == "2":
            return self.filter_candidates("unread"), "沟通页未读名单"
        if choice == "3":
            return self.filter_candidates("read"), "沟通页已读名单"
        return list(self.candidates), "沟通页全部名单"

    def print_candidate_list(self, items, title):
        print()
        print("  " + "=" * 45)
        print("  " + title + " " + str(len(items)) + " 人:")
        print("  " + "=" * 45)
        for i, c in enumerate(items, 1):
            print("    " + str(i).rjust(2) + ". " + c.get("name", "?") + self.get_status_label(c))
        if not items:
            print("  (空)")

    def format_recommend_candidate(self, cand):
        parts = []
        location = cand.get("location", "").strip()
        intent = cand.get("intent", "").strip()
        if location or intent:
            parts.append((location + (" " if location and intent else "") + intent).strip())
        school = cand.get("school", "").strip()
        if school:
            parts.append(school)
        major = cand.get("major", "").strip()
        if major:
            parts.append(major)
        degree = cand.get("degree", "").strip()
        if degree and degree not in major:
            parts.append(degree)
        if not parts:
            parts.append("推荐牛人")
        return cand.get("name", "?") + "【" + "｜".join(parts) + "】"

    def print_recommend_candidate_list(self, items, title):
        print()
        print("  " + "=" * 45)
        print("  " + title + " " + str(len(items)) + " 人:")
        print("  " + "=" * 45)
        for i, c in enumerate(items, 1):
            print("    " + str(i).rjust(2) + ". " + self.format_recommend_candidate(c))
        if not items:
            print("  (空)")

    def print_recommend_name_list(self, items, title):
        print()
        print("  " + "=" * 45)
        print("  " + title + " " + str(len(items)) + " 人")
        print("  " + "=" * 45)
        for i, c in enumerate(items, 1):
            print("    " + str(i).rjust(2) + ". " + c.get("name", "?"))
        if not items:
            print("  (空)")

    def print_recommend_groups(self):
        print()
        print("  " + "=" * 45)
        print("  推荐牛人岗位分类:")
        print("  " + "=" * 45)
        groups = sorted(self.recommend_groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))
        for i, (intent, items) in enumerate(groups, 1):
            print("    " + str(i).rjust(2) + ". " + intent + " (" + str(len(items)) + "人)")
        if not groups:
            print("  (空)")

    def normalize_group_label(self, value, fallback):
        value = str(value or "").strip()
        return value if value else fallback

    def build_recommend_groups_by(self, items, mode):
        groups = OrderedDict()
        for cand in items:
            if mode == "intent":
                key = self.normalize_group_label(cand.get("intent", ""), "未标注意向")
            elif mode == "location":
                key = self.normalize_group_label(cand.get("location", ""), "未标注地点")
            elif mode == "degree":
                key = self.normalize_group_label(cand.get("degree", ""), "未标注学历")
            elif mode == "school":
                key = self.normalize_group_label(cand.get("school", ""), "未标注学校")
            else:
                key = "全部"
            groups.setdefault(key, []).append(cand)
        return sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))

    def print_recommend_groups_by(self, groups, title):
        print()
        print("  " + "=" * 45)
        print("  " + title)
        print("  " + "=" * 45)
        for i, (label, items) in enumerate(groups, 1):
            print("    " + str(i).rjust(2) + ". " + label + " (" + str(len(items)) + "人)")
        if not groups:
            print("  (空)")

    def filter_recommend_by_keyword(self, items, keyword):
        keyword = str(keyword or "").strip().lower()
        if not keyword:
            return list(items)
        result = []
        for cand in items:
            haystack = " ".join([
                cand.get("name", ""),
                cand.get("location", ""),
                cand.get("intent", ""),
                cand.get("school", ""),
                cand.get("major", ""),
                cand.get("degree", "")
            ]).lower()
            if keyword in haystack:
                result.append(cand)
        return result

    def parse_index_selection(self, raw, max_len):
        selected = set()
        for part in str(raw or "").split(","):
            token = part.strip()
            if not token:
                continue
            if "-" in token:
                start_text, end_text = token.split("-", 1)
                if not start_text.strip().isdigit() or not end_text.strip().isdigit():
                    return None
                start = int(start_text.strip())
                end = int(end_text.strip())
                if start > end or start < 1 or end > max_len:
                    return None
                for value in range(start, end + 1):
                    selected.add(value)
            else:
                if not token.isdigit():
                    return None
                value = int(token)
                if value < 1 or value > max_len:
                    return None
                selected.add(value)
        return selected

    async def choose_recommend_targets(self):
        current_items = list(self.recommend_candidates)
        while True:
            self.print_recommend_candidate_list(current_items, "当前推荐名单")
            print("  1.按意向分类  2.按地点分类")
            print("  3.按学历分类  4.按学校分类")
            print("  5.关键词筛选  6.手动排除")
            print("  7.重置名单    8.确认发送")
            print("  0.返回")
            sc = (await self.async_input("  选择: ")).strip()
            if sc == "0":
                return None
            if sc == "8":
                return current_items
            if sc == "7":
                current_items = list(self.recommend_candidates)
                continue
            if sc in ("1", "2", "3", "4"):
                mode_map = {
                    "1": ("intent", "按意向分类"),
                    "2": ("location", "按地点分类"),
                    "3": ("degree", "按学历分类"),
                    "4": ("school", "按学校分类"),
                }
                mode, title = mode_map[sc]
                groups = self.build_recommend_groups_by(current_items, mode)
                self.print_recommend_groups_by(groups, title)
                if not groups:
                    continue
                pick = (await self.async_input("  分类序号: ")).strip()
                if not pick.isdigit() or not (1 <= int(pick) <= len(groups)):
                    continue
                current_items = list(groups[int(pick) - 1][1])
                continue
            if sc == "5":
                keyword = (await self.async_input("  关键词: ")).strip()
                filtered = self.filter_recommend_by_keyword(current_items, keyword)
                if not filtered:
                    print("  [i] 未匹配到结果")
                    continue
                current_items = filtered
                continue
            if sc == "6":
                if not current_items:
                    continue
                raw = (await self.async_input("  排除序号(如 1,3,5-7): ")).strip()
                selected = self.parse_index_selection(raw, len(current_items))
                if selected is None:
                    print("  [i] 序号格式无效")
                    continue
                current_items = [cand for i, cand in enumerate(current_items, 1) if i not in selected]
                continue

    async def ensure_recommend_candidates(self):
        self.reset_recommend_scan_state()
        await self.wait_for_page_ready(RECOMMEND_URL, timeout_seconds=20, min_body_len=500, need_recommend_signals=True)
        await self.cmd("scan_recommend_candidates")
        for _ in range(6):
            await asyncio.sleep(1)
            if self.recommend_candidates:
                return True
        return bool(self.recommend_candidates)

    async def navigate_and_wait(self, url, wait_seconds=6):
        self.connected = False
        self.page_title = ""
        self.page_url = ""
        self.last_detail = None
        await self.cmd("navigate_page", {"url": url})
        for _ in range(wait_seconds * 4):
            await asyncio.sleep(0.5)
            if self.connected and self.page_matches(url, "recommend" in url):
                break
        ready = await self.wait_for_page_ready(url, timeout_seconds=15, min_body_len=500, need_recommend_signals=("recommend" in url))
        await asyncio.sleep(1.5)
        if ready:
            return True
        if self.page_matches(url, "recommend" in url):
            print("  [i] 页面已切换，继续尝试扫描")
            return True
        return False

    async def ensure_candidates(self):
        if self.candidates:
            return True
        await self.cmd("scan_candidates")
        await asyncio.sleep(3)
        return bool(self.candidates)

    async def ensure_comm_candidates(self, force_refresh=False):
        if force_refresh:
            self.candidates = []
        ok_nav = await self.navigate_and_wait(COMM_URL)
        if not ok_nav:
            print("  [!] 未成功切换到沟通页面")
            return False
        await self.cmd("scan_candidates")
        await asyncio.sleep(3)
        return bool(self.candidates)

    async def choose_comm_batch_targets(self):
        if not await self.ensure_comm_candidates(force_refresh=True):
            return None
        read_items = self.filter_candidates("read")
        unread_items = self.filter_candidates("unread")
        print("  1.全部发送")
        print("  2.仅未读发送 (" + str(len(unread_items)) + "人)")
        print("  3.仅已读发送 (" + str(len(read_items)) + "人)")
        sc = (await self.async_input("  选择: ")).strip()
        if sc not in ("1", "2", "3"):
            return None
        target_candidates, title = self.resolve_comm_batch_targets(sc)
        self.print_candidate_list(target_candidates, title)
        if not target_candidates:
            print("  [i] 当前分组没有可发送的人，请切换为其他分组")
            return None
        return target_candidates

    async def choose_target_candidate(self, title="选择发送对象"):
        if not await self.ensure_candidates():
            return None
        print("  1.当前已打开对话  2.从已读中选")
        print("  3.从未读中选      4.从全部中选")
        sc = (await self.async_input("  选择: ")).strip()
        if sc == "1":
            return {"mode": "current", "name": ""}
        if sc == "2":
            items = self.filter_candidates("read")
        elif sc == "3":
            items = self.filter_candidates("unread")
        elif sc == "4":
            items = list(self.candidates)
        else:
            return None
        self.print_candidate_list(items, title)
        if not items:
            return None
        print("  0.对当前筛选结果全部发送")
        s = (await self.async_input("  序号(0为全部): ")).strip()
        if s == "0":
            return {"mode": "all", "items": items}
        if not s.isdigit() or not (1 <= int(s) <= len(items)):
            return None
        target = items[int(s) - 1]
        return {"mode": "pick", "name": target.get("name", ""), "items": [target]}

    def rand_delay(self):
        return random.uniform(self.min_delay, self.max_delay)
        self.page_title = ""

    async def handler(self, websocket):
        self.ws = websocket
        self.clients[websocket] = {"meta": {}, "last_detail": None}
        self.connected = True
        print()
        print("  [OK] 扩展已连接")
        try:
            async for msg in websocket:
                data = json.loads(msg)
                t = data.get("type", "")
                d = data.get("data", {})
                meta = data.get("meta") or d.get("frame") or {}
                self.update_client_meta(websocket, meta)
                if t == "candidates":
                    self.candidates = d.get("candidates", [])
                    self.print_candidate_list(self.candidates, "扫描到")
                    read_count = len(self.filter_candidates("read"))
                    unread_count = len(self.filter_candidates("unread"))
                    print("  已读: " + str(read_count) + " 人  未读: " + str(unread_count) + " 人")
                    if not self.candidates:
                        print("  (未找到候选人，可能页面结构变化)")
                elif t == "recommend_candidates":
                    accepted = self.record_recommend_scan_response(websocket, d)
                    if not accepted:
                        continue
                    self.print_recommend_candidate_list(self.recommend_candidates, "推荐牛人扫描到")
                    if not self.recommend_candidates and self.recommend_scan_debug:
                        print("  [i] 调试: " + self.recommend_scan_debug[:120])
                    if not self.recommend_candidates and self.recommend_card_samples:
                        for sample in self.recommend_card_samples[:3]:
                            lines = sample.get("lines", [])[:4]
                            reasons = ",".join(sample.get("reasons", []))
                            print("  [i] 卡片" + str(sample.get("index", "?")) + ": " + reasons)
                            for line in lines:
                                print("      " + str(line)[:80])
                elif t == "chat_content":
                    txt = d.get("full_text", "")[:200]
                    if txt:
                        print()
                        print("  [聊天内容] " + txt[:120])
                elif t == "detail":
                    self.clients[websocket]["last_detail"] = d
                    current_best = self.select_client("detail")
                    if current_best != websocket:
                        continue
                    self.last_detail = d
                    self.page_title = d.get("title", self.page_title)
                    self.page_url = d.get("url", self.page_url)
                    print()
                    print("  === 页面诊断 ===")
                    print("  标题: " + str(d.get("title", "?")))
                    print("  正文: " + str(d.get("bodyLength", 0)) + "字符")
                    if d.get("docCount"):
                        print("  文档: " + str(d.get("docCount")) + "个")
                    if d.get("rootCount"):
                        print("  根域: " + str(d.get("rootCount")) + "个")
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
                elif t == "read_status":
                    self.last_read_status = d
                    print("  [\u5df2\u8bfb] " + ("\u5df2\u8bfb" if d.get("is_read") else "\u672a\u8bfb"))
                elif t == "error":
                    s = d
                    if isinstance(s, str):
                        print("  [错误] " + s)
                    else:
                        print("  [错误] " + str(s))
                elif t == "connected":
                 self.page_title = d.get("title", "")
                 self.page_url = d.get("url", "")
                 frame = self.frame_meta(websocket)
                 tag = "顶层" if frame.get("is_top_frame") else "子层"
                 print("  页面: " + self.page_title[:40] + " [" + tag + "]")
                 if self.page_url:
                     print("  URL: " + self.page_url[:80])
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print("  [!] 消息异常: " + str(e)[:60])
        finally:
            if websocket in self.clients:
                self.clients.pop(websocket, None)
            if self.ws == websocket:
                self.ws = self.select_client()
            self.connected = bool(self.clients)
            print()
            print("  [!] 连接已断开")

    async def cmd(self, cmd, params=None):
        target_ws = None
        if cmd == "scan_recommend_candidates":
            targets = list(self.clients.keys())
            if not targets and self.ws:
                targets = [self.ws]
            m = {"cmd": cmd}
            if params:
                m["params"] = params
            for websocket in targets:
                try:
                    await websocket.send(json.dumps(m))
                except Exception as e:
                    print("  [!] 发送失败: " + str(e)[:40])
            return
        if cmd == "navigate_page":
            target_ws = self.select_client("default", require_top=True)
        elif cmd == "scan_detail":
            target_ws = self.select_client("detail")
        else:
            target_ws = self.select_client()
        if not target_ws:
            return
        m = {"cmd": cmd}
        if params: m["params"] = params
        try:
            await target_ws.send(json.dumps(m))
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
        print("[0/3] 清理旧连接...")
        self.cleanup_port()
        if not self.port_available():
            print("  [!] 端口 " + str(WS_PORT) + " 仍被占用")
            print("  请先关闭旧的助手窗口后再试")
            return
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
            print("  1.扫描页面        2.打开沟通对话")
            print("  3.沟通页单发模板  4.沟通页单发自定义")
            print("  5.沟通页筛选并批量发送")
            print("  6.查看当前聊天    7.页面诊断")
            print("  8.沟通页查看已读/未读")
            print("  B.推荐页筛选并批量发送")
            print("  9.测试连接    0.退出")
            c = (await self.async_input("  选择: ")).strip()
            c = c.upper()

            if c == "0":
                break
            elif c == "1":
                print("  1.扫描沟通列表  2.扫描推荐牛人")
                sc = (await self.async_input("  选择: ")).strip()
                if sc == "2":
                    print("  切换到推荐牛人页面...")
                    self.reset_recommend_scan_state()
                    ok_nav = await self.navigate_and_wait(RECOMMEND_URL)
                    if not ok_nav:
                        print("  [!] 未成功切换到推荐牛人页面")
                        continue
                    await self.cmd("scan_recommend_candidates")
                    for _ in range(6):
                        await asyncio.sleep(1)
                        if self.recommend_candidates:
                            break
                else:
                    print("  切换到沟通页面...")
                    ok_nav = await self.navigate_and_wait(COMM_URL)
                    if not ok_nav:
                        print("  [!] 未成功切换到沟通页面")
                        continue
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
                        print("  " + str(i) + ". " + ca.get("name", "?") + self.get_status_label(ca))
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
                target = await self.choose_target_candidate("本次单发对象")
                if not target:
                    continue
                for k, v in TEMPLATES.items():
                    print("  " + k + ". " + v[:40] + "...")
                s = (await self.async_input("  模板: ")).strip()
                if s in TEMPLATES:
                    ok = (await self.async_input("  确认? (y/n): ")).strip().lower()
                    if ok == "y":
                        if target["mode"] == "current":
                            await self.cmd("send_message", {"text": TEMPLATES[s]})
                            await asyncio.sleep(3)
                        else:
                            target_items = target.get("items", [])
                            total = len(target_items)
                            sent_names = set()
                            sent = 0
                            for i, ca in enumerate(target_items):
                                if self.actions >= self.max_actions: break
                                name = ca.get("name", "")
                                if not name or name in sent_names:
                                    continue
                                print('  [' + str(i+1) + '/' + str(total) + '] ' + name)
                                await self.cmd("click_candidate", {"name": name})
                                await asyncio.sleep(self.rand_delay())
                                await self.cmd("send_message", {"text": TEMPLATES[s]})
                                await asyncio.sleep(self.rand_delay())
                                sent_names.add(name)
                                sent += 1
                            print('  已发送: ' + str(sent) + '/' + str(total))
            elif c == "4":
                target = await self.choose_target_candidate("本次单发对象")
                if not target:
                    continue
                t = (await self.async_input("  内容: ")).strip()
                if t:
                    ok = (await self.async_input("  确认? (y/n): ")).strip().lower()
                    if ok == "y":
                        if target["mode"] == "current":
                            await self.cmd("send_message", {"text": t})
                            await asyncio.sleep(3)
                        else:
                            target_items = target.get("items", [])
                            total = len(target_items)
                            sent_names = set()
                            sent = 0
                            for i, ca in enumerate(target_items):
                                if self.actions >= self.max_actions: break
                                name = ca.get("name", "")
                                if not name or name in sent_names:
                                    continue
                                print('  [' + str(i+1) + '/' + str(total) + '] ' + name)
                                await self.cmd("click_candidate", {"name": name})
                                await asyncio.sleep(self.rand_delay())
                                await self.cmd("send_message", {"text": t})
                                await asyncio.sleep(self.rand_delay())
                                sent_names.add(name)
                                sent += 1
                            print('  已发送: ' + str(sent) + '/' + str(total))
            elif c == "5":
                target_candidates = await self.choose_comm_batch_targets()
                if not target_candidates:
                    continue
                print("  1.模板消息  2.自定义消息")
                send_mode = (await self.async_input("  选择: ")).strip()
                text = ""
                if send_mode == "1":
                    for k, v in TEMPLATES.items():
                        print("  " + k + ". " + v[:40] + "...")
                    s = (await self.async_input("  模板: ")).strip()
                    if s not in TEMPLATES:
                        continue
                    text = TEMPLATES[s]
                elif send_mode == "2":
                    text = (await self.async_input("  内容: ")).strip()
                    if not text:
                        continue
                else:
                    continue
                ok = (await self.async_input("  确认? (y/n): ")).strip().lower()
                if ok != "y":
                    continue
                total = len(target_candidates)
                sent_names = set()
                sent = 0
                for i, ca in enumerate(target_candidates):
                    if self.actions >= self.max_actions: break
                    name = ca.get("name", "")
                    if not name: continue
                    if name in sent_names:
                        print("  ["+str(i+1)+"/"+str(total)+"] " + name + " - 已发过跳过")
                        continue
                    print('  [' + str(i+1) + '/' + str(total) + '] ' + name)
                    await self.cmd("click_candidate", {"name": name})
                    await asyncio.sleep(self.rand_delay())
                    await self.cmd("send_message", {"text": text})
                    await asyncio.sleep(self.rand_delay())
                    sent_names.add(name)
                    sent += 1
                    
                print('  \u5df2\u53d1\u9001: ' + str(sent) + '/' + str(total))
            elif c == "8":
                if not await self.ensure_comm_candidates(force_refresh=True):
                    continue
                print("  1.全部  2.仅已读  3.仅未读")
                sc = (await self.async_input("  选择: ")).strip()
                if sc == "2":
                    self.print_candidate_list(self.filter_candidates("read"), "已读名单")
                elif sc == "3":
                    self.print_candidate_list(self.filter_candidates("unread"), "未读名单")
                else:
                    self.print_candidate_list(self.candidates, "全部名单")
            elif c == "B":
                if not await self.ensure_recommend_candidates():
                    continue
                target_items = await self.choose_recommend_targets()
                if not target_items:
                    continue
                self.print_recommend_candidate_list(target_items, "将发送给")
                print("  1.模板消息  2.自定义消息")
                send_mode = (await self.async_input("  选择: ")).strip()
                text = ""
                if send_mode == "1":
                    for k, v in TEMPLATES.items():
                        print("  " + k + ". " + v[:40] + "...")
                    tk = (await self.async_input("  模板: ")).strip()
                    if tk not in TEMPLATES:
                        continue
                    text = TEMPLATES[tk]
                elif send_mode == "2":
                    text = (await self.async_input("  内容: ")).strip()
                    if not text:
                        continue
                else:
                    continue
                ok = (await self.async_input("  确认? (y/n): ")).strip().lower()
                if ok != "y":
                    continue
                total = len(target_items)
                sent = 0
                sent_names = set()
                for i, ca in enumerate(target_items):
                    if self.actions >= self.max_actions:
                        break
                    name = ca.get("name", "")
                    if not name or name in sent_names:
                        continue
                    print('  [' + str(i+1) + '/' + str(total) + '] ' + name + ' - ' + ca.get("intent", ""))
                    await self.cmd("greet_recommend_candidate", {"name": name, "text": text})
                    await asyncio.sleep(self.rand_delay())
                    sent_names.add(name)
                    sent += 1
                print('  推荐牛人已发送: ' + str(sent) + '/' + str(total))
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

