use alloy::primitives::{Address, U256};
use alloy::sol;

use crate::error::Result;
use crate::types::DeFiTx;

sol! {
    #[sol(rpc)]
    interface IERC20 {
        function name() external view returns (string);
        function symbol() external view returns (string);
        function decimals() external view returns (uint8);
        function totalSupply() external view returns (uint256);
        function balanceOf(address account) external view returns (uint256);
        function transfer(address to, uint256 amount) external returns (bool);
        function allowance(address owner, address spender) external view returns (uint256);
        function approve(address spender, uint256 amount) external returns (bool);
        function transferFrom(address from, address to, uint256 amount) external returns (bool);
    }
}

pub fn build_approve(token: Address, spender: Address, amount: U256) -> Result<DeFiTx> {
    let call = IERC20::approveCall { spender, amount };
    Ok(DeFiTx {
        description: format!("Approve {spender} to spend {amount} of token {token}"),
        to: token,
        data: alloy::sol_types::SolCall::abi_encode(&call).into(),
        value: U256::ZERO,
        gas_estimate: Some(60_000),
    })
}

pub fn build_transfer(token: Address, to: Address, amount: U256) -> Result<DeFiTx> {
    let call = IERC20::transferCall { to, amount };
    Ok(DeFiTx {
        description: format!("Transfer {amount} of token {token} to {to}"),
        to: token,
        data: alloy::sol_types::SolCall::abi_encode(&call).into(),
        value: U256::ZERO,
        gas_estimate: Some(65_000),
    })
}
