/* eslint-disable n/no-unsupported-features/node-builtins */
import {
  createProxyMiddleware,
  fixRequestBody,
  responseInterceptor,
} from "http-proxy-middleware";

import { withContentResponseHeaders } from "../headers.js";
import { Source, sourceUri, WILDCARD_ENABLED } from "../env.js";
import { PROXY_TIMEOUT } from "../constants.js";
import { ACTIVE_LOCALES } from "../internal/constants/index.js";

const target = sourceUri(Source.content);

export const proxyContentAssets = createProxyMiddleware({
  target,
  changeOrigin: true,
  autoRewrite: true,
  proxyTimeout: PROXY_TIMEOUT,
  xfwd: true,
  selfHandleResponse: true,
  on: {
    proxyReq: fixRequestBody,
    proxyRes: responseInterceptor(
      async (responseBuffer, proxyRes, req, res) => {
        withContentResponseHeaders(proxyRes, req, res);
        const [, locale] = req.url?.split("/") || [];
        if (
          proxyRes.statusCode === 404 &&
          locale &&
          locale != "en-US" &&
          ACTIVE_LOCALES.has(locale.toLowerCase())
        ) {
          const enUsAsset = await fetch(
            `${target}${req.url?.slice(1).replace(locale, "en-us")}`
          );
          if (enUsAsset?.ok) {
            res.statusCode = enUsAsset.status;
            enUsAsset.headers.forEach((value, key) =>
              res.setHeader(key, value)
            );
            return Buffer.from(await enUsAsset.arrayBuffer());
          } else if (WILDCARD_ENABLED) {
            // Fallback to prod.
            const target = new URL(
              req.url ?? "",
              "https://developer.mozilla.org/"
            );
            res.statusCode = 303;
            res.setHeader("location", target.toString());
            return "";
          }
        }

        return responseBuffer;
      }
    ),
  },
});
