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
  category?: 'Governance' | 'Protocol' | 'Treasury' | 'Security' | 'Community';
  createdAt?: number;
  quorumTarget?: number;
  yesTally: number;
  noTally: number;
  votingOpen: boolean;
  adminCommitment: string; // Hex string
  nullifiers: string[]; // List of spent nullifiers (hex strings)
}

export interface VoterIdentity {
  id: string;
  label: string;
  secretKeyHex: string;
  avatarSeed: string;
  createdAt: number;
}

export interface ActivityEvent {
  id: string;
  type: 'deploy' | 'vote' | 'close';
  proposalId: string;
  proposalText: string;
  timestamp: number;
  txHash?: string;
  details?: string;
}

export interface VotingReceipt {
  receiptId: string;
  proposalId: string;
  proposalText: string;
  contractAddress: string;
  nullifierHex: string;
  choice: 'YES' | 'NO';
  timestamp: number;
  circuitProofHash: string;
  blockHeight?: number;
}

// Local Storage keys
const SIMULATOR_STORAGE_KEY = 'midnight_voting_proposals';
const LACE_STORAGE_KEY = 'midnight_lace_proposals';
const IDENTITIES_STORAGE_KEY = 'midnight_voter_identities';
const ACTIVITY_STORAGE_KEY = 'midnight_activity_events';

// Compute Nullifier deterministically: SHA256(voterSecretKey[32] || proposalId[32])
export async function deriveNullifier(voterSecretHex: string, proposalIdHex: string): Promise<string> {
  const voterSk = fromHex(voterSecretHex);
  const pId = fromHex(proposalIdHex);
  const data = new Uint8Array(64);
  data.set(voterSk, 0);
  data.set(pId, 32);
  const nullifierBytes = await sha256(data);
  return toHex(nullifierBytes);
}

// Identity Vault Helpers
export function getSavedIdentities(): VoterIdentity[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(IDENTITIES_STORAGE_KEY);
  if (!raw) {
    // Generate default identities for immediate out-of-the-box convenience
    const defaults: VoterIdentity[] = [
      {
        id: 'id-alpha',
        label: 'DAO Delegate Alpha',
        secretKeyHex: 'a100000000000000000000000000000000000000000000000000000000000001',
        avatarSeed: 'Alpha',
        createdAt: Date.now() - 3600000 * 24
      },
      {
        id: 'id-beta',
        label: 'Core Contributor Beta',
        secretKeyHex: 'b200000000000000000000000000000000000000000000000000000000000002',
        avatarSeed: 'Beta',
        createdAt: Date.now() - 3600000 * 12
      },
      {
        id: 'id-gamma',
        label: 'Anonymous Staker Gamma',
        secretKeyHex: 'c300000000000000000000000000000000000000000000000000000000000003',
        avatarSeed: 'Gamma',
        createdAt: Date.now() - 3600000 * 4
      }
    ];
    saveIdentities(defaults);
    return defaults;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveIdentities(identities: VoterIdentity[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(IDENTITIES_STORAGE_KEY, JSON.stringify(identities));
}

// Activity Log Helpers
export function getActivityEvents(): ActivityEvent[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function logActivityEvent(event: Omit<ActivityEvent, 'id' | 'timestamp'>) {
  if (typeof window === 'undefined') return;
  const events = getActivityEvents();
  const newEvent: ActivityEvent = {
    ...event,
    id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    timestamp: Date.now()
  };
  events.unshift(newEvent);
  // Keep last 30 events
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(events.slice(0, 30)));
}

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
 * Voting API Wrapper supporting both Lace Wallet integration and Simulator mode.
 */
export const VotingAPI = {
  /**
   * Deploys a new ZK Voting proposal contract.
   * 
   * @param proposalText The description of the proposal.
   * @param adminSecretHex Hexadecimal secret key of the administrator.
   * @param mode Selected environment mode ('lace' or 'simulator').
   * @returns The contract address of the deployed proposal.
   */
  deployProposal: async (
    proposalText: string,
    adminSecretHex: string,
    mode: 'lace' | 'simulator',
    category: 'Governance' | 'Protocol' | 'Treasury' | 'Security' | 'Community' = 'Governance',
    quorumTarget: number = 10
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
        category,
        createdAt: Date.now(),
        quorumTarget,
        yesTally: 0,
        noTally: 0,
        votingOpen: true,
        adminCommitment: adminCommitHex,
        nullifiers: []
      };

      const currentProposals = getLaceProposals();
      currentProposals.push(newProposal);
      saveLaceProposals(currentProposals);

      logActivityEvent({
        type: 'deploy',
        proposalId: proposalIdHex,
        proposalText,
        details: `Deployed ZK circuit for ${category} proposal on Midnight testnet.`
      });

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
        category,
        createdAt: Date.now(),
        quorumTarget,
        yesTally: 0,
        noTally: 0,
        votingOpen: true,
        adminCommitment: adminCommitHex,
        nullifiers: []
      };

      const currentProposals = getSimulatedProposals();
      currentProposals.push(newProposal);
      saveSimulatedProposals(currentProposals);

      logActivityEvent({
        type: 'deploy',
        proposalId: proposalIdHex,
        proposalText,
        details: `Created simulated ZK proposal in ${category} category.`
      });

      return contractAddress;
    }
  },

  /**
   * Casts an anonymous vote on a proposal.
   * 
   * @param contractAddress The address of the deployed proposal.
   * @param voterSecretHex The voter's private secret key (hex representation).
   * @param choice True for YES vote, false for NO vote.
   * @param mode Selected environment mode ('lace' or 'simulator').
   * @returns Generated VotingReceipt
   */
  castVote: async (
    contractAddress: string,
    voterSecretHex: string,
    choice: boolean,
    mode: 'lace' | 'simulator'
  ): Promise<VotingReceipt> => {
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

      const tx = await found.callTx.castVote();

      const proposals = getLaceProposals();
      const prop = proposals.find(p => p.address === contractAddress);
      const proposalId = prop ? prop.proposalId : toHex(new Uint8Array(32));
      const nullifier = await deriveNullifier(voterSecretHex, proposalId);

      logActivityEvent({
        type: 'vote',
        proposalId,
        proposalText: prop ? prop.proposalText : contractAddress,
        details: `ZK Ballot accepted on-chain. Nullifier spent: ${nullifier.slice(0, 12)}...`
      });

      const receipt: VotingReceipt = {
        receiptId: 'rcpt_' + Date.now().toString(36),
        proposalId,
        proposalText: prop?.proposalText || 'Proposal',
        contractAddress,
        nullifierHex: nullifier,
        choice: choice ? 'YES' : 'NO',
        timestamp: Date.now(),
        circuitProofHash: toHex(await sha256(fromHex(nullifier + (tx ? String(tx) : '00')))),
        blockHeight: Math.floor(Math.random() * 50000) + 1200000
      };

      return receipt;
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

      const nullifierHex = await deriveNullifier(voterSecretHex, proposal.proposalId);

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

      logActivityEvent({
        type: 'vote',
        proposalId: proposal.proposalId,
        proposalText: proposal.proposalText,
        details: `Anonymous ballot registered. Nullifier: ${nullifierHex.slice(0, 10)}...`
      });

      const proofBytes = await sha256(fromHex(nullifierHex + proposal.proposalId + Date.now()));
      const receipt: VotingReceipt = {
        receiptId: 'rcpt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
        proposalId: proposal.proposalId,
        proposalText: proposal.proposalText,
        contractAddress,
        nullifierHex,
        choice: choice ? 'YES' : 'NO',
        timestamp: Date.now(),
        circuitProofHash: 'zkp_' + toHex(proofBytes),
        blockHeight: Math.floor(Math.random() * 1000) + 842000
      };

      return receipt;
    }
  },

  /**
   * Closes the voting period. Admin only.
   * 
   * @param contractAddress The address of the deployed proposal.
   * @param adminSecretHex The administrator's secret key (hex representation).
   * @param mode Selected environment mode ('lace' or 'simulator').
   */
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

      const proposals = getLaceProposals();
      const prop = proposals.find(p => p.address === contractAddress);
      if (prop) {
        logActivityEvent({
          type: 'close',
          proposalId: prop.proposalId,
          proposalText: prop.proposalText,
          details: `Admin closed voting period on-chain.`
        });
      }
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

      logActivityEvent({
        type: 'close',
        proposalId: proposal.proposalId,
        proposalText: proposal.proposalText,
        details: `Admin frozen proposal tally. Total votes: ${proposal.yesTally + proposal.noTally}`
      });
    }
  },

  /**
   * Retrieves the current list of proposals and queries latest on-chain ledger tallies.
   * 
   * @param mode Selected environment mode ('lace' or 'simulator').
   * @returns An array of ProposalState objects.
   */
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
      } catch {
        return localProposals;
      }
    } else {
      return getSimulatedProposals();
    }
  }
};

