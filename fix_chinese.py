import re
f = r"C:\Users\01\Desktop\BOSS_v6\boss_agent\launcher.py"
with open(f, "r", encoding="utf-8") as fh:
    code = fh.read()

# Replace ALL Chinese text in print/input calls with ASCII
replacements = {
    "  完成后按Enter...": "  Press Enter when done...",
    "  仍然未连接": "  Still not connected",
    "  请打开 chrome://extensions/ 加载扩展": "  Open chrome://extensions/ and load the extension",
    "  再见!": "  Bye!",
    "  按Enter键退出...": "  Press Enter to exit...",
    "  [!] 扩展未连接!": "  [!] Not connected!",
}
for old, new in replacements.items():
    code = code.replace(old, new)

with open(f, "w", encoding="utf-8") as fh:
    fh.write(code)

import py_compile
py_compile.compile(f, doraise=True)
print("Fix applied - Syntax OK")
