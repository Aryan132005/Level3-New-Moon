import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  createConstructorContext,
  createCircuitContext,
  dummyContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../../contracts/managed/voting/contract/index.js';

// Setup common parameters
const dummyCoinPublicKey = new Uint8Array(32);
const proposalId = new Uint8Array(32);
proposalId[0] = 1;
const proposalText = "Should we adopt L3 solutions?";

const adminSk = new Uint8Array(32);
adminSk[0] = 100;
const adminCommit = crypto.createHash('sha256').update(adminSk).digest();

describe('Private Voting Smart Contract Tests', () => {
  it('Happy Path: cast a valid vote, tally increments by 1', () => {
    // Mock witnesses
    const mockWitnesses = {
      voterSecretKey: (context: any) => [context.currentPrivateState, new Uint8Array(32)] as [any, Uint8Array],
      voteChoice: (context: any) => [context.currentPrivateState, true] as [any, boolean], // Yes vote
      adminSecretKey: (context: any) => [context.currentPrivateState, adminSk] as [any, Uint8Array]
    };

    const contract = new Contract(mockWitnesses);
    const constructorContext = createConstructorContext({}, dummyCoinPublicKey as any);

    // Initialize state
    const initResult = contract.initialState(constructorContext, proposalId, proposalText, adminCommit);
    const initialLedger = ledger(initResult.currentContractState.data);

    expect(initialLedger.proposalText).toBe(proposalText);
    expect(initialLedger.yesTally).toBe(0n);
    expect(initialLedger.noTally).toBe(0n);
    expect(initialLedger.votingOpen).toBe(true);

    // Cast vote
    const circuitContext = createCircuitContext(
      dummyContractAddress(),
      dummyCoinPublicKey as any,
      initResult.currentContractState,
      {}
    );

    const result = contract.circuits.castVote(circuitContext);
    const finalLedger = ledger(result.context.currentQueryContext.state);

    expect(finalLedger.yesTally).toBe(1n);
    expect(finalLedger.noTally).toBe(0n);
    expect(finalLedger.votingOpen).toBe(true);
  });

  it('Double-vote rejection: same nullifier used twice is rejected', () => {
    const voterSk = new Uint8Array(32);
    voterSk[0] = 77; // Voter secret key

    const mockWitnesses = {
      voterSecretKey: (context: any) => [context.currentPrivateState, voterSk] as [any, Uint8Array],
      voteChoice: (context: any) => [context.currentPrivateState, false] as [any, boolean], // No vote
      adminSecretKey: (context: any) => [context.currentPrivateState, adminSk] as [any, Uint8Array]
    };

    const contract = new Contract(mockWitnesses);
    const constructorContext = createConstructorContext({}, dummyCoinPublicKey as any);

    // Initialize state
    const initResult = contract.initialState(constructorContext, proposalId, proposalText, adminCommit);

    // Cast first vote
    const circuitContext1 = createCircuitContext(
      dummyContractAddress(),
      dummyCoinPublicKey as any,
      initResult.currentContractState,
      {}
    );
    const result1 = contract.circuits.castVote(circuitContext1);
    const ledgerAfterVote1 = ledger(result1.context.currentQueryContext.state);

    expect(ledgerAfterVote1.noTally).toBe(1n);

    // Cast second vote with the same secret key (same nullifier)
    expect(() => {
      contract.circuits.castVote(result1.context);
    }).toThrowError('failed assert: Double voting is not allowed');
  });

  it('Voting-closed rejection: vote cast after close is rejected', () => {
    const mockWitnesses = {
      voterSecretKey: (context: any) => [context.currentPrivateState, new Uint8Array(32)] as [any, Uint8Array],
      voteChoice: (context: any) => [context.currentPrivateState, true] as [any, boolean],
      adminSecretKey: (context: any) => [context.currentPrivateState, adminSk] as [any, Uint8Array]
    };

    const contract = new Contract(mockWitnesses);
    const constructorContext = createConstructorContext({}, dummyCoinPublicKey as any);

    // Initialize state
    const initResult = contract.initialState(constructorContext, proposalId, proposalText, adminCommit);

    // Close voting
    const closeContext = createCircuitContext(
      dummyContractAddress(),
      dummyCoinPublicKey as any,
      initResult.currentContractState,
      {}
    );
    const closeResult = contract.circuits.closeVoting(closeContext);
    const closedLedger = ledger(closeResult.context.currentQueryContext.state);

    expect(closedLedger.votingOpen).toBe(false);

    // Attempt to cast vote after close
    expect(() => {
      contract.circuits.castVote(closeResult.context);
    }).toThrowError('failed assert: Voting is closed');
  });
});
