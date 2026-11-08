function menuText(app) {
  const language = app.getPreferredSystemLanguages()?.[0] || app.getLocale();
  const chinese = /^zh(?:[-_]|$)/i.test(language);
  return (zh, en) => chinese ? zh : en;
}
function applicationMenu({app, platform, checkForUpdates, openExternal}) {
  const t=menuText(app), sep={type:'separator'};
  const role=(name,zh,en)=>({role:name,label:t(zh,en)});
  const check={label:t('检查更新…','Check for Updates…'),click:checkForUpdates};
  return [
    platform==='darwin' ? {label:app.name,submenu:[
      role('about',`关于${app.name}`,`About ${app.name}`),check,sep,role('services','服务','Services'),sep,
      role('hide',`隐藏${app.name}`,`Hide ${app.name}`),role('hideOthers','隐藏其他','Hide Others'),role('unhide','全部显示','Show All'),sep,
      role('quit',`退出${app.name}`,`Quit ${app.name}`),
    ]} : {label:t('应用','Application'),submenu:[check,role('quit','退出','Quit')]},
    {label:t('编辑','Edit'),submenu:[role('undo','撤销','Undo'),role('redo','重做','Redo'),sep,
      role('cut','剪切','Cut'),role('copy','复制','Copy'),role('paste','粘贴','Paste'),role('selectAll','全选','Select All')]},
    {label:t('显示','View'),submenu:[role('reload','重新加载','Reload'),role('forceReload','强制重新加载','Force Reload'),
      role('toggleDevTools','开发者工具','Toggle Developer Tools'),sep,role('resetZoom','实际大小','Actual Size'),
      role('zoomIn','放大','Zoom In'),role('zoomOut','缩小','Zoom Out'),sep,role('togglefullscreen','切换全屏','Toggle Full Screen')]},
    {role:'windowMenu',label:t('窗口','Window'),submenu:[role('minimize','最小化','Minimize'),role('zoom','缩放','Zoom'),
      ...(platform==='darwin' ? [sep,role('front','前置全部窗口','Bring All to Front')] : [role('close','关闭','Close')])]},
    {role:'help',label:t('帮助','Help'),submenu:[
      {label:t('使用说明','User Guide'),click:()=>openExternal('https://github.com/william001207/quanzhi-kaoyan-desktop#readme')},
      {label:t('版本更新说明','Release Notes'),click:()=>openExternal('https://github.com/william001207/quanzhi-kaoyan-desktop/releases')},sep,
      {label:t('问题反馈','Report an Issue'),click:()=>openExternal('https://github.com/william001207/quanzhi-kaoyan-desktop/issues')},
    ]},
  ];
}
module.exports={menuText,applicationMenu};
