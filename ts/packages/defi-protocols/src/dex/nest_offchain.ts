import { DefiError, type ProtocolEntry, type RewardInfo, type DeFiTx } from "@hypurrquant/defi-core";
import type { Address, Hex } from "viem";

const DEFAULT_BASE_URL = "https://app.usenest.xyz/api/blaze";
const FALLBACK_BASE_URL = "https://blaze.nest.aegas.it";

const NEST_TOKEN: Address = "0x07c57E32a3C29D5659bda1d3EFC2E7BF004E3035";
const NEST_DECIMALS = 18;

export interface NestClaimStatus {
  totalClaimedRaw: bigint;
  totalAvailableRaw: bigint;
  pendingRaw: bigint;
  pendingFormatted: number;
}

export interface NestClaimTicket {
  user: Address;
  amount: bigint;
  timestamp: bigint;
  day: bigint | null;
  signature: Hex;
}

export interface NestAprEstimateParams {
  poolAddress: Address;
  minTick: number;
  maxTick: number;
  token0Amount: bigint;
  token1Amount: bigint;
}

/**
 * Per-pool emission snapshot returned by /api/blaze/liquidity-pools.
 * Mirrors the shape `lp discover` consumes for IGauge pools, but populated
 * from the off-chain blaze API so NEST's read-side surfaces non-zero APR
 * even though on-chain `gauge.rewardRate` is hard-wired to 0.
 */
export interface NestLiquidityPool {
  pool: Address;
  gauge: Address | null;
  token0: { address: Address; symbol: string };
  token1: { address: Address; symbol: string };
  tvlUSD: number;
  /** APR in % (annualized, including emissions). 0 when pool has no active gauge epoch. */
  aprPercent: number;
  /** Current epoch's emission USD (0 if no active emissions). */
  curEpochEmissionRewardsUSD: number;
  poolType: string;
  isStable: boolean;
}

export class NestOffChainAdapter {
  private readonly baseUrl: string;
  private readonly fallbackUrl: string;
  private readonly voter: Address;

  constructor(entry: ProtocolEntry) {
    const voter = entry.contracts?.["voter"];
    if (!voter) {
      throw DefiError.contractError("Nest off-chain: missing 'voter' contract");
    }
    this.voter = voter;
    this.baseUrl = process.env["NEST_API_URL"] ?? DEFAULT_BASE_URL;
    this.fallbackUrl = FALLBACK_BASE_URL;
  }

  name(): string {
    return "Nest";
  }

  /** Cumulative claimed + available NEST emissions for a wallet */
  async getClaimStatus(wallet: Address): Promise<NestClaimStatus> {
    const data = await this.fetchJson<{ totalClaimed: string; totalAvailable: string }>(
      `/claim/claim-status?publicAddress=${wallet}`,
    );
    const totalClaimedRaw = BigInt(data.totalClaimed);
    const totalAvailableRaw = BigInt(data.totalAvailable);
    const pendingRaw = totalAvailableRaw > totalClaimedRaw
      ? totalAvailableRaw - totalClaimedRaw
      : 0n;
    return {
      totalClaimedRaw,
      totalAvailableRaw,
      pendingRaw,
      pendingFormatted: Number(pendingRaw) / 10 ** NEST_DECIMALS,
    };
  }

  /**
   * Backend-signed claim ticket (or null when nothing to claim).
   * Returns the raw ticket; `buildClaim()` is not yet implemented because the
   * voter contract source is unverified — function selector 0xd6d7a454 takes
   * 5 dynamic arrays we have not been able to disambiguate yet.
   */
  async getClaimTicket(wallet: Address): Promise<NestClaimTicket | null> {
    const url = `${this.baseUrl}/claim/claim-data?publicAddress=${wallet}`;
    const res = await fetch(url, this.requestInit());
    const text = await res.text();
    if (text.includes("no points to claim")) return null;
    if (!res.ok) {
      throw DefiError.providerError(`Nest claim-data ${res.status}: ${text.slice(0, 200)}`);
    }
    let json: { user: string; amount: string; timestamp: string; day: string | null; signature: string };
    try {
      json = JSON.parse(text);
    } catch {
      throw DefiError.providerError(`Nest claim-data: non-JSON response: ${text.slice(0, 200)}`);
    }
    return {
      user: json.user as Address,
      amount: BigInt(json.amount),
      timestamp: BigInt(json.timestamp),
      day: json.day === null ? null : BigInt(json.day),
      signature: (json.signature.startsWith("0x") ? json.signature : `0x${json.signature}`) as Hex,
    };
  }

  /** APR estimate (percent) for a CL position with given tick range and amounts */
  async estimateLpApr(params: NestAprEstimateParams): Promise<number> {
    const qs = new URLSearchParams({
      poolAddress: params.poolAddress,
      minTick: String(params.minTick),
      maxTick: String(params.maxTick),
      token0Amount: params.token0Amount.toString(),
      token1Amount: params.token1Amount.toString(),
    });
    const data = await this.fetchJson<{ apr: string }>(`/liquidity/apr/estimate?${qs}`);
    const apr = Number(data.apr);
    if (!Number.isFinite(apr)) {
      throw DefiError.providerError(`Nest apr/estimate: invalid apr value '${data.apr}'`);
    }
    return apr;
  }

  /**
   * Snapshot of all NEST gauged pools from the off-chain blaze API. The
   * on-chain ve(3,3) gauges return `rewardRate=0` (emissions are credited
   * off-chain via signed claim tickets), so the on-chain Solidly gauge
   * reader cannot surface real emission APR. This API is the canonical
   * read source — used by `lp discover` to expose non-zero NEST yields.
   */
  async getLiquidityPools(): Promise<NestLiquidityPool[]> {
    type RawTokenLeg = {
      tokenAddress?: string;
      basetoken?: { address?: string; symbol?: string; name?: string };
    };
    type RawPool = {
      id: string;
      gauge: string | null;
      tvlUSD: string;
      apr: string | number | null;
      curEpochEmissionRewardsUSD: string | null;
      poolType: string;
      isStable: boolean;
      token0: RawTokenLeg | null;
      token1: RawTokenLeg | null;
    };
    const raw = await this.fetchJson<RawPool[]>("/liquidity-pools");
    const out: NestLiquidityPool[] = [];
    for (const p of raw) {
      const t0 = p.token0?.basetoken;
      const t1 = p.token1?.basetoken;
      if (!t0?.address || !t1?.address) continue;
      out.push({
        pool: p.id as Address,
        gauge: (p.gauge ?? null) as Address | null,
        token0: { address: t0.address as Address, symbol: t0.symbol ?? "?" },
        token1: { address: t1.address as Address, symbol: t1.symbol ?? "?" },
        tvlUSD: Number(p.tvlUSD ?? 0),
        aprPercent: Number(p.apr ?? 0),
        curEpochEmissionRewardsUSD: Number(p.curEpochEmissionRewardsUSD ?? 0),
        poolType: p.poolType,
        isStable: p.isStable,
      });
    }
    return out;
  }

  /** Pending NEST emissions as IGauge-compatible RewardInfo[] */
  async getPendingRewards(user: Address): Promise<RewardInfo[]> {
    const status = await this.getClaimStatus(user);
    if (status.pendingRaw === 0n) return [];
    return [{
      token: NEST_TOKEN,
      symbol: "NEST",
      amount: status.pendingRaw,
    }];
  }

  /** Voter address used by aggregateClaim() — exposed for callers that build the tx themselves */
  getVoterAddress(): Address {
    return this.voter;
  }

  /**
   * Build a Nest voter claim transaction by reproducing the byte-level calldata
   * pattern observed in successful onchain claims, swapping in the ticket's
   * (amount, timestamp, signature) words.
   *
   * The voter implementation source is not verified, so we cannot derive a
   * Solidity ABI for selector 0xd6d7a454. Instead, two known-successful claim
   * transactions were diffed:
   *
   *   tx1: 0x99f35cfdb6fc3885ebe046c4625acc083e42d5afe6ca6962c6c81cd9006b99ba
   *   tx2: 0x3e120ab95e9e0a9148cb8964993dd066b8a36363353fe727462231857724e7bb
   *
   * 31 of 34 calldata words are identical between the two; only words 21, 22,
   * 25, 26, 27 differ — and those map exactly to the backend ticket's
   * (amount, timestamp, sigR, sigS, sigVPadded). msg.sender is not encoded in
   * calldata; voter binds the claim to the caller, so the ticket signature
   * authorizes the EOA holding the wallet.
   *
   * Throws if no claim ticket is available.
   */
  async buildClaim(wallet: Address): Promise<DeFiTx> {
    const ticket = await this.getClaimTicket(wallet);
    if (!ticket) {
      throw DefiError.invalidParam(`Nest: no claim ticket available for ${wallet}`);
    }

    // Decompose the 65-byte signature into r (32) || s (32) || v (1)
    const sigHex = ticket.signature.startsWith("0x") ? ticket.signature.slice(2) : ticket.signature;
    if (sigHex.length !== 130) {
      throw DefiError.providerError(`Nest: signature must be 65 bytes (130 hex chars), got ${sigHex.length}`);
    }
    const r = sigHex.slice(0, 64);
    const s = sigHex.slice(64, 128);
    const v = sigHex.slice(128, 130);
    const vPadded = v + "0".repeat(62); // last word: v in high byte + 31 zero bytes

    const amountHex = ticket.amount.toString(16).padStart(64, "0");
    const timestampHex = ticket.timestamp.toString(16).padStart(64, "0");

    // Calldata template: 34 words, derived from two verified onchain claim txs.
    // Mutable slots (ticket struct): 21=amount, 22=timestamp, 25=sigR, 26=sigS, 27=sigV+padding.
    const words = [
      "0000000000000000000000000000000000000000000000000000000000000160", // 0
      "0000000000000000000000000000000000000000000000000000000000000180", // 1
      "0000000000000000000000000000000000000000000000000000000000000200", // 2
      "00000000000000000000000000000000000000000000000000000000000002a0", // 3
      "0000000000000000000000000000000000000000000000000000000000000380", // 4
      "0000000000000000000000000000000000000000000000000000000000000000", // 5
      "0000000000000000000000000000000000000000000000000000000000000000", // 6
      "0000000000000000000000000000000000000000000000000000000000000000", // 7
      "0000000000000000000000000000000000000000000000000000000000000000", // 8
      "0000000000000000000000000000000000000000000000000000000000000001", // 9
      "0000000000000000000000000000000000000000000000000000000000000001", // 10
      "0000000000000000000000000000000000000000000000000000000000000000", // 11 — empty array length
      "0000000000000000000000000000000000000000000000000000000000000040", // 12
      "0000000000000000000000000000000000000000000000000000000000000060", // 13
      "0000000000000000000000000000000000000000000000000000000000000000", // 14
      "0000000000000000000000000000000000000000000000000000000000000000", // 15
      "0000000000000000000000000000000000000000000000000000000000000000", // 16
      "0000000000000000000000000000000000000000000000000000000000000060", // 17
      "0000000000000000000000000000000000000000000000000000000000000080", // 18
      "0000000000000000000000000000000000000000000000000000000000000000", // 19
      "0000000000000000000000000000000000000000000000000000000000000000", // 20
      amountHex,                                                          // 21 — ticket amount
      timestampHex,                                                       // 22 — ticket timestamp
      "0000000000000000000000000000000000000000000000000000000000000060", // 23 — sig offset
      "0000000000000000000000000000000000000000000000000000000000000041", // 24 — sig length (65)
      r,                                                                  // 25 — sig r
      s,                                                                  // 26 — sig s
      vPadded,                                                            // 27 — sig v + zero padding
      "0000000000000000000000000000000000000000000000000000000000000000", // 28
      "0000000000000000000000000000000000000000000000000000000000000000", // 29
      "0000000000000000000000000000000000000000000000000000000000000001", // 30
      "0000000000000000000000000000000000000000000000000000000000000000", // 31
      "00000000000000000000000000000000000000000000000000000000000000a0", // 32
      "0000000000000000000000000000000000000000000000000000000000000000", // 33
    ];
    const data = ("0xd6d7a454" + words.join("")) as Hex;

    return {
      description: `[${this.name()}] Claim NEST emissions (${(Number(ticket.amount) / 1e18).toFixed(2)} NEST cumulative; backend-signed ts=${ticket.timestamp})`,
      to: this.voter,
      data,
      value: 0n,
      gas_estimate: 600_000,
    };
  }

  // ── internal ──

  private async fetchJson<T>(path: string): Promise<T> {
    const primary = `${this.baseUrl}${path.startsWith("/claim") ? path : path}`;
    try {
      const res = await fetch(primary, this.requestInit());
      if (res.ok) return await res.json() as T;
      if (res.status >= 500) throw new Error(`upstream ${res.status}`);
      throw DefiError.providerError(`Nest API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      if (this.baseUrl === this.fallbackUrl) throw e;
      const fallback = `${this.fallbackUrl}${path}`;
      const res = await fetch(fallback, this.requestInit());
      if (!res.ok) {
        throw DefiError.providerError(`Nest fallback ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      return await res.json() as T;
    }
  }

  private requestInit(): RequestInit {
    return { headers: { "User-Agent": "defi-cli/0.5", "Accept": "application/json" } };
  }
}
