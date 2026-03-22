import type { OpenCdpParams, AdjustCdpParams, CloseCdpParams, CdpInfo, DeFiTx } from "../types.js";

export interface ICdp {
  name(): string;
  buildOpen(params: OpenCdpParams): Promise<DeFiTx>;
  buildAdjust(params: AdjustCdpParams): Promise<DeFiTx>;
  buildClose(params: CloseCdpParams): Promise<DeFiTx>;
  getCdpInfo(cdpId: bigint): Promise<CdpInfo>;
}
