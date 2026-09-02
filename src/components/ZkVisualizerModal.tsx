import { Cpu, ShieldCheck, CheckCircle2, Lock, ArrowRight, Zap, Database } from 'lucide-react';

interface ZkVisualizerModalProps {
  isOpen: boolean;
  step: number; // 0: not started, 1: witness, 2: nullifier, 3: zkp, 4: ledger update, 5: completed
  voterSecretMasked: string;
  choice: boolean;
  proposalId: string;
  derivedNullifier?: string;
  onDone?: () => void;
}

export function ZkVisualizerModal({
  isOpen,
  step,
  voterSecretMasked,
  choice,
  proposalId,
  derivedNullifier,
  onDone
}: ZkVisualizerModalProps) {
  if (!isOpen) return null;

  const stepsInfo = [
    {
      title: 'Witness Data Ingestion',
      desc: 'Isolating private voter secret key and vote choice into private witness memory.',
      icon: <Lock className="w-4 h-4 text-cyan-400" />
    },
    {
      title: 'Deterministic Nullifier Derivation',
      desc: 'Deriving one-way nullifier hash inside circuit: persistentHash(sk, proposalId).',
      icon: <Zap className="w-4 h-4 text-amber-400" />
    },
    {
      title: 'ZK Circuit Constraint Proof',
      desc: 'Generating mathematical zero-knowledge proof enforcing eligibility & freshness.',
      icon: <Cpu className="w-4 h-4 text-purple-400" />
    },
    {
      title: 'Atomic On-Chain State Transition',
      desc: 'Spending nullifier and publicly incrementing tally without revealing ballot choice.',
      icon: <Database className="w-4 h-4 text-emerald-400" />
    }
  ];

  return (
    <div className="modal-backdrop">
      <div className="modal-content glass-panel zk-visualizer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="zk-visualizer-header">
          <div className="flex items-center gap-3">
            <div className="circuit-pulse-badge">
              <Cpu className="w-5 h-5 text-purple-300 animate-pulse" />
            </div>
            <div>
              <h2 className="modal-title">Zero-Knowledge Circuit Execution</h2>
              <p className="modal-subtitle">Midnight Compact ZK Prover & Constraint Verifier</p>
            </div>
          </div>
        </div>

        <div className="zk-visualizer-body">
          {/* Animated Pipeline Nodes */}
          <div className="circuit-pipeline">
            {stepsInfo.map((s, idx) => {
              const currentStepIdx = idx + 1;
              const isCompleted = step > currentStepIdx;
              const isCurrent = step === currentStepIdx;

              return (
                <div key={idx} className="flex items-center">
                  <div
                    className={`pipeline-node ${
                      isCompleted ? 'node-completed' : isCurrent ? 'node-current' : 'node-pending'
                    }`}
                  >
                    <div className="node-icon-wrapper">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : isCurrent ? (
                        <div className="spinner-sm" />
                      ) : (
                        s.icon
                      )}
                    </div>
                    <div className="node-label">Step {currentStepIdx}</div>
                  </div>
                  {idx < stepsInfo.length - 1 && (
                    <div className={`pipeline-connector ${step > currentStepIdx ? 'connector-active' : ''}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Current Step Detail Card */}
          <div className="circuit-details-panel glass-panel">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span className="text-xs uppercase tracking-wider text-cyan-300 font-semibold font-mono">
                Circuit Subroutine: {step <= 4 ? stepsInfo[Math.max(0, step - 1)]?.title : 'Execution Complete'}
              </span>
            </div>
            <p className="text-xs text-gray-300 mb-4">
              {step <= 4 ? stepsInfo[Math.max(0, step - 1)]?.desc : 'All circuit assertions passed with 0 privacy leakage.'}
            </p>

            {/* Cryptographic Execution Terminal / Telemetry */}
            <div className="circuit-terminal font-mono text-xs">
              <div className="terminal-line text-gray-400">
                <span className="text-purple-400">witness voterSecretKey:</span> {voterSecretMasked}
              </div>
              <div className="terminal-line text-gray-400">
                <span className="text-purple-400">witness voteChoice:</span> {choice ? 'TRUE (YES)' : 'FALSE (NO)'}
              </div>
              <div className="terminal-line text-gray-400">
                <span className="text-cyan-400">ledger proposalId:</span> {proposalId.slice(0, 16)}...
              </div>
              {derivedNullifier && (
                <div className="terminal-line text-emerald-400">
                  <span className="text-amber-400">nullifier (derived):</span> {derivedNullifier.slice(0, 20)}...
                </div>
              )}
              <div className="terminal-line text-cyan-300">
                <span className="text-blue-400">circuit constraints:</span> assert(votingOpen) && assert(!nullifierSet.member)
              </div>
              {step >= 4 && (
                <div className="terminal-line text-emerald-300 font-semibold mt-1">
                  ✓ Ledger delta committed: nullifierSet.insert() + {choice ? 'yesTally' : 'noTally'}.increment(1)
                </div>
              )}
            </div>
          </div>
        </div>

        {step >= 4 && (
          <div className="modal-footer">
            <button className="btn btn-primary w-full flex items-center justify-center gap-2" onClick={onDone}>
              <span>Complete & View Receipt</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
