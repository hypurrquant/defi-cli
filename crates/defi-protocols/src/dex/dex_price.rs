use alloy::primitives::{Address, U256};

use defi_core::error::Result;
use defi_core::traits::Dex;
use defi_core::types::{PriceData, QuoteParams};

/// Utility for deriving spot prices from DEX quoters.
/// Quotes 1 unit of the token against a quote token (e.g. USDC) to derive price.
pub struct DexSpotPrice;

impl DexSpotPrice {
    /// Get the spot price for `token` denominated in `quote_token` (e.g. USDC).
    ///
    /// `token_decimals` — decimals of the input token (to know how much "1 unit" is)
    /// `quote_decimals` — decimals of the quote token (to convert the output to f64)
    pub async fn get_price(
        dex: &dyn Dex,
        token: Address,
        token_decimals: u8,
        quote_token: Address,
        quote_decimals: u8,
    ) -> Result<PriceData> {
        let amount_in = U256::from(10u64).pow(U256::from(token_decimals)); // 1 token

        let quote = dex
            .quote(QuoteParams {
                protocol: String::new(),
                token_in: token,
                token_out: quote_token,
                amount_in,
            })
            .await?;

        // Convert to USD price (assuming quote_token is a USD stablecoin)
        let price_f64 = quote.amount_out.to::<u128>() as f64 / 10f64.powi(quote_decimals as i32);

        // Normalize to 18-decimal representation
        let price_usd = if quote_decimals < 18 {
            quote.amount_out * U256::from(10u64).pow(U256::from(18 - quote_decimals))
        } else if quote_decimals > 18 {
            quote.amount_out / U256::from(10u64).pow(U256::from(quote_decimals - 18))
        } else {
            quote.amount_out
        };

        Ok(PriceData {
            source: format!("dex:{}", dex.name()),
            source_type: "dex_spot".to_string(),
            asset: token,
            price_usd,
            price_f64,
            block_number: None,
            timestamp: None,
        })
    }
}
