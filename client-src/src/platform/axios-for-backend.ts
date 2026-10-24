/**
 * 本地替身：@lark-apaas/client-toolkit/utils/getAxiosForBackend
 * 平台版会拼接平台网关地址并注入鉴权头；
 * 本地前后端同源（都由本机 127.0.0.1 提供，端口启动时随机分配），baseURL 留空即可。
 */
import axios from 'axios';

export const axiosForBackend = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
});

export default axiosForBackend;
