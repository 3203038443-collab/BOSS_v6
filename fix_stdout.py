f = r"C:\Users\01\Desktop\BOSS_v6\boss_agent\launcher.py"
with open(f, "r", encoding="utf-8") as fh:
    code = fh.read()

# Add stdout reconfigure after imports
old = 'import websockets\nos.makedirs'
new = 'import websockets\nsys.stdout.reconfigure(encoding="utf-8", errors="replace")\nos.makedirs'
code = code.replace(old, new)

with open(f, "w", encoding="utf-8") as fh:
    fh.write(code)

import py_compile
py_compile.compile(f, doraise=True)
print("Fix applied. Syntax OK")
