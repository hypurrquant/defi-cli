import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData } from "viem";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DefiError } from "@hypurrquant/defi-core";
import { TxStatus } from "@hypurrquant/defi-core";
import type { ActionResult, DeFiTx } from "@hypurrquant/defi-core";

const ERC20_ABI = parseAbi([
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
]);

/** Gas buffer multiplier: 120% over estimated gas (20% headroom) */
const GAS_BUFFER_BPS = 12000n;

/** Default max priority fee (tip) in wei — 20 gwei (safe for Mantle + EVM chains) */
const DEFAULT_PRIORITY_FEE_WEI = 20_000_000_000n;

/** Max gas limit cap — Mantle uses high gas units (up to 5B for complex txs) */
const MAX_GAS_LIMIT = 5_000_000_000n; // 5B

export class Executor {
  readonly dryRun: boolean;
  readonly rpcUrl: string | undefined;
  readonly explorerUrl: string | undefined;

  constructor(broadcast: boolean, rpcUrl?: string, explorerUrl?: string) {
    this.dryRun = !broadcast;
    this.rpcUrl = rpcUrl;
    this.explorerUrl = explorerUrl;
  }

  /** Apply 20% buffer to a gas estimate */
  private static applyGasBuffer(gas: bigint): bigint {
    return (gas * GAS_BUFFER_BPS) / 10000n;
  }

  /**
   * Check allowance for a single token/spender pair and send an approve tx if needed.
   * Only called in broadcast mode (not dry-run).
   */
  private async checkAndApprove(
    token: Address,
    spender: Address,
    amount: bigint,
    owner: Address,
    publicClient: ReturnType<typeof createPublicClient>,
    walletClient: ReturnType<typeof createWalletClient>,
  ): Promise<void> {
    const allowance = await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    });

    if (allowance >= amount) return;

    process.stderr.write(
      `  Approving ${amount} of ${token} for ${spender}...\n`,
    );

    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    });

    const rpcUrl = this.rpcUrl!;
    const gasLimit = await (async () => {
      try {
        const estimated = await publicClient.estimateGas({
          to: token,
          data: approveData,
          account: owner,
        });
        const buffered = Executor.applyGasBuffer(estimated);
        return buffered > MAX_GAS_LIMIT ? MAX_GAS_LIMIT : buffered;
      } catch {
        return 80_000n;
      }
    })();

    const [maxFeePerGas, maxPriorityFeePerGas] = await this.fetchEip1559Fees(rpcUrl);

    const approveTxHash = await walletClient.sendTransaction({
      chain: null,
      account: walletClient.account!,
      to: token,
      data: approveData,
      gas: gasLimit > 0n ? gasLimit : undefined,
      maxFeePerGas: maxFeePerGas > 0n ? maxFeePerGas : undefined,
      maxPriorityFeePerGas: maxPriorityFeePerGas > 0n ? maxPriorityFeePerGas : undefined,
    });

    const approveTxUrl = this.explorerUrl
      ? `${this.explorerUrl}/tx/${approveTxHash}`
      : undefined;
    process.stderr.write(`  Approve tx: ${approveTxHash}\n`);
    if (approveTxUrl) process.stderr.write(`  Explorer: ${approveTxUrl}\n`);

    await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
    process.stderr.write(
      `  Approved ${amount} of ${token} for ${spender}\n`,
    );
  }

  /** Fetch EIP-1559 fee params from the network. Returns [maxFeePerGas, maxPriorityFeePerGas]. */
  private async fetchEip1559Fees(rpcUrl: string): Promise<[bigint, bigint]> {
    try {
      const client = createPublicClient({ transport: http(rpcUrl) });
      const gasPrice = await client.getGasPrice();
      let priorityFee = DEFAULT_PRIORITY_FEE_WEI;
      try {
        priorityFee = await client.estimateMaxPriorityFeePerGas();
      } catch {
        // fallback to default
      }
      const maxFee = gasPrice * 2n + priorityFee;
      return [maxFee, priorityFee];
    } catch {
      return [0n, 0n];
    }
  }

  /** Estimate gas dynamically with buffer, falling back to a hardcoded estimate */
  private async estimateGasWithBuffer(
    rpcUrl: string,
    tx: DeFiTx,
    from: `0x${string}`,
  ): Promise<bigint> {
    try {
      const client = createPublicClient({ transport: http(rpcUrl) });
      const estimated = await client.estimateGas({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        account: from,
      });
      if (estimated > 0n) {
        const buffered = Executor.applyGasBuffer(estimated);
        return buffered > MAX_GAS_LIMIT ? MAX_GAS_LIMIT : buffered;
      }
    } catch {
      // fallback: apply buffer to the hint too
      if (tx.gas_estimate) {
        return Executor.applyGasBuffer(BigInt(tx.gas_estimate));
      }
    }
    return 0n;
  }

  /** Simulate a transaction via eth_call + eth_estimateGas */
  private async simulate(tx: DeFiTx): Promise<ActionResult> {
    const rpcUrl = this.rpcUrl;
    if (!rpcUrl) {
      throw DefiError.rpcError("No RPC URL — cannot simulate. Set HYPEREVM_RPC_URL.");
    }

    const client = createPublicClient({ transport: http(rpcUrl) });

    const privateKey = process.env["DEFI_PRIVATE_KEY"];
    const from: `0x${string}` = privateKey
      ? privateKeyToAccount(privateKey as `0x${string}`).address
      : "0x0000000000000000000000000000000000000001";

    // Check approvals before simulation
    if (tx.approvals && tx.approvals.length > 0) {
      const pendingApprovals: Array<{ token: string; spender: string; needed: string; current: string }> = [];
      for (const approval of tx.approvals) {
        try {
          const allowance = await client.readContract({
            address: approval.token,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [from as `0x${string}`, approval.spender],
          });
          if (allowance < approval.amount) {
            pendingApprovals.push({
              token: approval.token,
              spender: approval.spender,
              needed: approval.amount.toString(),
              current: allowance.toString(),
            });
          }
        } catch { /* skip check on error */ }
      }
      if (pendingApprovals.length > 0) {
        return {
          tx_hash: undefined,
          status: TxStatus.NeedsApproval,
          gas_used: tx.gas_estimate,
          description: tx.description,
          details: {
            to: tx.to,
            from,
            data: tx.data,
            value: tx.value.toString(),
            mode: "simulated",
            result: "needs_approval",
            pending_approvals: pendingApprovals,
            hint: "Use --broadcast to auto-approve and execute",
          },
        };
      }
    }

    try {
      await client.call({ to: tx.to, data: tx.data, value: tx.value, account: from });

      const gasEstimate = await this.estimateGasWithBuffer(rpcUrl, tx, from);
      const [maxFee, priorityFee] = await this.fetchEip1559Fees(rpcUrl);

      return {
        tx_hash: undefined,
        status: "simulated" as TxStatus,
        gas_used: gasEstimate > 0n ? Number(gasEstimate) : undefined,
        description: tx.description,
        details: {
          to: tx.to,
          from,
          data: tx.data,
          value: tx.value.toString(),
          gas_estimate: gasEstimate.toString(),
          max_fee_per_gas_gwei: (Number(maxFee) / 1e9).toFixed(4),
          max_priority_fee_gwei: (Number(priorityFee) / 1e9).toFixed(4),
          mode: "simulated",
          result: "success",
        },
      };
    } catch (e: unknown) {
      const errMsg = String(e);
      const revertReason = extractRevertReason(errMsg);

      return {
        tx_hash: undefined,
        status: "simulation_failed" as TxStatus,
        gas_used: tx.gas_estimate,
        description: tx.description,
        details: {
          to: tx.to,
          from,
          data: tx.data,
          value: tx.value.toString(),
          mode: "simulated",
          result: "revert",
          revert_reason: revertReason,
        },
      };
    }
  }

  async execute(tx: DeFiTx): Promise<ActionResult> {
    if (this.dryRun) {
      if (this.rpcUrl) {
        return this.simulate(tx);
      }

      return {
        tx_hash: undefined,
        status: "dry_run" as TxStatus,
        gas_used: tx.gas_estimate,
        description: tx.description,
        details: {
          to: tx.to,
          data: tx.data,
          value: tx.value.toString(),
          mode: "dry_run",
        },
      };
    }

    // === Broadcast mode ===
    const privateKey = process.env["DEFI_PRIVATE_KEY"];
    if (!privateKey) {
      throw DefiError.invalidParam(
        "DEFI_PRIVATE_KEY environment variable not set. Required for --broadcast.",
      );
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const rpcUrl = this.rpcUrl;
    if (!rpcUrl) {
      throw DefiError.rpcError("No RPC URL configured for broadcasting");
    }

    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, transport: http(rpcUrl) });

    // Execute pre-transactions (e.g. farming approval)
    if (tx.pre_txs && tx.pre_txs.length > 0) {
      for (const preTx of tx.pre_txs) {
        process.stderr.write(`  Pre-tx: ${preTx.description}...\n`);
        const preGas = await this.estimateGasWithBuffer(rpcUrl, preTx, account.address);
        const preTxHash = await walletClient.sendTransaction({
          chain: null,
          to: preTx.to,
          data: preTx.data,
          value: preTx.value,
          gas: preGas > 0n ? preGas : undefined,
        });
        const preTxUrl = this.explorerUrl ? `${this.explorerUrl}/tx/${preTxHash}` : undefined;
        process.stderr.write(`  Pre-tx sent: ${preTxHash}\n`);
        if (preTxUrl) process.stderr.write(`  Explorer: ${preTxUrl}\n`);
        const preReceipt = await publicClient.waitForTransactionReceipt({ hash: preTxHash });
        if (preReceipt.status !== "success") {
          throw new DefiError("TX_FAILED", `Pre-transaction failed: ${preTx.description}`);
        }
        process.stderr.write(`  Pre-tx confirmed\n`);
      }
    }

    // Auto-approve ERC20 tokens if needed
    if (tx.approvals && tx.approvals.length > 0) {
      for (const approval of tx.approvals) {
        await this.checkAndApprove(
          approval.token,
          approval.spender,
          approval.amount,
          account.address,
          publicClient,
          walletClient,
        );
      }
    }

    // Dynamic gas estimation with buffer
    const gasLimit = await this.estimateGasWithBuffer(rpcUrl, tx, account.address);

    // EIP-1559 gas pricing
    const [maxFeePerGas, maxPriorityFeePerGas] = await this.fetchEip1559Fees(rpcUrl);

    process.stderr.write(`Broadcasting transaction to ${rpcUrl}...\n`);
    if (gasLimit > 0n) {
      process.stderr.write(`  Gas limit: ${gasLimit} (with 20% buffer)\n`);
    }

    const txHash = await walletClient.sendTransaction({
      chain: null,
      to: tx.to,
      data: tx.data,
      value: tx.value,
      gas: gasLimit > 0n ? gasLimit : undefined,
      maxFeePerGas: maxFeePerGas > 0n ? maxFeePerGas : undefined,
      maxPriorityFeePerGas: maxPriorityFeePerGas > 0n ? maxPriorityFeePerGas : undefined,
    });

    const txUrl = this.explorerUrl ? `${this.explorerUrl}/tx/${txHash}` : undefined;
    process.stderr.write(`Transaction sent: ${txHash}\n`);
    if (txUrl) process.stderr.write(`Explorer: ${txUrl}\n`);
    process.stderr.write("Waiting for confirmation...\n");

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    const status = receipt.status === "success" ? "confirmed" : "failed";

    // Extract minted NFT tokenId from Transfer(from=0x0) events
    let mintedTokenId: string | undefined;
    if (receipt.status === "success" && receipt.logs) {
      const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      const ZERO_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000000";
      for (const log of receipt.logs) {
        if (
          log.topics.length >= 4 &&
          log.topics[0] === TRANSFER_TOPIC &&
          log.topics[1] === ZERO_TOPIC // from = address(0) → mint
        ) {
          mintedTokenId = BigInt(log.topics[3]!).toString();
          break;
        }
      }
    }

    const details: Record<string, string | undefined> = {
      to: tx.to,
      from: account.address,
      block_number: receipt.blockNumber?.toString(),
      gas_limit: gasLimit.toString(),
      gas_used: receipt.gasUsed?.toString(),
      explorer_url: txUrl,
      mode: "broadcast",
    };
    if (mintedTokenId) {
      details.minted_token_id = mintedTokenId;
      process.stderr.write(`  Minted NFT tokenId: ${mintedTokenId}\n`);
    }

    return {
      tx_hash: txHash,
      status: status as TxStatus,
      gas_used: receipt.gasUsed ? Number(receipt.gasUsed) : undefined,
      description: tx.description,
      details,
    };
  }
}

/** Extract a human-readable revert reason from an RPC error message */
function extractRevertReason(err: string): string {
  for (const marker of ["execution reverted:", "revert:", "Error("]) {
    const pos = err.indexOf(marker);
    if (pos !== -1) return err.slice(pos);
  }
  return err.length > 200 ? err.slice(0, 200) + "..." : err;
}
