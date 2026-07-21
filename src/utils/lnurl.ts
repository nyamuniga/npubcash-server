import { ZAP_PUBKEY } from "../config";

export function createLnurlResponse(username: string, reqHost?: string) {
  const envHost = process.env.HOSTNAME;
  const hostname = reqHost ? `https://${reqHost}` : (envHost || "https://www.28waves.com");
  const domain = hostname.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const identifier = `${username}@${domain}`;

  const metadata = JSON.stringify([
    ["text/plain", `Pay to ${identifier}`],
    ["text/identifier", identifier],
  ]);

  const maxSendable = Number(process.env.LNURL_MAX_AMOUNT) || 1000000000;
  const minSendable = Number(process.env.LNURL_MIN_AMOUNT) || 1000;

  if (process.env.ZAP_SECRET_KEY) {
    return {
      callback: `${hostname}/.well-known/lnurlp/${username}`,
      maxSendable,
      minSendable,
      metadata,
      tag: "payRequest",
      allowsNostr: true,
      nostrPubkey: ZAP_PUBKEY,
    };
  } else {
    return {
      callback: `${hostname}/.well-known/lnurlp/${username}`,
      maxSendable,
      minSendable,
      metadata,
      tag: "payRequest",
    };
  }
}

