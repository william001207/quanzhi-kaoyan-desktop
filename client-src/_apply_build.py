"""把构建产物同步到 client/，替换掉旧的平台产物。

保留：loading.html（Electron 启动页）、icon.png（启动页图标）—— 这两个不在构建产物里。
先把原 client/ 完整备份成 client-backup/，出问题可以整体还原。
"""
import os
import shutil

SRC = 'tmp-build'
DST = 'client'
BACKUP = 'client-backup'
KEEP = {'loading.html', 'icon.png'}   # 构建产物里没有、但运行时需要的文件

# 1) 备份现有产物（只在首次备份，避免把原始备份覆盖掉）
if os.path.isdir(BACKUP):
    print('backup 已存在，保留原始备份不动')
else:
    shutil.copytree(DST, BACKUP)
    print('backup ->', BACKUP)

# 2) 清空 client（保留 KEEP）
removed = 0
for name in os.listdir(DST):
    if name in KEEP:
        continue
    p = os.path.join(DST, name)
    if os.path.isdir(p):
        shutil.rmtree(p, ignore_errors=True)
    else:
        os.remove(p)
    removed += 1
print('removed old entries:', removed)

# 3) 复制新产物
copied = 0
for name in os.listdir(SRC):
    s = os.path.join(SRC, name)
    d = os.path.join(DST, name)
    if os.path.isdir(s):
        shutil.copytree(s, d, dirs_exist_ok=True)
    else:
        shutil.copy2(s, d)
    copied += 1
print('copied new entries:', copied)

print('client now:', sorted(os.listdir(DST)))
print('file count:', sum(1 for dp, dn, fn in os.walk(DST) for f in fn))
