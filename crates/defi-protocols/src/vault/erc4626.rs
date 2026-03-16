use alloy::primitives::{Address, U256};
use alloy::providers::ProviderBuilder;
use alloy::sol;
use alloy::sol_types::SolCall;
use async_trait::async_trait;

use defi_core::error::{DefiError, Result};
use defi_core::traits::Vault;
use defi_core::types::*;

sol! {
    #[sol(rpc)]
    interface IERC4626 {
        function asset() external view returns (address);
        function totalAssets() external view returns (uint256);
        function totalSupply() external view returns (uint256);
        function convertToShares(uint256 assets) external view returns (uint256);
        function convertToAssets(uint256 shares) external view returns (uint256);
        function maxDeposit(address receiver) external view returns (uint256);
        function maxWithdraw(address owner) external view returns (uint256);
        function deposit(uint256 assets, address receiver) external returns (uint256 shares);
        function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);
        function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    }
}

/// ERC-4626 Vault adapter covering 12+ protocols:
/// Veda, Upshift, Felix Vaults, Beefy, Hyperbeat Earn, Kinetiq Earn,
/// Lazy Summer, Felix USDhl, Looped Hype, HyperWave, Wrapped HLP, D2 Finance.
pub struct Erc4626Vault {
    name: String,
    vault_address: Address,
    rpc_url: Option<String>,
}

impl Erc4626Vault {
    pub fn new(name: String, vault_address: Address) -> Self {
        Self {
            name,
            vault_address,
            rpc_url: None,
        }
    }

    pub fn from_contracts(
        name: String,
        contracts: &std::collections::HashMap<String, Address>,
        rpc_url: Option<String>,
    ) -> Result<Self> {
        let vault_address = contracts.get("vault").copied().ok_or_else(|| {
            DefiError::ContractError("Missing 'vault' contract address".to_string())
        })?;
        Ok(Self {
            name,
            vault_address,
            rpc_url,
        })
    }

    /// Returns the vault contract address.
    pub fn vault_address(&self) -> Address {
        self.vault_address
    }

    fn rpc_url(&self) -> Result<url::Url> {
        self.rpc_url
            .as_ref()
            .ok_or_else(|| DefiError::RpcError("No RPC URL configured".to_string()))?
            .parse()
            .map_err(|e| DefiError::RpcError(format!("Invalid RPC URL: {e}")))
    }
}

#[async_trait]
impl Vault for Erc4626Vault {
    fn name(&self) -> &str {
        &self.name
    }

    async fn build_deposit(&self, assets: U256, receiver: Address) -> Result<DeFiTx> {
        let call = IERC4626::depositCall { assets, receiver };
        Ok(DeFiTx {
            description: format!("[{}] Deposit {} assets into vault", self.name, assets),
            to: self.vault_address,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn build_withdraw(
        &self,
        assets: U256,
        receiver: Address,
        owner: Address,
    ) -> Result<DeFiTx> {
        let call = IERC4626::withdrawCall {
            assets,
            receiver,
            owner,
        };
        Ok(DeFiTx {
            description: format!("[{}] Withdraw {} assets from vault", self.name, assets),
            to: self.vault_address,
            data: call.abi_encode().into(),
            value: U256::ZERO,
            gas_estimate: Some(200_000),
        })
    }

    async fn total_assets(&self) -> Result<U256> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let vault = IERC4626::new(self.vault_address, &provider);
        let result =
            vault.totalAssets().call().await.map_err(|e| {
                DefiError::RpcError(format!("[{}] totalAssets failed: {e}", self.name))
            })?;
        Ok(result)
    }

    async fn convert_to_shares(&self, assets: U256) -> Result<U256> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let vault = IERC4626::new(self.vault_address, &provider);
        let result = vault.convertToShares(assets).call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] convertToShares failed: {e}", self.name))
        })?;
        Ok(result)
    }

    async fn convert_to_assets(&self, shares: U256) -> Result<U256> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let vault = IERC4626::new(self.vault_address, &provider);
        let result = vault.convertToAssets(shares).call().await.map_err(|e| {
            DefiError::RpcError(format!("[{}] convertToAssets failed: {e}", self.name))
        })?;
        Ok(result)
    }

    async fn get_vault_info(&self) -> Result<VaultInfo> {
        let url = self.rpc_url()?;
        let provider = ProviderBuilder::new().connect_http(url);
        let vault = IERC4626::new(self.vault_address, &provider);

        let total_assets =
            vault.totalAssets().call().await.map_err(|e| {
                DefiError::RpcError(format!("[{}] totalAssets failed: {e}", self.name))
            })?;

        let total_supply =
            vault.totalSupply().call().await.map_err(|e| {
                DefiError::RpcError(format!("[{}] totalSupply failed: {e}", self.name))
            })?;

        let asset = vault
            .asset()
            .call()
            .await
            .map_err(|e| DefiError::RpcError(format!("[{}] asset failed: {e}", self.name)))?;

        Ok(VaultInfo {
            protocol: self.name.clone(),
            vault_address: self.vault_address,
            asset,
            total_assets,
            total_supply,
            apy: None,
        })
    }
}
