// Web は Maxwell と同じオリジンの /mail 配下で動く（Next.js の basePath）。
// Next の redirect()・router は basePath を自動で付けるが、fetch・<a href>・location・
// サーバーで組み立てる絶対URL（OAuth リダイレクトURIなど）には付かないため、ここで付ける。
export const WEB_BASE_PATH = "/mail";

/** アプリ内パス（"/settings" など）をブラウザから見たパス（"/mail/settings"）にする */
export function webPath(path: string): string {
  if (path === "/") return WEB_BASE_PATH;
  return `${WEB_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

/** APP_ORIGIN と組み合わせた絶対URL */
export function webUrl(path: string, origin: string): URL {
  return new URL(webPath(path), origin);
}
