import { ApiPromise, SubmittableResult } from "@polkadot/api";
import { KeyringPair } from "@polkadot/keyring/types";
import { Option, StorageData } from "@polkadot/types";
import { Address, ContractInfo, Hash } from "@polkadot/types/interfaces";
import { u8aToHex } from "@polkadot/util";
import { sendAndReturnFinalized } from "./signer";
import BN from "bn.js";
import fs from "fs";

const blake = require('blakejs');

function reportFailure(operation: string, result: SubmittableResult) {
  const failure = result.findRecord("system", "ExtrinsicFailed");
  if (failure) {
    console.error("ExtrinsicFailed", JSON.stringify(failure, null, 2));
  }
  throw new Error(`${operation} failed.`);
}

export async function putCode(
  api: ApiPromise,
  signer: KeyringPair,
  filePath: string,
  gas: number,
): Promise<Hash> {
  const wasmCode = fs
    // .readFileSync(path.join(__dirname, fileName))
    .readFileSync(filePath)
    .toString("hex");
  const tx = api.tx.contracts.putCode(gas, `0x${wasmCode}`);
  const result: any = await sendAndReturnFinalized(signer, tx);
  const record = result.findRecord("contracts", "CodeStored");

  if (!record) {
    reportFailure("Deployment", result);
  }
  // Return code hash.
  return record.event.data[0];
}

export async function instantiate(
  api: ApiPromise,
  signer: KeyringPair,
  codeHash: Hash,
  inputData: any,
  endowment: BN,
  gas: number,
): Promise<Address> {
  const tx = api.tx.contracts.instantiate(
    endowment,
    gas,
    codeHash,
    inputData,
  );
  const result: any = await sendAndReturnFinalized(signer, tx);
  const record = result.findRecord("contracts", "Instantiated");

  if (!record) {
    reportFailure("Instantiation", result);
  }
  // Return the address of instantiated contract.
  return record.event.data[1];
}

export async function callContract(
  api: ApiPromise,
  signer: KeyringPair,
  contractAddress: Address,
  inputData: any,
  gas: number,
  endowment: number = 0,
): Promise<void> {
  const tx = api.tx.contracts.call(
    contractAddress,
    endowment,
    gas,
    inputData,
  );

  await sendAndReturnFinalized(signer, tx);
}

export async function getContractStorage(
  api: ApiPromise,
  contractAddress: Address,
  storageKey: Uint8Array,
): Promise<StorageData> {
  const contractInfo = await api.query.contracts.contractInfoOf(
    contractAddress,
  );

  // Return the value of the contracts storage
  const childStorageKey = (contractInfo as Option<ContractInfo>).unwrap().asAlive.trieId;
  const childInfo = childStorageKey.subarray(childStorageKey.byteLength - 32, childStorageKey.byteLength);
  const storageKeyBlake2b = blake.blake2bHex(storageKey, null, 32);

  return await api.rpc.state.getChildStorage(
      u8aToHex(childStorageKey), // trieId
      u8aToHex(childInfo), // trieId without `:child_storage:` prefix
      1, // substrate default value `1`
      "0x" + storageKeyBlake2b, // hashed storageKey
  );
}