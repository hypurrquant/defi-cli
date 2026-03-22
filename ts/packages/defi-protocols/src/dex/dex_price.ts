import type { Address } from "viem";

import type { IDex, PriceData, QuoteParams } from "@hypurrquant/defi-core";

/**
 * Utility for deriving spot prices from DEX quoters.
 * Quotes 1 unit of the token against a quote token (e.g. USDC) to derive price.
 */
export class DexSpotPrice {
  /**
   * Get the spot price for `token` denominated in `quoteToken` (e.g. USDC).
   *
   * `tokenDecimals` — decimals of the input token (to know how much "1 unit" is)
   * `quoteDecimals` — decimals of the quote token (to convert the output to number)
   */
  static async getPrice(
    dex: IDex,
    token: Address,
    tokenDecimals: number,
    quoteToken: Address,
    quoteDecimals: number,
  ): Promise<PriceData> {
    const amountIn = 10n ** BigInt(tokenDecimals); // 1 token

    const quoteParams: QuoteParams = {
      protocol: "",
      token_in: token,
      token_out: quoteToken,
      amount_in: amountIn,
    };

    const quote = await dex.quote(quoteParams);

    // Convert to USD price (assuming quoteToken is a USD stablecoin)
    const priceF64 = Number(quote.amount_out) / 10 ** quoteDecimals;

    // Normalize to 18-decimal representation
    let priceUsd: bigint;
    if (quoteDecimals < 18) {
      priceUsd = quote.amount_out * 10n ** BigInt(18 - quoteDecimals);
    } else if (quoteDecimals > 18) {
      priceUsd = quote.amount_out / 10n ** BigInt(quoteDecimals - 18);
    } else {
      priceUsd = quote.amount_out;
    }

    return {
      source: `dex:${dex.name()}`,
      source_type: "dex_spot",
      asset: token,
      price_usd: priceUsd,
      price_f64: priceF64,
      block_number: undefined,
      timestamp: undefined,
    };
  }
}
