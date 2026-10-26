; 安装器自定义钩子（electron-builder nsis.include 指向本文件）
!include LogicLib.nsh

; 自定义注册表值：记录「上一次装完后的最终目录」，与安装模式无关。
;
; electron-builder 自带的 InstallLocation 只写在当前模式对应的根键下
; （仅为我安装 → HKCU\Software\{GUID}，所有用户 → HKLM\Software\{GUID}），
; 两次选的模式不一样就查不到，于是退回默认目录。这里额外留一份不区分
; 模式的记录，下次无论选哪种模式都能定位到旧目录。
!define INSTALL_LOCATION_ANY "InstallLocationAnyMode"

; ---------------------------------------------------------------------------
; customInit：安装模式初始化之后、页面显示之前执行
;
; 这里做两件事：
;   1. 结束可能残留的旧版进程
;   2. 覆盖安装时沿用旧版本的安装目录（细节见下面第 2 段的注释）
; ---------------------------------------------------------------------------
!macro customInit
  ; ===== 1. 结束残留进程 =====
  ; 背景：旧版若在后台运行（关窗只是收进托盘、服务子进程常驻），
  ; 覆盖安装后旧的服务进程可能成为「孤儿进程」继续占着数据目录，
  ; 导致新版首次启动失败（win10 上出现过「本地服务没能起来」弹窗）。
  ; 主进程侧已有实例指纹检测 + 自动清理，这里再加一道安装期的前置清理。
  ; 主进程与服务子进程是同一个 exe 的实例（服务以 ELECTRON_RUN_AS_NODE
  ; 方式由主进程 spawn），映像名相同，一条 taskkill 即可全部结束。
  ; 找不到进程时 taskkill 返回非 0，属正常情况，不影响安装继续。
  ExecWait 'taskkill /F /IM 全职高手考研系统.exe' $0

  ; ===== 2. 沿用旧版本的安装目录 =====
  ; 现象：旧版装在自定义目录（如 D:\全职高手考研系统），换新版安装包时
  ; 目录页仍是默认路径，一路下一步就在默认位置又装了一份，桌面上多出
  ; 一个图标，旧的快捷方式还指着老目录。
  ;
  ; 做法：此时 $INSTDIR 已由安装模式初始化确定（initMultiUser 在本宏之前
  ; 执行）。若它里面没有上一版的卸载程序（说明没定位到旧安装、退回默认
  ; 了），就按下面顺序再找一遍，找到且目录里确实有卸载程序才采用：
  ;   a) 不区分模式的记录（本安装器 customInstall 里写入）
  ;   b) 另一种安装模式对应的那处注册表（v1.2.3 及以前只写了这一处）
  ;
  ; 只补空、不覆盖：$INSTDIR 里已经有旧版时这里什么都不做，避免把正确
  ; 识别出的目录改坏。
  ${IfNot} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
    StrCpy $R8 ""

    ; a) 不区分模式的记录
    ReadRegStr $R8 HKCU "${INSTALL_REGISTRY_KEY}" "${INSTALL_LOCATION_ANY}"
    ${If} $R8 == ""
      ReadRegStr $R8 HKLM "${INSTALL_REGISTRY_KEY}" "${INSTALL_LOCATION_ANY}"
    ${EndIf}

    ; b) 另一种安装模式对应的注册表
    ;    $installMode 取值只有 "CurrentUser" 和 "all"
    ${If} $R8 == ""
      ${If} $installMode == "all"
        ReadRegStr $R8 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${Else}
        ReadRegStr $R8 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${EndIf}
    ${EndIf}

    ; 目录里确实有上一版才采用，避免注册表残留把安装引到空目录
    ${If} $R8 != ""
    ${AndIf} ${FileExists} "$R8\${UNINSTALL_FILENAME}"
      StrCpy $INSTDIR $R8
    ${EndIf}
  ${EndIf}
!macroend

; ---------------------------------------------------------------------------
; customInstall：文件装完、注册表写完、快捷方式建好之后执行
;
; 把最终的 $INSTDIR 记进「不区分模式」的那个值，供下一次升级定位。
; 所有用户安装时额外写一份 HKLM，避免换了提权账户后 HKCU 里读不到。
; ---------------------------------------------------------------------------
!macro customInstall
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" "${INSTALL_LOCATION_ANY}" "$INSTDIR"
  ${If} $installMode == "all"
    WriteRegStr HKLM "${INSTALL_REGISTRY_KEY}" "${INSTALL_LOCATION_ANY}" "$INSTDIR"
  ${EndIf}
!macroend
