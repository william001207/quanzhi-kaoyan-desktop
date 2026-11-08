const RELEASES = 'https://github.com/william001207/quanzhi-kaoyan-desktop/releases';
function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error('版本号格式无法识别');
  return match.slice(1).map(Number);
}
function isNewer(latest, current) {
  const a=parseVersion(latest), b=parseVersion(current);
  for (let i=0;i<3;i++) { if(a[i]!==b[i]) return a[i]>b[i]; }
  return false;
}
async function latestRelease(fetcher=fetch) {
  const response=await fetcher('https://api.github.com/repos/william001207/quanzhi-kaoyan-desktop/releases/latest', {
    headers:{Accept:'application/vnd.github+json','User-Agent':'quanzhi-kaoyan-desktop'},
    signal:AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(response.status===403 || response.status===429 ? '请求过于频繁，请稍后再试' : `无法获取版本信息（${response.status}）`);
  const data=await response.json();
  parseVersion(data.tag_name);
  if(data.draft || data.prerelease) throw new Error('暂未找到正式发布版本');
  return {version:data.tag_name, notes:typeof data.body==='string' ? data.body.slice(0,6000) : '',
    url:RELEASES+'/tag/'+encodeURIComponent(data.tag_name)};
}
function createUpdateChecker({app,dialog,shell}) {
  let checking=false;
  return async () => {
    if(checking) return;
    checking=true;
    try {
      const current=app.getVersion(), release=await latestRelease();
      if(isNewer(release.version,current)) {
        const result=await dialog.showMessageBox({type:'info',title:'发现新版本',message:`当前 v${current} → 最新 ${release.version}`,
          detail:(release.notes || '发布页可查看更新说明。')+'\n\n点击后打开发布页，由你下载并安装。',buttons:['打开下载页面','稍后'],defaultId:0,cancelId:1});
        if(result.response===0) await shell.openExternal(release.url);
      } else await dialog.showMessageBox({type:'info',title:'检查更新',message:'当前已是最新版本',detail:`当前 v${current} · 最新正式版 ${release.version}`,buttons:['好']});
    } catch(error) {
      await dialog.showMessageBox({type:'warning',title:'检查更新失败',message:'暂时无法检查更新',detail:`${error.message}\n请检查网络后重试。`,buttons:['好']});
    } finally {checking=false;}
  };
}
module.exports={createUpdateChecker,isNewer,latestRelease};
