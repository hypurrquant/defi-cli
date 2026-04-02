import { loadOws } from "./ows-loader.js";

/**
 * EVM signer backed by Open Wallet Standard.
 * Keys never leave the OWS encrypted vault.
 */
export class OwsEvmSigner {
  private _address: string;
  private _walletName: string;
  private _passphrase: string;

  private constructor(walletName: string, address: string, passphrase: string) {
    this._walletName = walletName;
    this._address = address;
    this._passphrase = passphrase;
  }

  static create(walletName: string, passphrase = ""): OwsEvmSigner {
    const ows = loadOws();
    const wallet = ows.getWallet(walletName);
    const evmAccount = wallet.accounts.find(
      (a: { chainId: string }) => a.chainId.startsWith("eip155:"),
    );
    if (!evmAccount) {
      throw new Error(`OWS wallet "${walletName}" has no EVM account`);
    }
    return new OwsEvmSigner(walletName, evmAccount.address, passphrase);
  }

  getAddress(): string {
    return this._address;
  }

  async signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>,
  ): Promise<string> {
    const ows = loadOws();

    const typedData = JSON.stringify({
      types: {
        EIP712Domain: Object.keys(domain).map((key) => ({
          name: key,
          type: inferEip712DomainType(key),
        })),
        ...types,
      },
      primaryType: Object.keys(types)[0],
      domain,
      message: value,
    });

    const result = ows.signTypedData(this._walletName, "evm", typedData, this._passphrase);

    const sig = result.signature.startsWith("0x") ? result.signature : `0x${result.signature}`;
    const v = result.recoveryId !== undefined ? result.recoveryId + 27 : 27;
    return `${sig}${v.toString(16).padStart(2, "0")}`;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const ows = loadOws();

    const msgStr = typeof message === "string"
      ? message
      : Buffer.from(message).toString("hex");
    const encoding = typeof message === "string" ? "utf8" : "hex";

    const result = ows.signMessage(this._walletName, "evm", msgStr, this._passphrase, encoding);

    const sig = result.signature.startsWith("0x") ? result.signature : `0x${result.signature}`;
    const v = result.recoveryId !== undefined ? result.recoveryId + 27 : 27;
    return `${sig}${v.toString(16).padStart(2, "0")}`;
  }

  /**
   * Sign a raw serialized transaction for viem compatibility.
   * Returns the signed transaction as a hex string.
   */
  async signTransaction(serializedTx: string): Promise<string> {
    const ows = loadOws();

    const txHex = serializedTx.startsWith("0x") ? serializedTx.slice(2) : serializedTx;
    const result = ows.signMessage(this._walletName, "evm", txHex, this._passphrase, "hex");

    const sig = result.signature.startsWith("0x") ? result.signature : `0x${result.signature}`;
    const v = result.recoveryId !== undefined ? result.recoveryId + 27 : 27;
    return `${sig}${v.toString(16).padStart(2, "0")}`;
  }
}

function inferEip712DomainType(key: string): string {
  switch (key) {
    case "chainId": return "uint256";
    case "verifyingContract": return "address";
    case "salt": return "bytes32";
    default: return "string";
  }
}
