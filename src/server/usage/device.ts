// Turns a browser's User-Agent into broad families (Chrome, macOS…). The full string is never stored.
export function browserFamily(ua: string): string {
  if (/Edg(e|A|iOS)?\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox\/|FxiOS/.test(ua)) return "Firefox";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/Chrome\/|CriOS/.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

export function osFamily(ua: string, touch: boolean): string {
  if (/iPad/.test(ua)) return "iPadOS";
  if (/iPhone|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/CrOS/.test(ua)) return "ChromeOS";
  // iPads ask for desktop sites and say "Macintosh"; a touch screen gives them away.
  if (/Macintosh|Mac OS X/.test(ua)) return touch ? "iPadOS" : "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}
