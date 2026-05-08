import { createPublicClient, http, parseAbi, encodeFunctionData } from "viem";
import type { Address } from "viem";
import type { ILending } from "@hypurrquant/defi-core";
import {
  DefiError,
  type ProtocolEntry,
  type SupplyParams,
  type BorrowParams,
  type RepayParams,
  type WithdrawParams,
  type LendingRates,
  type UserPosition,
  type DeFiTx,
} from "@hypurrquant/defi-core";

const CTOKEN_ABI = parseAbi([
  "function underlying() external view returns (address)",
  "function supplyRatePerBlock() external view returns (uint256)",
  "function borrowRatePerBlock() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function totalBorrows() external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function exchangeRateStored() external view returns (uint256)",
  "function borrowBalanceStored(address account) external view returns (uint256)",
  "function mint(uint256 mintAmount) external returns (uint256)",
  "function redeem(uint256 redeemTokens) external returns (uint256)",
  "function redeemUnderlying(uint256 redeemAmount) external returns (uint256)",
  "function borrow(uint256 borrowAmount) external returns (uint256)",
  "function repayBorrow(uint256 repayAmount) external returns (uint256)",
]);

// cETH / vBNB-style "native" cToken — same Compound V2 family but the
// payable mint/repayBorrow variants take no args (msg.value carries the
// underlying). Different selector from the ERC20 variants above.
//   mint()         -> 0x1249c58b
//   repayBorrow()  -> 0x4e4d9fea
const NATIVE_CTOKEN_ABI = parseAbi([
  "function mint() external payable",
  "function repayBorrow() external payable",
]);

// defi-cli's internal sentinel for native gas tokens (registry uses 0x0
// for HYPE / MNT / ETH / BNB / MON in tokens/*.toml).
const NATIVE_SENTINEL = "0x0000000000000000000000000000000000000000" as const;

// ~3s blocks on BSC
const BSC_BLOCKS_PER_YEAR = 10_512_000;

export class CompoundV2Adapter implements ILending {
  private readonly protocolName: string;
  private readonly defaultVtoken: Address;
  private readonly vTokenCandidates: Address[];
  private readonly rpcUrl?: string;
  // Lazy cache: underlying asset address (lowercased) → vToken address.
  // The native sentinel (0x0…) is mapped to the cETH/vBNB-style vToken
  // when one is detected during resolveVtoken().
  private vTokenByAsset: Map<string, Address> | null = null;
  // The cETH/vBNB-style vToken whose underlying() reverts (it has no
  // ERC20 underlying — the underlying is the chain's native gas token).
  // Set lazily by resolveVtoken() and consulted by buildSupply/buildRepay
  // to switch to the payable mint() / repayBorrow() variants.
  private nativeVtoken: Address | null = null;

  constructor(entry: ProtocolEntry, rpcUrl?: string) {
    this.protocolName = entry.name;
    this.rpcUrl = rpcUrl;
    const contracts = entry.contracts ?? {};
    const vtoken =
      contracts["vusdt"] ??
      contracts["vusdc"] ??
      contracts["vbnb"] ??
      contracts["comptroller"];
    if (!vtoken) throw DefiError.contractError("Missing vToken or comptroller address");
    this.defaultVtoken = vtoken;
    // Collect all keys that look like vTokens (`v<symbol>`) — used by getRates
    // to resolve the per-asset market. Falls back to defaultVtoken if empty.
    this.vTokenCandidates = Object.entries(contracts)
      .filter(([k]) => /^v[a-z][a-z0-9]*$/i.test(k))
      .map(([, v]) => v as Address);
    if (this.vTokenCandidates.length === 0) this.vTokenCandidates = [vtoken];
  }

  private async resolveVtoken(asset: Address): Promise<Address | null> {
    if (!this.rpcUrl) return null;
    if (!this.vTokenByAsset) {
      const client = createPublicClient({ transport: http(this.rpcUrl) });
      const map = new Map<string, Address>();
      let nativeVtoken: Address | null = null;
      const lookups = await Promise.allSettled(
        this.vTokenCandidates.map(async (v) => {
          try {
            const u = await client.readContract({ address: v, abi: CTOKEN_ABI, functionName: "underlying" }) as Address;
            return { vtoken: v, underlying: u };
          } catch {
            // underlying() reverts → cETH/vBNB-style native cToken. The
            // contract has no ERC20 underlying; supply/repay flows through
            // the payable mint() / repayBorrow() variants and msg.value.
            return { vtoken: v, underlying: null };
          }
        }),
      );
      for (const r of lookups) {
        if (r.status !== "fulfilled") continue;
        const { vtoken, underlying } = r.value;
        if (underlying) {
          map.set(underlying.toLowerCase(), vtoken);
        } else if (!nativeVtoken) {
          // First native cToken wins. A protocol with multiple native
          // cTokens would be unusual; guard with the nullish check anyway
          // so we don't silently overwrite.
          nativeVtoken = vtoken;
        }
      }
      if (nativeVtoken) {
        // Map defi-cli's 0x0 native sentinel to the native cToken so
        // `lending supply --asset BNB` (which resolves to 0x0) finds vBNB.
        map.set(NATIVE_SENTINEL, nativeVtoken);
      }
      this.vTokenByAsset = map;
      this.nativeVtoken = nativeVtoken;
    }
    return this.vTokenByAsset.get(asset.toLowerCase()) ?? null;
  }

  /** True iff `vtoken` is the cETH/vBNB-style native cToken for this protocol. */
  private isNativeVtoken(vtoken: Address): boolean {
    return this.nativeVtoken !== null && vtoken.toLowerCase() === this.nativeVtoken.toLowerCase();
  }

  name(): string {
    return this.protocolName;
  }

  // Resolve the vToken whose underlying() matches params.asset. Compound V2 has
  // a separate vToken per asset, so all builders must dispatch on the request
  // asset. Returns the resolved vToken or throws if no candidate matches.
  private async vtokenFor(asset: Address): Promise<Address> {
    const v = await this.resolveVtoken(asset);
    if (!v) throw DefiError.contractError(`[${this.protocolName}] no vToken for asset ${asset}`);
    return v;
  }

  async buildSupply(params: SupplyParams): Promise<DeFiTx> {
    const vtoken = await this.vtokenFor(params.asset);
    if (this.isNativeVtoken(vtoken)) {
      // cETH/vBNB pattern: mint() takes no args, native amount via msg.value.
      // No ERC20 approval is possible (or needed) for native gas tokens.
      const data = encodeFunctionData({ abi: NATIVE_CTOKEN_ABI, functionName: "mint" });
      return {
        description: `[${this.protocolName}] Supply ${params.amount} (native) to Venus`,
        to: vtoken,
        data,
        value: params.amount,
        gas_estimate: 300_000,
      };
    }
    const data = encodeFunctionData({ abi: CTOKEN_ABI, functionName: "mint", args: [params.amount] });
    return {
      description: `[${this.protocolName}] Supply ${params.amount} of ${params.asset} to Venus`,
      to: vtoken,
      data,
      value: 0n,
      gas_estimate: 300_000,
      approvals: [{ token: params.asset, spender: vtoken, amount: params.amount }],
    };
  }

  async buildBorrow(params: BorrowParams): Promise<DeFiTx> {
    const vtoken = await this.vtokenFor(params.asset);
    const data = encodeFunctionData({ abi: CTOKEN_ABI, functionName: "borrow", args: [params.amount] });
    return {
      description: `[${this.protocolName}] Borrow ${params.amount} of ${params.asset} from Venus`,
      to: vtoken,
      data,
      value: 0n,
      gas_estimate: 350_000,
    };
  }

  async buildRepay(params: RepayParams): Promise<DeFiTx> {
    const vtoken = await this.vtokenFor(params.asset);
    if (this.isNativeVtoken(vtoken)) {
      // cETH/vBNB pattern: repayBorrow() takes no args, native amount via
      // msg.value. The contract refunds excess to the sender, so the user
      // can pass repay-all amounts safely.
      const data = encodeFunctionData({ abi: NATIVE_CTOKEN_ABI, functionName: "repayBorrow" });
      return {
        description: `[${this.protocolName}] Repay ${params.amount} (native) to Venus`,
        to: vtoken,
        data,
        value: params.amount,
        gas_estimate: 300_000,
      };
    }
    const data = encodeFunctionData({ abi: CTOKEN_ABI, functionName: "repayBorrow", args: [params.amount] });
    return {
      description: `[${this.protocolName}] Repay ${params.amount} of ${params.asset} to Venus`,
      to: vtoken,
      data,
      value: 0n,
      gas_estimate: 300_000,
      approvals: [{ token: params.asset, spender: vtoken, amount: params.amount }],
    };
  }

  async buildWithdraw(params: WithdrawParams): Promise<DeFiTx> {
    // redeemUnderlying takes the amount in underlying-asset units (matches the
    // CLI's `--amount` semantics). redeem() takes vToken units which would
    // require an extra exchangeRateStored conversion at the call site.
    const vtoken = await this.vtokenFor(params.asset);
    const MAX_UINT256 = (1n << 256n) - 1n;

    // uint256.max ("withdraw all") cannot use redeemUnderlying — it overflows
    // when the contract converts max underlying back to vToken units. Read the
    // user's full vToken balance and call redeem() with that exact amount.
    if (params.amount === MAX_UINT256 && this.rpcUrl) {
      const client = createPublicClient({ transport: http(this.rpcUrl) });
      const [vtokenBalance, borrowBalance] = await Promise.all([
        client.readContract({
          address: vtoken,
          abi: CTOKEN_ABI,
          functionName: "balanceOf",
          args: [params.to],
        }) as Promise<bigint>,
        client.readContract({
          address: vtoken,
          abi: CTOKEN_ABI,
          functionName: "borrowBalanceStored",
          args: [params.to],
        }).catch(() => 0n) as Promise<bigint>,
      ]);
      // If the user has any outstanding borrow, redeeming the entire vToken
      // balance leaves zero collateral and the Comptroller's hypothetical
      // liquidity check rejects with a generic "math error" (Compound V2 forks
      // bubble Comptroller errors as opaque math errors). Refuse explicitly so
      // the caller knows to repay first or pass an exact underlying amount.
      if (borrowBalance > 0n) {
        throw DefiError.contractError(
          `[${this.protocolName}] Cannot withdraw all (uint256.max) — wallet has an outstanding borrow of ${borrowBalance} on this market. Repay the borrow first, or pass an explicit --amount that leaves enough collateral.`,
        );
      }
      const redeemData = encodeFunctionData({ abi: CTOKEN_ABI, functionName: "redeem", args: [vtokenBalance] });
      return {
        description: `[${this.protocolName}] Withdraw all (auto-max, ${vtokenBalance} vTokens) of ${params.asset} from Venus`,
        to: vtoken,
        data: redeemData,
        value: 0n,
        gas_estimate: 350_000,
      };
    }

    const data = encodeFunctionData({ abi: CTOKEN_ABI, functionName: "redeemUnderlying", args: [params.amount] });
    return {
      description: `[${this.protocolName}] Withdraw ${params.amount} of ${params.asset} from Venus`,
      to: vtoken,
      data,
      value: 0n,
      gas_estimate: 250_000,
    };
  }

  async getRates(asset: Address): Promise<LendingRates> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    // Resolve the vToken whose underlying() matches the requested asset.
    // Compound V2 forks (Venus etc.) have a separate vToken per asset; using a
    // single default vToken contaminates cross-asset yield scans.
    const vtoken = await this.resolveVtoken(asset);
    if (!vtoken) {
      return {
        protocol: this.protocolName,
        asset,
        supply_apy: 0,
        borrow_variable_apy: 0,
        utilization: 0,
        total_supply: 0n,
        total_borrow: 0n,
      };
    }

    const [supplyRate, borrowRate, totalSupplyVtoken, totalBorrows, exchangeRate] = await Promise.all([
      client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "supplyRatePerBlock" }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] supplyRatePerBlock failed: ${e}`); }) as Promise<bigint>,
      client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "borrowRatePerBlock" }).catch((e: unknown) => { throw DefiError.rpcError(`[${this.protocolName}] borrowRatePerBlock failed: ${e}`); }) as Promise<bigint>,
      client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "totalSupply" }).catch(() => 0n) as Promise<bigint>,
      client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "totalBorrows" }).catch(() => 0n) as Promise<bigint>,
      client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "exchangeRateStored" }).catch(() => 0n) as Promise<bigint>,
    ]);

    const supplyPerBlock = Number(supplyRate) / 1e18;
    const borrowPerBlock = Number(borrowRate) / 1e18;
    const supplyApy = supplyPerBlock * BSC_BLOCKS_PER_YEAR * 100;
    const borrowApy = borrowPerBlock * BSC_BLOCKS_PER_YEAR * 100;

    // Compound V2 totalSupply() returns vToken units; convert to underlying so
    // both legs of the utilization ratio share a denomination.
    // underlyingSupply = totalSupplyVtoken * exchangeRate / 1e18.
    const totalSupplyUnderlying = exchangeRate > 0n
      ? (totalSupplyVtoken * exchangeRate) / 10n ** 18n
      : totalSupplyVtoken;
    const supplyF = Number(totalSupplyUnderlying);
    const borrowF = Number(totalBorrows);
    const utilization = supplyF > 0 ? Math.round((borrowF / supplyF) * 10000) / 100 : 0;

    return {
      protocol: this.protocolName,
      asset,
      supply_apy: supplyApy,
      borrow_variable_apy: borrowApy,
      utilization,
      total_supply: totalSupplyUnderlying,
      total_borrow: totalBorrows as bigint,
    };
  }

  async getUserPosition(user: Address): Promise<UserPosition> {
    if (!this.rpcUrl) throw DefiError.rpcError("No RPC URL configured");
    const client = createPublicClient({ transport: http(this.rpcUrl) });

    const ERC20_ABI = parseAbi([
      "function symbol() external view returns (string)",
    ]);

    // Iterate every configured vToken, collect non-zero supply / borrow positions.
    // Supply (in underlying) = balanceOf(user) * exchangeRateStored() / 1e18.
    // Borrow (in underlying) = borrowBalanceStored(user).
    const supplies: { asset: Address; symbol: string; amount: bigint }[] = [];
    const borrows: { asset: Address; symbol: string; amount: bigint }[] = [];

    await Promise.all(this.vTokenCandidates.map(async (vtoken) => {
      try {
        const [vtokenBal, rate, borrowed, underlying] = await Promise.all([
          client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "balanceOf", args: [user] }) as Promise<bigint>,
          client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "exchangeRateStored" }) as Promise<bigint>,
          client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "borrowBalanceStored", args: [user] }) as Promise<bigint>,
          client.readContract({ address: vtoken, abi: CTOKEN_ABI, functionName: "underlying" }).catch(() => null) as Promise<Address | null>,
        ]);
        if (vtokenBal === 0n && borrowed === 0n) return;
        const assetAddr = (underlying ?? vtoken) as Address;
        const symbol = await client.readContract({
          address: assetAddr, abi: ERC20_ABI, functionName: "symbol",
        }).catch(() => "?") as string;
        const supplyUnderlying = (vtokenBal * rate) / 10n ** 18n;
        if (supplyUnderlying > 0n) supplies.push({ asset: assetAddr, symbol, amount: supplyUnderlying });
        if (borrowed > 0n) borrows.push({ asset: assetAddr, symbol, amount: borrowed });
      } catch {
        // skip vToken on RPC error
      }
    }));

    return {
      protocol: this.protocolName,
      user,
      supplies,
      borrows,
    };
  }
}
