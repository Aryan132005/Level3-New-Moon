import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import {
  ZKConfigProvider,
  createProverKey,
  createVerifierKey,
  createZKIR,
  createProofProvider,
  ProverKey,
  VerifierKey,
  ZKIR,
  MidnightProviders,
  WalletProvider,
  MidnightProvider,
  PrivateStateProvider,
  asContractAddress
} from '@midnight-ntwrk/midnight-js-types';
import {
  Transaction,
  SignatureEnabled,
  Proof,
  Binding
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { CompiledVotingContract, Contract, ledger } from '../contracts/index.js';

// Helper for SHA-256 hash in both Node and Browser
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data as any);
    return new Uint8Array(hashBuffer);
  } else {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(data).digest();
  }
}

// Convert Uint8Array to Hex string
export function toHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert Hex string to Uint8Array
export function fromHex(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const arr = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return arr;
}

export interface ProposalState {
  address: string;
  proposalId: string; // Hex string
  proposalText: string;
  yesTally: number;
  noTally: number;
  votingOpen: boolean;
  adminCommitment: string; // Hex string
  nullifiers: string[]; // List of spent nullifiers (hex strings)
}

// Local Storage keys
const SIMULATOR_STORAGE_KEY = 'midnight_voting_proposals';
const LACE_STORAGE_KEY = 'midnight_lace_proposals';

// Get proposals from local storage for simulator
export function getSimulatedProposals(): ProposalState[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(SIMULATOR_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Save proposals to local storage for simulator
export function saveSimulatedProposals(proposals: ProposalState[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SIMULATOR_STORAGE_KEY, JSON.stringify(proposals));
}

// Get proposals from local storage for Lace wallet deployment tracking
export function getLaceProposals(): ProposalState[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(LACE_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Save proposals to local storage for Lace wallet tracking
export function saveLaceProposals(proposals: ProposalState[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LACE_STORAGE_KEY, JSON.stringify(proposals));
}

// Check if Lace Wallet is available in window
export function isLaceAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).midnight;
}

// Connect to Lace Wallet
export async function connectLaceWallet(): Promise<{ address: string; api: any }> {
  const midnight = (window as any).midnight;
  if (!midnight) {
    throw new Error('No Midnight wallet detected. Please install Lace wallet.');
  }

  const providers = Object.values(midnight);
  if (providers.length === 0) {
    throw new Error('No wallet providers available.');
  }

  const provider: any = providers[0];
  const api = await provider.enable();
  const state = await api.state();

  return {
    address: state.address,
    api
  };
}

/**
 * Browser-compatible ZKConfigProvider reading compiled circuits and proving keys
 */
export class BrowserZkConfigProvider<K extends string> extends ZKConfigProvider<K> {
  private cache = new Map<string, Uint8Array>();

  private async fetchFile(relativePath: string): Promise<Uint8Array> {
    if (this.cache.has(relativePath)) {
      return this.cache.get(relativePath)!;
    }
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const fs = await import('node:fs/promises');
      const pathModule = await import('node:path');
      const fullPath = pathModule.resolve(process.cwd(), 'contracts', 'managed', 'voting', relativePath);
      const data = await fs.readFile(fullPath);
      const uint8 = new Uint8Array(data);
      this.cache.set(relativePath, uint8);
      return uint8;
    } else {
      const res = await fetch(`/contracts/managed/voting/${relativePath}`);
      if (!res.ok) {
        throw new Error(`Failed to load ZK asset: ${relativePath} (${res.statusText})`);
      }
      const buffer = await res.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      this.cache.set(relativePath, uint8);
      return uint8;
    }
  }

  async getProverKey(circuitId: K): Promise<ProverKey> {
    const data = await this.fetchFile(`keys/${circuitId}.prover`);
    return createProverKey(data);
  }

  async getVerifierKey(circuitId: K): Promise<VerifierKey> {
    const data = await this.fetchFile(`keys/${circuitId}.verifier`);
    return createVerifierKey(data);
  }

  async getZKIR(circuitId: K): Promise<ZKIR> {
    const data = await this.fetchFile(`zkir/${circuitId}.zkir`);
    return createZKIR(data);
  }
}

/**
 * In-memory PrivateStateProvider implementation
 */
function createInMemoryPrivateStateProvider(): PrivateStateProvider {
  let activeAddress: string | null = null;
  const stateStore = new Map<string, any>();
  const signingKeyStore = new Map<string, any>();

  return {
    setContractAddress(address: any) {
      activeAddress = typeof address === 'string' ? address : String(address);
    },
    async set(privateStateId: string, state: any) {
      const key = `${activeAddress}:${privateStateId}`;
      stateStore.set(key, state);
    },
    async get(privateStateId: string) {
      const key = `${activeAddress}:${privateStateId}`;
      return stateStore.get(key) ?? null;
    },
    async remove(privateStateId: string) {
      const key = `${activeAddress}:${privateStateId}`;
      stateStore.delete(key);
    },
    async clear() {
      stateStore.clear();
    },
    async setSigningKey(address: any, signingKey: any) {
      signingKeyStore.set(String(address), signingKey);
    },
    async getSigningKey(address: any) {
      return signingKeyStore.get(String(address)) ?? null;
    },
    async removeSigningKey(address: any) {
      signingKeyStore.delete(String(address));
    },
    async clearSigningKeys() {
      signingKeyStore.clear();
    },
    async exportPrivateStates() { return {} as any; },
    async importPrivateStates() { return { imported: 0, skipped: 0, overwritten: 0 }; },
    async exportSigningKeys() { return {} as any; },
    async importSigningKeys() { return { imported: 0, skipped: 0, overwritten: 0 }; }
  };
}

/**
 * Creates MidnightProviders configured for Lace Wallet and Midnight Network
 */
export async function createMidnightProviders(api: any, walletAddress: string): Promise<MidnightProviders> {
  const config = await api.getConfiguration().catch(() => ({
    indexerUri: 'https://indexer.testnet.midnight.network/api/v1/graphql',
    indexerWsUri: 'wss://indexer.testnet.midnight.network/api/v1/graphql/ws',
    proverServerUri: 'https://prover.testnet.midnight.network',
    substrateNodeUri: 'https://rpc.testnet.midnight.network'
  }));

  const publicDataProvider = indexerPublicDataProvider(config.indexerUri, config.indexerWsUri);
  const zkConfigProvider = new BrowserZkConfigProvider();

  let proofProvider;
  try {
    if (typeof api.getProvingProvider === 'function') {
      const provingProvider = await api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider());
      proofProvider = createProofProvider(provingProvider);
    } else {
      proofProvider = httpClientProofProvider(config.proverServerUri || 'https://prover.testnet.midnight.network', zkConfigProvider as any);
    }
  } catch {
    proofProvider = httpClientProofProvider(config.proverServerUri || 'https://prover.testnet.midnight.network', zkConfigProvider as any);
  }

  const shielded = await api.getShieldedAddresses().catch(() => ({
    shieldedCoinPublicKey: '',
    shieldedEncryptionPublicKey: ''
  }));

  const walletProvider: WalletProvider = {
    balanceTx: async (tx: any) => {
      const txHex = toHex(tx.serialize());
      const balanced = await api.balanceUnsealedTransaction(txHex, { payFees: true });
      return (Transaction as any).deserialize(SignatureEnabled, Proof, Binding, fromHex(balanced.tx));
    },
    getCoinPublicKey: () => shielded.shieldedCoinPublicKey as any,
    getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey as any
  };

  const midnightProvider: MidnightProvider = {
    submitTx: async (tx: any) => {
      const txHex = toHex(tx.serialize());
      await api.submitTransaction(txHex);
      return (tx.id ? tx.id() : toHex(await sha256(fromHex(txHex)))) as any;
    }
  };

  const privateStateProvider = createInMemoryPrivateStateProvider();
  if (walletAddress) {
    privateStateProvider.setContractAddress(walletAddress);
  }

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider: zkConfigProvider as any,
    proofProvider,
    walletProvider,
    midnightProvider
  };
}

/**
 * Voting API Wrapper supporting both Lace Wallet and Simulator
 */
export const VotingAPI = {
  // Deploy a new Proposal
  deployProposal: async (
    proposalText: string,
    adminSecretHex: string,
    mode: 'lace' | 'simulator'
  ): Promise<string> => {
    const adminSk = fromHex(adminSecretHex);
    const adminCommit = await sha256(adminSk);
    const adminCommitHex = toHex(adminCommit);

    const proposalId = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(proposalId);
    } else {
      const crypto = await import('crypto');
      crypto.randomFillSync(proposalId);
    }
    const proposalIdHex = toHex(proposalId);

    if (mode === 'lace') {
      const { api, address } = await connectLaceWallet();
      const providers = await createMidnightProviders(api, address);

      const deployed = await deployContract(providers as any, {
        compiledContract: CompiledVotingContract,
        privateStateId: 'votingPrivateState',
        initialPrivateState: {},
        args: [proposalId, proposalText, adminCommit]
      });

      const contractAddress = String(deployed.deployTxData.public.contractAddress);

      const newProposal: ProposalState = {
        address: contractAddress,
        proposalId: proposalIdHex,
        proposalText,
        yesTally: 0,
        noTally: 0,
        votingOpen: true,
        adminCommitment: adminCommitHex,
        nullifiers: []
      };

      const currentProposals = getLaceProposals();
      currentProposals.push(newProposal);
      saveLaceProposals(currentProposals);

      return contractAddress;
    } else {
      // Simulator mode: generate simulated contract address
      const randAddr = new Uint8Array(32);
      if (typeof window !== 'undefined' && window.crypto) {
        window.crypto.getRandomValues(randAddr);
      } else {
        const crypto = await import('crypto');
        crypto.randomFillSync(randAddr);
      }
      const contractAddress = 'c_' + toHex(randAddr).slice(0, 40);

      const newProposal: ProposalState = {
        address: contractAddress,
        proposalId: proposalIdHex,
        proposalText,
        yesTally: 0,
        noTally: 0,
        votingOpen: true,
        adminCommitment: adminCommitHex,
        nullifiers: []
      };

      const currentProposals = getSimulatedProposals();
      currentProposals.push(newProposal);
      saveSimulatedProposals(currentProposals);

      return contractAddress;
    }
  },

  // Cast a Vote (YES/NO)
  castVote: async (
    contractAddress: string,
    voterSecretHex: string,
    choice: boolean,
    mode: 'lace' | 'simulator'
  ): Promise<void> => {
    const voterSk = fromHex(voterSecretHex);

    if (mode === 'lace') {
      const { api, address } = await connectLaceWallet();
      const providers = await createMidnightProviders(api, address);

      const mockWitnesses = {
        voterSecretKey: (context: any) => [context.currentPrivateState, voterSk] as [any, Uint8Array],
        voteChoice: (context: any) => [context.currentPrivateState, choice] as [any, boolean],
        adminSecretKey: (context: any) => [context.currentPrivateState, new Uint8Array(32)] as [any, Uint8Array]
      };

      const compiledWithWitnesses = {
        ...CompiledVotingContract,
        contract: new Contract(mockWitnesses)
      };

      const found = await findDeployedContract(providers as any, {
        compiledContract: compiledWithWitnesses as any,
        contractAddress: asContractAddress(contractAddress),
        privateStateId: 'votingPrivateState',
        initialPrivateState: {}
      });

      await found.callTx.castVote();
    } else {
      const proposals = getSimulatedProposals();
      const propIndex = proposals.findIndex(p => p.address === contractAddress);
      if (propIndex === -1) {
        throw new Error('Proposal not found');
      }
      const proposal = proposals[propIndex];

      if (!proposal.votingOpen) {
        throw new Error('failed assert: Voting is closed');
      }

      const dataToHash = new Uint8Array(64);
      dataToHash.set(voterSk, 0);
      dataToHash.set(fromHex(proposal.proposalId), 32);

      const nullifier = await sha256(dataToHash);
      const nullifierHex = toHex(nullifier);

      if (proposal.nullifiers.includes(nullifierHex)) {
        throw new Error('failed assert: Double voting is not allowed');
      }

      proposal.nullifiers.push(nullifierHex);
      if (choice) {
        proposal.yesTally += 1;
      } else {
        proposal.noTally += 1;
      }

      proposals[propIndex] = proposal;
      saveSimulatedProposals(proposals);
    }
  },

  // Close Voting (Admin only)
  closeVoting: async (
    contractAddress: string,
    adminSecretHex: string,
    mode: 'lace' | 'simulator'
  ): Promise<void> => {
    const adminSk = fromHex(adminSecretHex);
    const hashOfSk = await sha256(adminSk);
    const hashOfSkHex = toHex(hashOfSk);

    if (mode === 'lace') {
      const { api, address } = await connectLaceWallet();
      const providers = await createMidnightProviders(api, address);

      const mockWitnesses = {
        voterSecretKey: (context: any) => [context.currentPrivateState, new Uint8Array(32)] as [any, Uint8Array],
        voteChoice: (context: any) => [context.currentPrivateState, true] as [any, boolean],
        adminSecretKey: (context: any) => [context.currentPrivateState, adminSk] as [any, Uint8Array]
      };

      const compiledWithWitnesses = {
        ...CompiledVotingContract,
        contract: new Contract(mockWitnesses)
      };

      const found = await findDeployedContract(providers as any, {
        compiledContract: compiledWithWitnesses as any,
        contractAddress: asContractAddress(contractAddress),
        privateStateId: 'votingPrivateState',
        initialPrivateState: {}
      });

      await found.callTx.closeVoting();
    } else {
      const proposals = getSimulatedProposals();
      const propIndex = proposals.findIndex(p => p.address === contractAddress);
      if (propIndex === -1) {
        throw new Error('Proposal not found');
      }
      const proposal = proposals[propIndex];

      if (proposal.adminCommitment !== hashOfSkHex) {
        throw new Error('failed assert: Unauthorized admin');
      }

      proposal.votingOpen = false;
      proposals[propIndex] = proposal;
      saveSimulatedProposals(proposals);
    }
  },

  // Fetch Proposals List
  getProposals: async (mode: 'lace' | 'simulator'): Promise<ProposalState[]> => {
    if (mode === 'lace') {
      const localProposals = getLaceProposals();
      if (localProposals.length === 0) return [];

      try {
        const { api, address } = await connectLaceWallet();
        const providers = await createMidnightProviders(api, address);

        const updatedProposals: ProposalState[] = [];
        for (const prop of localProposals) {
          try {
            const state = await providers.publicDataProvider.queryContractState(asContractAddress(prop.address));
            if (state && state.data) {
              const l = ledger(state.data);
              updatedProposals.push({
                ...prop,
                proposalId: toHex(l.proposalId),
                proposalText: l.proposalText,
                yesTally: Number(l.yesTally),
                noTally: Number(l.noTally),
                votingOpen: l.votingOpen,
                adminCommitment: toHex(l.adminCommitment)
              });
            } else {
              updatedProposals.push(prop);
            }
          } catch {
            updatedProposals.push(prop);
          }
        }
        return updatedProposals;
        return updatedProposals;
      } catch {
        return localProposals;
      }
    } else {
      return getSimulatedProposals();
    }
  }
};

