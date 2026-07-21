import { ZAP_PUBKEY } from "../config";

export function createLnurlResponse(username: string) {
  const hostname = process.env.HOSTNAME || "https://www.28waves.com";
  const domain = hostname.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const identifier = `${username}@${domain}`;

  const metadata = JSON.stringify([
    ["text/plain", `Pay to ${identifier}`],
    ["text/identifier", identifier],
  ]);

  if (process.env.ZAP_SECRET_KEY) {
    return {
      callback: `${hostname}/.well-known/lnurlp/${username}`,
      maxSendable: Number(process.env.LNURL_MAX_AMOUNT),
      minSendable: Number(process.env.LNURL_MIN_AMOUNT),
      metadata,
      tag: "payRequest",
      allowsNostr: true,
      nostrPubkey: ZAP_PUBKEY,
    };
  } else {
    return {
      callback: `${hostname}/.well-known/lnurlp/${username}`,
      maxSendable: Number(process.env.LNURL_MAX_AMOUNT),
      minSendable: Number(process.env.LNURL_MIN_AMOUNT),
      metadata,
      tag: "payRequest",
    };
  }
}
