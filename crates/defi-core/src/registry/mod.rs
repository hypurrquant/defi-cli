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
        let token_files: Vec<(&str, &str)> = vec![
            (
                "hyperevm",
                include_str!("../../../../config/tokens/hyperevm.toml"),
            ),
            (
                "arbitrum",
                include_str!("../../../../config/tokens/arbitrum.toml"),
            ),
            ("base", include_str!("../../../../config/tokens/base.toml")),
            ("bnb", include_str!("../../../../config/tokens/bnb.toml")),
        ];
        for (chain, toml_str) in token_files {
            let wrapper: TokensWrapper = toml::from_str(toml_str).map_err(|e| {
                DefiError::RegistryError(format!("Failed to parse {chain} tokens: {e}"))
            })?;
            all.insert(chain.to_string(), wrapper.token);
        }
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
            // === Lending (5) ===
            (
                "lending/hyperlend",
                include_str!("../../../../config/protocols/lending/hyperlend.toml"),
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
                "lending/felix_morpho",
                include_str!("../../../../config/protocols/lending/felix_morpho.toml"),
            ),
            // === Liquid Staking (2) ===
            (
                "liquid_staking/kinetiq",
                include_str!("../../../../config/protocols/liquid_staking/kinetiq.toml"),
            ),
            (
                "liquid_staking/sthype",
                include_str!("../../../../config/protocols/liquid_staking/sthype.toml"),
            ),
            // === CDP (1) ===
            (
                "cdp/felix",
                include_str!("../../../../config/protocols/cdp/felix.toml"),
            ),
            // === Yield Aggregator (1) ===
            (
                "yield_aggregator/lazy_summer",
                include_str!("../../../../config/protocols/yield_aggregator/lazy_summer.toml"),
            ),
            // === Vault (2) ===
            (
                "vault/upshift",
                include_str!("../../../../config/protocols/vault/upshift.toml"),
            ),
            (
                "vault/felix_vaults",
                include_str!("../../../../config/protocols/vault/felix_vaults.toml"),
            ),
            // === Arbitrum ===
            (
                "dex/uniswap_v3_arb",
                include_str!("../../../../config/protocols/dex/uniswap_v3_arb.toml"),
            ),
            (
                "dex/sushiswap_arb",
                include_str!("../../../../config/protocols/dex/sushiswap_arb.toml"),
            ),
            (
                "dex/camelot_arb",
                include_str!("../../../../config/protocols/dex/camelot_arb.toml"),
            ),
            (
                "dex/uniswap_v2_arb",
                include_str!("../../../../config/protocols/dex/uniswap_v2_arb.toml"),
            ),
            (
                "dex/pancakeswap_v3_arb",
                include_str!("../../../../config/protocols/dex/pancakeswap_v3_arb.toml"),
            ),
            (
                "dex/traderjoe_arb",
                include_str!("../../../../config/protocols/dex/traderjoe_arb.toml"),
            ),
            (
                "lending/aave_v3_arb",
                include_str!("../../../../config/protocols/lending/aave_v3_arb.toml"),
            ),
            (
                "lending/compound_v3_arb",
                include_str!("../../../../config/protocols/lending/compound_v3_arb.toml"),
            ),
            (
                "lending/venus_arb",
                include_str!("../../../../config/protocols/lending/venus_arb.toml"),
            ),
            (
                "dex/camelot_v2_arb",
                include_str!("../../../../config/protocols/dex/camelot_v2_arb.toml"),
            ),
            // === Base ===
            (
                "dex/uniswap_v3_base",
                include_str!("../../../../config/protocols/dex/uniswap_v3_base.toml"),
            ),
            (
                "dex/sushiswap_base",
                include_str!("../../../../config/protocols/dex/sushiswap_base.toml"),
            ),
            (
                "dex/uniswap_v2_base",
                include_str!("../../../../config/protocols/dex/uniswap_v2_base.toml"),
            ),
            (
                "dex/pancakeswap_v3_base",
                include_str!("../../../../config/protocols/dex/pancakeswap_v3_base.toml"),
            ),
            (
                "dex/aerodrome",
                include_str!("../../../../config/protocols/dex/aerodrome.toml"),
            ),
            (
                "dex/aerodrome_cl",
                include_str!("../../../../config/protocols/dex/aerodrome_cl.toml"),
            ),
            (
                "dex/quickswap_base",
                include_str!("../../../../config/protocols/dex/quickswap_base.toml"),
            ),
            (
                "dex/alienbase_v3",
                include_str!("../../../../config/protocols/dex/alienbase_v3.toml"),
            ),
            (
                "lending/aave_v3_base",
                include_str!("../../../../config/protocols/lending/aave_v3_base.toml"),
            ),
            (
                "lending/compound_v3_base",
                include_str!("../../../../config/protocols/lending/compound_v3_base.toml"),
            ),
            (
                "lending/sonne_base",
                include_str!("../../../../config/protocols/lending/sonne_base.toml"),
            ),
            // === BNB ===
            (
                "dex/pancakeswap_v3",
                include_str!("../../../../config/protocols/dex/pancakeswap_v3.toml"),
            ),
            (
                "dex/pancakeswap_v2",
                include_str!("../../../../config/protocols/dex/pancakeswap_v2.toml"),
            ),
            (
                "dex/uniswap_v3_bnb",
                include_str!("../../../../config/protocols/dex/uniswap_v3_bnb.toml"),
            ),
            (
                "dex/thena",
                include_str!("../../../../config/protocols/dex/thena.toml"),
            ),
            (
                "dex/thena_v1_bnb",
                include_str!("../../../../config/protocols/dex/thena_v1_bnb.toml"),
            ),
            (
                "dex/thena_fusion_bnb",
                include_str!("../../../../config/protocols/dex/thena_fusion_bnb.toml"),
            ),
            (
                "dex/apeswap_bnb",
                include_str!("../../../../config/protocols/dex/apeswap_bnb.toml"),
            ),
            (
                "dex/fstswap_bnb",
                include_str!("../../../../config/protocols/dex/fstswap_bnb.toml"),
            ),
            (
                "dex/biswap_bnb",
                include_str!("../../../../config/protocols/dex/biswap_bnb.toml"),
            ),
            (
                "dex/bscswap_bnb",
                include_str!("../../../../config/protocols/dex/bscswap_bnb.toml"),
            ),
            (
                "dex/bakeryswap_bnb",
                include_str!("../../../../config/protocols/dex/bakeryswap_bnb.toml"),
            ),
            (
                "dex/babydogeswap_bnb",
                include_str!("../../../../config/protocols/dex/babydogeswap_bnb.toml"),
            ),
            (
                "lending/aave_v3_bnb",
                include_str!("../../../../config/protocols/lending/aave_v3_bnb.toml"),
            ),
            (
                "lending/venus_bnb",
                include_str!("../../../../config/protocols/lending/venus_bnb.toml"),
            ),
            (
                "lending/venus_flux_bnb",
                include_str!("../../../../config/protocols/lending/venus_flux_bnb.toml"),
            ),
            (
                "lending/kinza_bnb",
                include_str!("../../../../config/protocols/lending/kinza_bnb.toml"),
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

    /// Get all protocols for a specific chain
    pub fn get_protocols_for_chain(&self, chain: &str) -> Vec<&ProtocolEntry> {
        self.protocols
            .iter()
            .filter(|p| p.chain.eq_ignore_ascii_case(chain))
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
