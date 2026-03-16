pub mod chain;
pub mod protocol;
pub mod token;

pub use chain::ChainConfig;
pub use protocol::{ProtocolCategory, ProtocolEntry};
pub use token::TokenEntry;

use crate::error::{DefiError, Result};
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug)]
pub struct Registry {
    pub chains: HashMap<String, ChainConfig>,
    pub tokens: HashMap<String, Vec<TokenEntry>>,
    pub protocols: Vec<ProtocolEntry>,
}

impl Registry {
    pub fn load_embedded() -> Result<Self> {
        let chains = Self::load_chains()?;
        let tokens = Self::load_tokens()?;
        let protocols = Self::load_protocols()?;
        Ok(Self {
            chains,
            tokens,
            protocols,
        })
    }

    fn load_chains() -> Result<HashMap<String, ChainConfig>> {
        let toml_str = include_str!("../../../../config/chains.toml");
        let wrapper: ChainConfigWrapper = toml::from_str(toml_str)
            .map_err(|e| DefiError::RegistryError(format!("Failed to parse chains.toml: {e}")))?;
        Ok(wrapper.chain)
    }

    fn load_tokens() -> Result<HashMap<String, Vec<TokenEntry>>> {
        let mut all = HashMap::new();
        let toml_str = include_str!("../../../../config/tokens/hyperevm.toml");
        let wrapper: TokensWrapper = toml::from_str(toml_str)
            .map_err(|e| DefiError::RegistryError(format!("Failed to parse tokens: {e}")))?;
        all.insert("hyperevm".to_string(), wrapper.token);
        Ok(all)
    }

    fn load_protocols() -> Result<Vec<ProtocolEntry>> {
        let mut protocols = Vec::new();

        // Load all protocol TOML files (60 protocols, 12 categories)
        let protocol_tomls: Vec<(&str, &str)> = vec![
            // === DEX (15) ===
            (
                "dex/hyperswap",
                include_str!("../../../../config/protocols/dex/hyperswap.toml"),
            ),
            (
                "dex/hyperswap_v2",
                include_str!("../../../../config/protocols/dex/hyperswap_v2.toml"),
            ),
            (
                "dex/project_x",
                include_str!("../../../../config/protocols/dex/project_x.toml"),
            ),
            (
                "dex/kittenswap",
                include_str!("../../../../config/protocols/dex/kittenswap.toml"),
            ),
            (
                "dex/nest",
                include_str!("../../../../config/protocols/dex/nest.toml"),
            ),
            (
                "dex/curve",
                include_str!("../../../../config/protocols/dex/curve.toml"),
            ),
            (
                "dex/balancer",
                include_str!("../../../../config/protocols/dex/balancer.toml"),
            ),
            (
                "dex/ring_few",
                include_str!("../../../../config/protocols/dex/ring_few.toml"),
            ),
            (
                "dex/ramses_cl",
                include_str!("../../../../config/protocols/dex/ramses_cl.toml"),
            ),
            (
                "dex/ramses_hl",
                include_str!("../../../../config/protocols/dex/ramses_hl.toml"),
            ),
            (
                "dex/woofi",
                include_str!("../../../../config/protocols/dex/woofi.toml"),
            ),
            (
                "dex/valantis",
                include_str!("../../../../config/protocols/dex/valantis.toml"),
            ),
            (
                "dex/wombat",
                include_str!("../../../../config/protocols/dex/wombat.toml"),
            ),
            (
                "dex/hybra",
                include_str!("../../../../config/protocols/dex/hybra.toml"),
            ),
            (
                "dex/hyperliquid_spot",
                include_str!("../../../../config/protocols/dex/hyperliquid_spot.toml"),
            ),
            // === Lending (8) ===
            (
                "lending/hyperlend",
                include_str!("../../../../config/protocols/lending/hyperlend.toml"),
            ),
            (
                "lending/morpho",
                include_str!("../../../../config/protocols/lending/morpho.toml"),
            ),
            (
                "lending/euler",
                include_str!("../../../../config/protocols/lending/euler.toml"),
            ),
            (
                "lending/hypurrfi",
                include_str!("../../../../config/protocols/lending/hypurrfi.toml"),
            ),
            (
                "lending/hypurrfi_isolated",
                include_str!("../../../../config/protocols/lending/hypurrfi_isolated.toml"),
            ),
            (
                "lending/termmax",
                include_str!("../../../../config/protocols/lending/termmax.toml"),
            ),
            (
                "lending/hyperdrive",
                include_str!("../../../../config/protocols/lending/hyperdrive.toml"),
            ),
            (
                "lending/teller",
                include_str!("../../../../config/protocols/lending/teller.toml"),
            ),
            // === Liquid Staking (4) ===
            (
                "liquid_staking/kinetiq",
                include_str!("../../../../config/protocols/liquid_staking/kinetiq.toml"),
            ),
            (
                "liquid_staking/sthype",
                include_str!("../../../../config/protocols/liquid_staking/sthype.toml"),
            ),
            (
                "liquid_staking/hyperbeat",
                include_str!("../../../../config/protocols/liquid_staking/hyperbeat.toml"),
            ),
            (
                "liquid_staking/kintsu",
                include_str!("../../../../config/protocols/liquid_staking/kintsu.toml"),
            ),
            // === CDP (2) ===
            (
                "cdp/felix",
                include_str!("../../../../config/protocols/cdp/felix.toml"),
            ),
            (
                "cdp/parallel",
                include_str!("../../../../config/protocols/cdp/parallel.toml"),
            ),
            // === Bridge (4) ===
            (
                "bridge/hyperliquid",
                include_str!("../../../../config/protocols/bridge/hyperliquid.toml"),
            ),
            (
                "bridge/hyperlane",
                include_str!("../../../../config/protocols/bridge/hyperlane.toml"),
            ),
            (
                "bridge/sodex",
                include_str!("../../../../config/protocols/bridge/sodex.toml"),
            ),
            (
                "bridge/symbiosis",
                include_str!("../../../../config/protocols/bridge/symbiosis.toml"),
            ),
            // === Yield Source (10) ===
            (
                "yield_source/pendle",
                include_str!("../../../../config/protocols/yield_source/pendle.toml"),
            ),
            (
                "yield_source/spectra",
                include_str!("../../../../config/protocols/yield_source/spectra.toml"),
            ),
            (
                "yield_source/penpie",
                include_str!("../../../../config/protocols/yield_source/penpie.toml"),
            ),
            (
                "yield_source/felix_usdhl",
                include_str!("../../../../config/protocols/yield_source/felix_usdhl.toml"),
            ),
            (
                "yield_source/equilibria",
                include_str!("../../../../config/protocols/yield_source/equilibria.toml"),
            ),
            (
                "yield_source/looped_hype",
                include_str!("../../../../config/protocols/yield_source/looped_hype.toml"),
            ),
            (
                "yield_source/growi",
                include_str!("../../../../config/protocols/yield_source/growi.toml"),
            ),
            (
                "yield_source/harmonix",
                include_str!("../../../../config/protocols/yield_source/harmonix.toml"),
            ),
            (
                "yield_source/hyperwave",
                include_str!("../../../../config/protocols/yield_source/hyperwave.toml"),
            ),
            (
                "yield_source/wrapped_hlp",
                include_str!("../../../../config/protocols/yield_source/wrapped_hlp.toml"),
            ),
            // === Yield Aggregator (4) ===
            (
                "yield_aggregator/beefy",
                include_str!("../../../../config/protocols/yield_aggregator/beefy.toml"),
            ),
            (
                "yield_aggregator/hyperbeat_earn",
                include_str!("../../../../config/protocols/yield_aggregator/hyperbeat_earn.toml"),
            ),
            (
                "yield_aggregator/kinetiq_earn",
                include_str!("../../../../config/protocols/yield_aggregator/kinetiq_earn.toml"),
            ),
            (
                "yield_aggregator/lazy_summer",
                include_str!("../../../../config/protocols/yield_aggregator/lazy_summer.toml"),
            ),
            // === Derivatives (3) ===
            (
                "derivatives/hyperliquid_hlp",
                include_str!("../../../../config/protocols/derivatives/hyperliquid_hlp.toml"),
            ),
            (
                "derivatives/derive",
                include_str!("../../../../config/protocols/derivatives/derive.toml"),
            ),
            (
                "derivatives/kinetiq_markets",
                include_str!("../../../../config/protocols/derivatives/kinetiq_markets.toml"),
            ),
            // === Options (2) ===
            (
                "options/rysk",
                include_str!("../../../../config/protocols/options/rysk.toml"),
            ),
            (
                "options/hypersurface",
                include_str!("../../../../config/protocols/options/hypersurface.toml"),
            ),
            // === Vault / Capital Allocator (4) ===
            (
                "vault/veda",
                include_str!("../../../../config/protocols/vault/veda.toml"),
            ),
            (
                "vault/upshift",
                include_str!("../../../../config/protocols/vault/upshift.toml"),
            ),
            (
                "vault/felix_vaults",
                include_str!("../../../../config/protocols/vault/felix_vaults.toml"),
            ),
            (
                "vault/d2_finance",
                include_str!("../../../../config/protocols/vault/d2_finance.toml"),
            ),
            // === Other (4) ===
            (
                "other/steer",
                include_str!("../../../../config/protocols/other/steer.toml"),
            ),
            (
                "other/liminal",
                include_str!("../../../../config/protocols/other/liminal.toml"),
            ),
            (
                "other/altura",
                include_str!("../../../../config/protocols/other/altura.toml"),
            ),
            (
                "other/rumpel",
                include_str!("../../../../config/protocols/other/rumpel.toml"),
            ),
        ];

        for (name, toml_str) in protocol_tomls {
            let wrapper: ProtocolWrapper = toml::from_str(toml_str)
                .map_err(|e| DefiError::RegistryError(format!("Failed to parse {name}: {e}")))?;
            protocols.push(wrapper.protocol);
        }

        Ok(protocols)
    }

    pub fn get_chain(&self, name: &str) -> Result<&ChainConfig> {
        self.chains
            .get(name)
            .ok_or_else(|| DefiError::ChainNotFound(name.to_string()))
    }

    pub fn get_protocol(&self, name: &str) -> Result<&ProtocolEntry> {
        self.protocols
            .iter()
            .find(|p| p.name.eq_ignore_ascii_case(name) || p.slug.eq_ignore_ascii_case(name))
            .ok_or_else(|| DefiError::ProtocolNotFound(name.to_string()))
    }

    pub fn get_protocols_by_category(&self, category: ProtocolCategory) -> Vec<&ProtocolEntry> {
        self.protocols
            .iter()
            .filter(|p| p.category == category)
            .collect()
    }

    pub fn resolve_token(&self, chain: &str, symbol: &str) -> Result<&TokenEntry> {
        let tokens = self
            .tokens
            .get(chain)
            .ok_or_else(|| DefiError::ChainNotFound(chain.to_string()))?;
        tokens
            .iter()
            .find(|t| t.symbol.eq_ignore_ascii_case(symbol))
            .ok_or_else(|| DefiError::TokenNotFound(symbol.to_string()))
    }
}

#[derive(Deserialize)]
struct ChainConfigWrapper {
    chain: HashMap<String, ChainConfig>,
}

#[derive(Deserialize)]
struct TokensWrapper {
    token: Vec<TokenEntry>,
}

#[derive(Deserialize)]
struct ProtocolWrapper {
    protocol: ProtocolEntry,
}
