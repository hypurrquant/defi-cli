/**
 * Executor regression tests.
 *
 * Locks behaviour fixed in v1.0.5–v1.0.11:
 * - v1.0.10: EIP-1559 maxFee = `baseFee * 1.25 + priorityFee` (was 2× before;
 *   doubled the budget on chains where baseFee is already elevated like Mantle
 *   ~50 gwei, draining MNT and breaking multi-step tx flows).
 * - v1.0.11: native-sentinel skip in approve path — `allowance()` is never
 *   called for the zero address or the 0xeeee… aggregator native marker
 *   (those addresses have no ERC20 interface and the read would revert).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Address } from "viem";
import { Executor } from "./executor.js";

const readContractMock = vi.fn();
const callMock = vi.fn();
const estimateGasMock = vi.fn();
const getBlockMock = vi.fn();
const estimateMaxPriorityFeePerGasMock = vi.fn();
const getGasPriceMock = vi.fn();
const waitForTransactionReceiptMock = vi.fn();
const sendTransactionMock = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({
      readContract: readContractMock,
      call: callMock,
      estimateGas: estimateGasMock,
      getBlock: getBlockMock,
      estimateMaxPriorityFeePerGas: estimateMaxPriorityFeePerGasMock,
      getGasPrice: getGasPriceMock,
      waitForTransactionReceipt: waitForTransactionReceiptMock,
    }),
    createWalletClient: ({ account }: { account: { address: `0x${string}` } }) => ({
      account,
      sendTransaction: sendTransactionMock,
    }),
    http: () => () => ({}),
  };
});

describe("Executor.computeMaxFee — v1.0.10 EIP-1559 formula", () => {
  it("computes maxFee = baseFee * 1.25 + priorityFee for typical L1 baseFee", () => {
    // baseFee 20 gwei, priority 2 gwei → maxFee 25 + 2 = 27 gwei
    const baseFee = 20_000_000_000n;
    const priority = 2_000_000_000n;
    expect(Executor.computeMaxFee(baseFee, priority)).toBe(27_000_000_000n);
  });

  it("does not double-count priority on Mantle-class elevated baseFee", () => {
    // The pre-v1.0.10 bug used `baseFee * 2 + priorityFee`, so this exact
    // input would have produced 100 + 1 = 101 gwei (drains MNT). The fix is
    // 1.25× → 62.5 + 1 = 63.5 gwei. Lock the bigint result.
    const baseFee = 50_000_000_000n; // 50 gwei (typical Mantle range)
    const priority = 1_000_000_000n;
    expect(Executor.computeMaxFee(baseFee, priority)).toBe(63_500_000_000n);
    // The legacy 2× formula would have produced this — must NOT match.
    expect(Executor.computeMaxFee(baseFee, priority)).not.toBe(101_000_000_000n);
  });

  it("preserves zero priority correctly (1.25× of baseFee only)", () => {
    expect(Executor.computeMaxFee(80_000_000_000n, 0n)).toBe(100_000_000_000n);
  });

  it("rounds toward zero on integer division (no off-by-one drift)", () => {
    // baseFee = 4n → 4 * 125 / 100 = 500 / 100 = 5 (exact). priority 1 → 6.
    expect(Executor.computeMaxFee(4n, 1n)).toBe(6n);
    // baseFee = 7n → 7 * 125 / 100 = 875 / 100 = 8 (truncated). priority 0.
    expect(Executor.computeMaxFee(7n, 0n)).toBe(8n);
  });
});

describe("Executor.isNativeSentinel — v1.0.11 fix", () => {
  // The helper is module-private; access it through any-cast. Keeping it
  // private is intentional (only the approval paths inside Executor should
  // call it), but the regression check has to verify the predicate returns
  // the right answer for known inputs.
  const isNative = (Executor as unknown as { isNativeSentinel: (t: string) => boolean }).isNativeSentinel;

  it("matches the 0x0 internal native marker (case-insensitive)", () => {
    expect(isNative("0x0000000000000000000000000000000000000000")).toBe(true);
    expect(isNative("0x0000000000000000000000000000000000000000".toUpperCase())).toBe(true);
  });

  it("matches the 1inch / KyberSwap / OpenOcean native sentinel 0xeeee…", () => {
    expect(isNative("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")).toBe(true);
    expect(isNative("0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE")).toBe(true);
    expect(isNative("0xEeEeeEeeeEeEeeEeEeEeEEEeeeeEeeeEeEeEEEEe")).toBe(true);
  });

  it("does not match real ERC20 addresses (HyperEVM USDC, BNB USDT, Base WETH)", () => {
    expect(isNative("0xb88339CB7199b77E23DB6E890353E22632Ba630f")).toBe(false);
    expect(isNative("0x55d398326f99059fF775485246999027B3197955")).toBe(false);
    expect(isNative("0x4200000000000000000000000000000000000006")).toBe(false);
  });

  it("does not match the 0x000…001 placeholder used for dry-run-without-key", () => {
    expect(isNative("0x0000000000000000000000000000000000000001")).toBe(false);
  });
});

describe("Executor.execute simulate path — v1.0.11 native-sentinel skip wire", () => {
  beforeEach(() => {
    readContractMock.mockReset();
    callMock.mockReset();
    estimateGasMock.mockReset();
    getBlockMock.mockReset();
    estimateMaxPriorityFeePerGasMock.mockReset();
    getGasPriceMock.mockReset();
    // Defaults: simulate's downstream calls succeed with realistic shapes.
    callMock.mockResolvedValue({});
    estimateGasMock.mockResolvedValue(100_000n);
    estimateMaxPriorityFeePerGasMock.mockResolvedValue(2_000_000_000n);
    getBlockMock.mockResolvedValue({ baseFeePerGas: 20_000_000_000n });
    getGasPriceMock.mockResolvedValue(22_000_000_000n);
  });

  const NATIVE_ZERO = "0x0000000000000000000000000000000000000000" as Address;
  const NATIVE_EEEE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;
  const REAL_ERC20 = "0xb88339CB7199b77E23DB6E890353E22632Ba630f" as Address;
  const SPENDER = "0x000000000000000000000000000000000000dEaD" as Address;
  const TARGET = "0x1111111111111111111111111111111111111111" as Address;

  it("never calls allowance() when the only approval is the 0x0 native sentinel", async () => {
    const exec = new Executor(/*broadcast*/ false, "https://example/rpc");
    await exec.execute({
      description: "swap native ETH",
      to: TARGET,
      data: "0xdeadbeef",
      value: 1_000_000_000_000_000_000n,
      gas_estimate: 200_000,
      approvals: [{ token: NATIVE_ZERO, spender: SPENDER, amount: 1n }],
    });
    // The wire fix: simulate() must skip readContract when token is sentinel.
    // If a regression resumes the call, this fires.
    const allowanceCalls = readContractMock.mock.calls.filter(
      ([arg]) => (arg as { functionName: string }).functionName === "allowance",
    );
    expect(allowanceCalls).toHaveLength(0);
  });

  it("never calls allowance() when the only approval is the 0xeeee… aggregator sentinel", async () => {
    const exec = new Executor(/*broadcast*/ false, "https://example/rpc");
    await exec.execute({
      description: "1inch native swap",
      to: TARGET,
      data: "0xfeedface",
      value: 5n,
      gas_estimate: 200_000,
      approvals: [{ token: NATIVE_EEEE, spender: SPENDER, amount: 5n }],
    });
    const allowanceCalls = readContractMock.mock.calls.filter(
      ([arg]) => (arg as { functionName: string }).functionName === "allowance",
    );
    expect(allowanceCalls).toHaveLength(0);
  });

  it("DOES call allowance() for a real ERC20 approval (control case — sentinel skip not over-applied)", async () => {
    readContractMock.mockResolvedValueOnce(0n); // allowance read returns 0 → simulate marks as needs_approval
    const exec = new Executor(/*broadcast*/ false, "https://example/rpc");
    await exec.execute({
      description: "real ERC20 swap",
      to: TARGET,
      data: "0xfeedface",
      value: 0n,
      gas_estimate: 200_000,
      approvals: [{ token: REAL_ERC20, spender: SPENDER, amount: 100n }],
    });
    const allowanceCalls = readContractMock.mock.calls.filter(
      ([arg]) => (arg as { functionName: string }).functionName === "allowance",
    );
    expect(allowanceCalls).toHaveLength(1);
    expect((allowanceCalls[0]![0] as { address: Address }).address).toBe(REAL_ERC20);
  });
});

describe("Executor.execute broadcast path — v1.0.11 native-sentinel skip wire (checkAndApprove)", () => {
  // Use Anvil's deterministic test key #0 — well-known throwaway, never holds funds.
  const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const NATIVE_ZERO = "0x0000000000000000000000000000000000000000" as Address;
  const NATIVE_EEEE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;
  const REAL_ERC20 = "0xb88339CB7199b77E23DB6E890353E22632Ba630f" as Address;
  const SPENDER = "0x000000000000000000000000000000000000dEaD" as Address;
  const TARGET = "0x1111111111111111111111111111111111111111" as Address;

  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env["DEFI_PRIVATE_KEY"];
    process.env["DEFI_PRIVATE_KEY"] = TEST_KEY;
    readContractMock.mockReset();
    callMock.mockReset();
    estimateGasMock.mockReset();
    getBlockMock.mockReset();
    estimateMaxPriorityFeePerGasMock.mockReset();
    getGasPriceMock.mockReset();
    waitForTransactionReceiptMock.mockReset();
    sendTransactionMock.mockReset();
    estimateGasMock.mockResolvedValue(100_000n);
    estimateMaxPriorityFeePerGasMock.mockResolvedValue(2_000_000_000n);
    getBlockMock.mockResolvedValue({ baseFeePerGas: 20_000_000_000n });
    getGasPriceMock.mockResolvedValue(22_000_000_000n);
    sendTransactionMock.mockResolvedValue("0xabc1230000000000000000000000000000000000000000000000000000000000");
    waitForTransactionReceiptMock.mockResolvedValue({ status: "success", logs: [], blockNumber: 1n, gasUsed: 50_000n });
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env["DEFI_PRIVATE_KEY"];
    else process.env["DEFI_PRIVATE_KEY"] = savedKey;
  });

  it("checkAndApprove: skip allowance() for 0x0 native sentinel in broadcast mode", async () => {
    const exec = new Executor(/*broadcast*/ true, "https://example/rpc", "https://example/explorer");
    await exec.execute({
      description: "broadcast native swap",
      to: TARGET,
      data: "0xdeadbeef",
      value: 1_000_000_000_000_000_000n,
      gas_estimate: 200_000,
      approvals: [{ token: NATIVE_ZERO, spender: SPENDER, amount: 1n }],
    });
    const allowanceCalls = readContractMock.mock.calls.filter(
      ([arg]) => (arg as { functionName: string }).functionName === "allowance",
    );
    expect(allowanceCalls).toHaveLength(0);
    expect(sendTransactionMock).toHaveBeenCalledTimes(1); // only the main tx, no approve tx
  });

  it("checkAndApprove: skip allowance() for 0xeeee aggregator sentinel in broadcast mode", async () => {
    const exec = new Executor(true, "https://example/rpc");
    await exec.execute({
      description: "broadcast 1inch native",
      to: TARGET,
      data: "0xfeedface",
      value: 5n,
      gas_estimate: 200_000,
      approvals: [{ token: NATIVE_EEEE, spender: SPENDER, amount: 5n }],
    });
    const allowanceCalls = readContractMock.mock.calls.filter(
      ([arg]) => (arg as { functionName: string }).functionName === "allowance",
    );
    expect(allowanceCalls).toHaveLength(0);
  });

  it("checkAndApprove: DOES call allowance() for real ERC20 in broadcast mode (control)", async () => {
    // Allowance is sufficient (>= amount) → no approve tx, just main tx.
    readContractMock.mockResolvedValueOnce(10n ** 30n); // allowance is huge
    const exec = new Executor(true, "https://example/rpc");
    await exec.execute({
      description: "broadcast real ERC20",
      to: TARGET,
      data: "0xfeedface",
      value: 0n,
      gas_estimate: 200_000,
      approvals: [{ token: REAL_ERC20, spender: SPENDER, amount: 100n }],
    });
    const allowanceCalls = readContractMock.mock.calls.filter(
      ([arg]) => (arg as { functionName: string }).functionName === "allowance",
    );
    expect(allowanceCalls).toHaveLength(1);
    expect(sendTransactionMock).toHaveBeenCalledTimes(1); // sufficient allowance → no extra approve tx
  });
});
