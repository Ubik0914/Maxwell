// メールの画面と API は Maxwell の /mail 配下にある（src/app/mail）。
// コード内ではメール側から見たパス（"/settings"、"/api/mail/threads"）で書き、
// fetch・<a href>・location・router・サーバーで組み立てる絶対URLにするときにここで /mail を付ける。
export const WEB_BASE_PATH = "/mail";

/** アプリ内パス（"/settings" など）をブラウザから見たパス（"/mail/settings"）にする */
export function webPath(path: string): string {
  if (path === "/") return WEB_BASE_PATH;
  if (path.startsWith("/?")) return `${WEB_BASE_PATH}${path.slice(1)}`;
  return `${WEB_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

/** APP_ORIGIN と組み合わせた絶対URL */
export function webUrl(path: string, origin: string): URL {
  return new URL(webPath(path), origin);
}
