// factory.ts dispatches by entry.interface across 11 factory functions
// (createDex / createLending / createCdp / createVault / createLiquidStaking /
// createGauge / createYieldSource / createDerivatives / createOptions /
// createNft / createOracleFromLending / createOracleFromCdp /
// createRewardReader). Each `case` is a branch; this file walks every one so
// dispatch regressions trip immediately rather than at first call site.
//
// We don't exercise the adapters' RPC paths here — that's the per-adapter
// .test.ts files' job. Calling `.name()` on each constructed adapter (where
// the trait exposes it) confirms the right constructor ran without sending
// any RPC traffic.
import { describe, it, expect } from "vitest";
import { ProtocolCategory, type ProtocolEntry } from "@hypurrquant/defi-core";
import {
  createDex,
  createLending,
  createCdp,
  createVault,
  createLiquidStaking,
  createGauge,
  createMasterChef,
  createYieldSource,
  createDerivatives,
  createOptions,
  createNft,
  createOracleFromLending,
  createOracleFromCdp,
  createRewardReader,
  createKittenSwapFarming,
  createMerchantMoeLB,
  createNestOffChain,
} from "./factory.js";

// Generic contracts blob covering every key any constructor might look up.
// Adapters that need a specific subset pluck what they want; extras are
// ignored. Addresses are deterministic 0x00...0X for grep-ability.
const ADDR = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
// Superset of every contract key any adapter constructor pokes for. Each
// adapter only inspects its own subset; unused keys are ignored. Keep keys
// alphabetised by category so adding a new adapter is a one-line append.
const ALL_CONTRACTS: Record<string, `0x${string}`> = {
  // DEX
  router: ADDR(1),
  factory: ADDR(2),
  quoter: ADDR(3),
  position_manager: ADDR(4),
  pool_manager: ADDR(5),
  vault: ADDR(6),
  pool: ADDR(15),
  lb_router: ADDR(26),
  lb_factory: ADDR(36),
  // Gauge / rewards
  voter: ADDR(7),
  gauge_manager: ADDR(8),
  ve_token: ADDR(27),
  master_chef: ADDR(9),
  masterChef: ADDR(10),
  masterchef: ADDR(28),
  farming_center: ADDR(11),
  eternal_farming: ADDR(12),
  reward_token: ADDR(13),
  bonus_reward_token: ADDR(14),
  // Lending
  oracle: ADDR(16),
  comptroller: ADDR(17),
  unitroller: ADDR(18),
  cether: ADDR(19),
  morpho_blue: ADDR(29),
  evk_vault: ADDR(30),
  euler: ADDR(31),
  comet_usdc: ADDR(32),
  comet: ADDR(33),
  controller: ADDR(34),
  // CDP
  collateral_registry: ADDR(20),
  trove_manager: ADDR(21),
  borrower_operations: ADDR(22),
  hint_helpers: ADDR(23),
  price_feed: ADDR(24),
  // Liquid staking
  staking: ADDR(35),
  stake_manager: ADDR(25),
};

function entry(overrides: Partial<ProtocolEntry>): ProtocolEntry {
  return {
    name: "Test",
    slug: "test",
    category: ProtocolCategory.Dex,
    interface: "uniswap_v3",
    chain: "hyperevm",
    contracts: ALL_CONTRACTS,
    ...overrides,
  };
}

/** Spread ALL_CONTRACTS minus the named keys — used to test "missing contract"
 * branches without tripping strict-tsc on `{ ...ALL_CONTRACTS, k: undefined }`. */
function contractsWithout(...drop: string[]): Record<string, `0x${string}`> {
  const out: Record<string, `0x${string}`> = { ...ALL_CONTRACTS };
  for (const k of drop) delete out[k];
  return out;
}

describe("createDex dispatch", () => {
  for (const iface of [
    "uniswap_v3",
    "algebra_v3",
    "uniswap_v2",
    "solidly_v2",
    "solidly_cl",
    "hybra",
    "curve_stableswap",
    "balancer_v3",
    "woofi",
  ] as const) {
    it(`constructs adapter for interface=${iface}`, () => {
      const adapter = createDex(entry({ interface: iface }));
      expect(adapter.name()).toBe("Test");
    });
  }

  it("throws specific Uniswap V4 message", () => {
    expect(() => createDex(entry({ interface: "uniswap_v4" }))).toThrow(/Uniswap V4/);
  });

  it("throws generic 'not yet implemented' for any other interface", () => {
    expect(() => createDex(entry({ interface: "no_such_iface" }))).toThrow(/not yet implemented/);
  });
});

describe("createLending dispatch", () => {
  for (const iface of [
    "aave_v3",
    "aave_v3_isolated",
    "aave_v2",
    "morpho_blue",
    "euler_v2",
    "compound_v2",
    "compound_v3",
  ] as const) {
    it(`constructs adapter for interface=${iface}`, () => {
      const adapter = createLending(
        entry({ category: ProtocolCategory.Lending, interface: iface }),
      );
      expect(adapter.name()).toBe("Test");
    });
  }

  it("throws for unknown lending interface", () => {
    expect(() =>
      createLending(entry({ category: ProtocolCategory.Lending, interface: "no_such" })),
    ).toThrow(/not yet implemented/);
  });
});

describe("createCdp / createVault dispatch", () => {
  it("createCdp constructs FelixCdpAdapter for liquity_v2", () => {
    const a = createCdp(entry({ category: ProtocolCategory.Cdp, interface: "liquity_v2" }));
    expect(a.name()).toBe("Test");
  });

  it("createCdp throws for unknown interface", () => {
    expect(() =>
      createCdp(entry({ category: ProtocolCategory.Cdp, interface: "no_such" })),
    ).toThrow(/not yet implemented/);
  });

  for (const iface of ["erc4626", "beefy_vault"] as const) {
    it(`createVault constructs ERC4626VaultAdapter for ${iface}`, () => {
      const a = createVault(
        entry({ category: ProtocolCategory.Vault, interface: iface }),
      );
      expect(a.name()).toBe("Test");
    });
  }

  it("createVault throws for unknown interface", () => {
    expect(() =>
      createVault(entry({ category: ProtocolCategory.Vault, interface: "no_such" })),
    ).toThrow(/not yet implemented/);
  });
});

describe("createLiquidStaking dispatch (falls back to GenericLst)", () => {
  for (const iface of ["kinetiq_staking", "sthype_staking", "hyperbeat_lst", "kintsu"] as const) {
    it(`constructs adapter for interface=${iface}`, () => {
      const a = createLiquidStaking(
        entry({ category: ProtocolCategory.LiquidStaking, interface: iface }),
      );
      expect(a.name()).toBe("Test");
    });
  }

  it("falls back to GenericLstAdapter for unknown interface (per design)", () => {
    const a = createLiquidStaking(
      entry({ category: ProtocolCategory.LiquidStaking, interface: "no_such_lst" }),
    );
    expect(a.name()).toBe("Test");
  });
});

describe("createGauge dispatch", () => {
  it("hybra interface routes to HybraGaugeAdapter (early return)", () => {
    const a = createGauge(entry({ interface: "hybra" }));
    expect(a.name()).toBe("Test");
  });

  it("gauge_manager contract presence routes to HybraGaugeAdapter even for other interface", () => {
    const a = createGauge(entry({ interface: "uniswap_v3" }));
    // ALL_CONTRACTS has gauge_manager → early return path
    expect(a.name()).toBe("Test");
  });

  for (const iface of ["solidly_v2", "solidly_cl", "algebra_v3"] as const) {
    it(`${iface} (no gauge_manager) routes to SolidlyGaugeAdapter`, () => {
      const a = createGauge(
        entry({ interface: iface, contracts: contractsWithout("gauge_manager") }),
      );
      expect(a.name()).toBe("Test");
    });
  }

  it("uniswap_v3 with voter routes to SolidlyGaugeAdapter (ve(3,3) CL)", () => {
    const a = createGauge(
      entry({
        interface: "uniswap_v3",
        contracts: { ...contractsWithout("gauge_manager"), voter: ADDR(7) },
      }),
    );
    expect(a.name()).toBe("Test");
  });

  it("uniswap_v3 without voter or gauge_manager throws", () => {
    expect(() =>
      createGauge(
        entry({
          interface: "uniswap_v3",
          contracts: contractsWithout("gauge_manager", "voter"),
        }),
      ),
    ).toThrow(/no voter/);
  });

  it("unknown gauge interface throws", () => {
    expect(() =>
      createGauge(
        entry({ interface: "no_such_gauge", contracts: contractsWithout("gauge_manager") }),
      ),
    ).toThrow(/not supported/);
  });
});

describe("createYieldSource / createDerivatives / createOptions dispatch", () => {
  it("createYieldSource: pendle_v2 → PendleAdapter", () => {
    const a = createYieldSource(entry({ interface: "pendle_v2" }));
    expect(a.name()).toBe("Test");
  });

  it("createYieldSource: unknown → GenericYieldAdapter (fallback)", () => {
    const a = createYieldSource(entry({ interface: "anything_else" }));
    expect(a.name()).toBe("Test");
  });

  it("createDerivatives: hlp_vault → HlpVaultAdapter", () => {
    const a = createDerivatives(entry({ interface: "hlp_vault" }));
    expect(a.name()).toBe("Test");
  });

  it("createDerivatives: unknown → GenericDerivativesAdapter (fallback)", () => {
    const a = createDerivatives(entry({ interface: "no_such_deriv" }));
    expect(a.name()).toBe("Test");
  });

  it("createOptions: rysk → RyskAdapter", () => {
    const a = createOptions(entry({ interface: "rysk" }));
    expect(a.name()).toBe("Test");
  });

  it("createOptions: unknown → GenericOptionsAdapter (fallback)", () => {
    const a = createOptions(entry({ interface: "no_such_opt" }));
    expect(a.name()).toBe("Test");
  });
});

describe("createNft / oracle dispatch", () => {
  it("createNft: erc721 → ERC721Adapter", () => {
    const a = createNft(entry({ interface: "erc721" }));
    expect(a.name()).toBe("Test");
  });

  it("createNft: marketplace throws (not queryable as ERC-721)", () => {
    expect(() => createNft(entry({ interface: "marketplace" }))).toThrow(
      /not queryable as ERC-721/,
    );
  });

  it("createNft: unknown throws", () => {
    expect(() => createNft(entry({ interface: "no_such_nft" }))).toThrow(/not supported/);
  });

  for (const iface of ["aave_v3", "aave_v3_isolated"] as const) {
    it(`createOracleFromLending: ${iface} → AaveOracleAdapter`, () => {
      const a = createOracleFromLending(entry({ interface: iface }), "https://rpc/example");
      expect(typeof a.getPrice).toBe("function");
    });
  }

  it("createOracleFromLending: unknown throws", () => {
    expect(() =>
      createOracleFromLending(entry({ interface: "no_such" }), "https://rpc/example"),
    ).toThrow(/Oracle not available/);
  });

  it("createOracleFromCdp: liquity_v2 → FelixOracleAdapter", () => {
    const a = createOracleFromCdp(entry({ interface: "liquity_v2" }), ADDR(99), "https://rpc/example");
    expect(typeof a.getPrice).toBe("function");
  });

  it("createOracleFromCdp: unknown throws", () => {
    expect(() =>
      createOracleFromCdp(entry({ interface: "no_such" }), ADDR(99), "https://rpc/example"),
    ).toThrow(/Oracle not available/);
  });
});

describe("createMasterChef / createMerchantMoeLB / createNestOffChain (no-dispatch wrappers)", () => {
  it("createMasterChef returns MasterChefAdapter", () => {
    const a = createMasterChef(entry({}));
    expect(a.name()).toBe("Test");
  });

  it("createMerchantMoeLB returns MerchantMoeLBAdapter", () => {
    const a = createMerchantMoeLB(entry({}));
    expect(typeof a).toBe("object");
  });

  it("createNestOffChain returns NestOffChainAdapter", () => {
    const a = createNestOffChain(entry({}));
    expect(typeof a).toBe("object");
  });
});

describe("createRewardReader strategy dispatch", () => {
  it("explicit reward_strategy=off_chain_api", () => {
    const r = createRewardReader(entry({ reward_strategy: "off_chain_api" }));
    expect(r.kind).toBe("off_chain_api");
  });

  it("explicit reward_strategy=on_chain_farming_center (requires rpcUrl)", () => {
    const r = createRewardReader(
      entry({ reward_strategy: "on_chain_farming_center" }),
      "https://rpc/example",
    );
    expect(r.kind).toBe("on_chain_farming_center");
  });

  it("on_chain_farming_center without rpcUrl throws", () => {
    expect(() =>
      createRewardReader(entry({ reward_strategy: "on_chain_farming_center" })),
    ).toThrow(/rpcUrl required/);
  });

  it("explicit reward_strategy=on_chain_gauge_tokenid", () => {
    const r = createRewardReader(entry({ reward_strategy: "on_chain_gauge_tokenid" }));
    expect(r.kind).toBe("on_chain_gauge_tokenid");
  });

  it("explicit reward_strategy=on_chain_gauge", () => {
    const r = createRewardReader(entry({ reward_strategy: "on_chain_gauge" }));
    expect(r.kind).toBe("on_chain_gauge");
  });

  it("explicit reward_strategy=auto_stake", () => {
    const r = createRewardReader(entry({ reward_strategy: "auto_stake" }));
    expect(r.kind).toBe("auto_stake");
  });

  it("explicit reward_strategy=on_chain_masterchef", () => {
    const r = createRewardReader(entry({ reward_strategy: "on_chain_masterchef" }));
    expect(r.kind).toBe("on_chain_masterchef");
  });

  it("explicit reward_strategy=none", () => {
    const r = createRewardReader(entry({ reward_strategy: "none" }));
    expect(r.kind).toBe("none");
  });

  it("missing reward_strategy + hybra interface infers on_chain_gauge_tokenid", () => {
    const r = createRewardReader(
      entry({ interface: "hybra", contracts: contractsWithout("voter") }),
    );
    expect(r.kind).toBe("on_chain_gauge_tokenid");
  });

  it("missing reward_strategy + farming_center + eternal_farming infers on_chain_farming_center", () => {
    const r = createRewardReader(
      entry({
        interface: "algebra_v3",
        contracts: contractsWithout("gauge_manager", "voter"),
      }),
      "https://rpc/example",
    );
    expect(r.kind).toBe("on_chain_farming_center");
  });

  it("missing reward_strategy + voter only infers on_chain_gauge", () => {
    const r = createRewardReader(
      entry({
        interface: "solidly_v2",
        contracts: contractsWithout("gauge_manager", "farming_center", "eternal_farming"),
      }),
    );
    expect(r.kind).toBe("on_chain_gauge");
  });

  it("missing reward_strategy + master_chef only infers on_chain_masterchef", () => {
    const r = createRewardReader(
      entry({
        interface: "uniswap_v2",
        contracts: contractsWithout("gauge_manager", "farming_center", "eternal_farming", "voter"),
      }),
    );
    expect(r.kind).toBe("on_chain_masterchef");
  });

  it("missing reward_strategy + bare entry infers none", () => {
    const r = createRewardReader(
      entry({ interface: "uniswap_v2", contracts: {} }),
    );
    expect(r.kind).toBe("none");
  });
});

describe("createKittenSwapFarming missing-contract guards", () => {
  const base = (overrides: Record<string, string | undefined>): ProtocolEntry =>
    entry({
      interface: "algebra_v3",
      contracts: {
        farming_center: ADDR(11),
        eternal_farming: ADDR(12),
        position_manager: ADDR(4),
        ...overrides,
      },
    });

  it("missing farming_center throws", () => {
    expect(() => createKittenSwapFarming(base({ farming_center: undefined }), "https://rpc/example"))
      .toThrow(/farming_center/);
  });

  it("missing eternal_farming throws", () => {
    expect(() => createKittenSwapFarming(base({ eternal_farming: undefined }), "https://rpc/example"))
      .toThrow(/eternal_farming/);
  });

  it("missing position_manager throws", () => {
    expect(() => createKittenSwapFarming(base({ position_manager: undefined }), "https://rpc/example"))
      .toThrow(/position_manager/);
  });

  it("all required contracts present constructs adapter", () => {
    const a = createKittenSwapFarming(base({}), "https://rpc/example");
    expect(typeof a).toBe("object");
  });
});
