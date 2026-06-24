import asyncio, json
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("file:///C:/Users/01/Desktop/BOSS_v6/test_page.html")
        await page.wait_for_timeout(500)

        # TEST SCAN
        print("=== SCAN TEST ===")
        scan_js = open("C:/Users/01/Desktop/BOSS_v6/boss_extension/content.js").read()
        scan_js += """
        return JSON.stringify(scanAll());
        """
        scan_result = json.loads(await page.evaluate(scan_js))
        print("Debug:", scan_result.get("debug"))
        print("Candidates:", len(scan_result.get("candidates", [])))
        for i, c in enumerate(scan_result.get("candidates", [])):
            print(f"  {i+1}. {c.get('name', '?')} - {c.get('last_msg', '')[:30]}")

        # TEST SEND
        print()
        print("=== SEND TEST ===")
        msg = "您好，方便简单了解一下您的情况吗？"
        send_js = """
        (async function() {
            var text = MSG_PLACEHOLDER;
            var inputEl = null;
            var sels = ["[contenteditable]", "textarea", "input[type=text]", "[role=textbox]"];
            for (var s = 0; s < sels.length; s++) {
                var els = document.querySelectorAll(sels[s]);
                for (var e = 0; e < els.length; e++) {
                    var r = els[e].getBoundingClientRect();
                    if (r.width > 50 && r.height > 20) { inputEl = els[e]; break; }
                }
                if (inputEl) break;
            }
            if (!inputEl) return "FAIL: input not found";
            inputEl.focus();
            inputEl.innerHTML = "";
            for (var i = 0; i < text.length; i++) {
                document.execCommand("insertText", false, text[i]);
                inputEl.dispatchEvent(new Event("input", {bubbles: true}));
            }
            var sendBtn = null;
            var btns = document.querySelectorAll("button");
            for (var i = 0; i < btns.length; i++) {
                if ((btns[i].innerText || "").indexOf("发送") >= 0) { sendBtn = btns[i]; break; }
            }
            if (!sendBtn) return "FAIL: no send button";
            sendBtn.click();
            return "SUCCESS: sent " + text.length + " chars via " + (sendBtn.innerText || "") + " button";
        })()
        """.replace("MSG_PLACEHOLDER", json.dumps(msg))
        send_result = await page.evaluate(send_js)
        print(send_result)

        await browser.close()

asyncio.run(test())
print("Tests done")
