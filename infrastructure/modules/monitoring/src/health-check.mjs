/**
 * Canary kiem tra suc khoe API tu ben ngoai.
 *
 * Goi dung ten mien cong khai theo lich, di qua chinh duong ma nguoi dung di
 * (Cloudflare -> nginx -> pm2), roi phat mot metric CloudWatch. Alarm gan vao
 * metric do se gui canh bao.
 *
 * Ly do can kiem tra tu ben ngoai thay vi dua vao StatusCheckFailed cua EC2:
 * su co that su xay ra voi he thong nay la ban ghi DNS tro sang mot dia chi da
 * bi thu hoi. Instance van khoe manh, moi kiem tra o tang ha tang deu xanh, va
 * toan bo API tra ve 522 ma khong mot canh bao nao phat ra. Chi mot phep goi
 * vao ten mien cong khai moi phat hien duoc dieu do.
 */
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cw = new CloudWatchClient({});

const URL_KIEM_TRA = process.env.HEALTH_CHECK_URL;
const NAMESPACE = process.env.METRIC_NAMESPACE || 'VidShare/Health';
const SO_LAN_THU = 3;
const TIMEOUT_MS = 10000;

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mot lan goi, tra ve true neu API phan hoi 2xx */
const thuMotLan = async () => {
  const ctrl = new AbortController();
  const hen = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL_KIEM_TRA, { signal: ctrl.signal });
    return { ok: res.ok, chiTiet: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, chiTiet: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(hen);
  }
};

export const handler = async () => {
  // Thu lai vai lan trong cung mot lan chay truoc khi ket luan la hong.
  // Mot lan goi hong don le thuong chi la nhieu mang; bao dong vi mot goi
  // truot se lam nguoi ta ngung tin vao canh bao, va do la cach hong te nhat.
  let ok = false;
  let chiTiet = '';

  for (let i = 1; i <= SO_LAN_THU && !ok; i += 1) {
    const kq = await thuMotLan();
    ok = kq.ok;
    chiTiet = kq.chiTiet;
    if (!ok && i < SO_LAN_THU) await nghi(2000);
  }

  console.log(`${URL_KIEM_TRA} -> ${ok ? 'OK' : 'HONG'} (${chiTiet})`);

  await cw.send(
    new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [
        {
          MetricName: 'ApiHealthy',
          Value: ok ? 1 : 0,
          Unit: 'None',
          Timestamp: new Date(),
        },
      ],
    })
  );

  return { healthy: ok, detail: chiTiet, url: URL_KIEM_TRA };
};
