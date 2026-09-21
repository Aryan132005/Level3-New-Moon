import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { Contract } from './managed/voting/contract/index.js';

export {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
  type ImpureCircuits,
  type PureCircuits,
  type Witnesses,
  type Circuits,
} from './managed/voting/contract/index.js';

export const zkConfigPath =
  typeof window !== 'undefined'
    ? 'contracts/managed/voting'
    : typeof process !== 'undefined' && process.cwd
      ? `${process.cwd()}/contracts/managed/voting`
      : 'contracts/managed/voting';

export const CompiledVotingContract = CompiledContract.make(
  'VotingContract',
  Contract,
).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);