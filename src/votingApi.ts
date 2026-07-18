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
const STORAGE_KEY = 'midnight_voting_proposals';

// Get proposals from local storage
export function getSimulatedProposals(): ProposalState[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Save proposals to local storage
export function saveSimulatedProposals(proposals: ProposalState[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(proposals));
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

  // Find the first available provider (e.g. mnLace)
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
    // Fill proposal ID randomly
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(proposalId);
    } else {
      const crypto = await import('crypto');
      crypto.randomFillSync(proposalId);
    }
    const proposalIdHex = toHex(proposalId);

    if (mode === 'lace') {
      // In live Lace mode, we would call the contract deployer:
      // const deployed = await deployContract(providers, { contract, args: [proposalId, proposalText, adminCommit] });
      // return deployed.address;
      throw new Error('Lace deploy unimplemented on testnet config. Please use Sandbox mode.');
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
      // Live Lace transaction call
      throw new Error('Lace voting unimplemented on testnet config. Please use Sandbox mode.');
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

      // Compute nullifier: nullifier = persistentHash(voterSk, proposalId)
      // Standard vector serialization: concat voterSk (32 bytes) and proposalId (32 bytes)
      const dataToHash = new Uint8Array(64);
      dataToHash.set(voterSk, 0);
      dataToHash.set(fromHex(proposal.proposalId), 32);

      const nullifier = await sha256(dataToHash);
      const nullifierHex = toHex(nullifier);

      if (proposal.nullifiers.includes(nullifierHex)) {
        throw new Error('failed assert: Double voting is not allowed');
      }

      // Add nullifier and increment tally
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
      throw new Error('Lace close voting unimplemented on testnet config. Please use Sandbox mode.');
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
      // In live mode, we would query the indexer
      return [];
    } else {
      return getSimulatedProposals();
    }
  }
};
