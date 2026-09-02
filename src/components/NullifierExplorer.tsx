import { useState } from 'react';
import { ProposalState, deriveNullifier } from '../votingApi';
import { Search, ShieldAlert, CheckCircle2, Hash, KeyRound, Copy, Check, Info } from 'lucide-react';

interface NullifierExplorerProps {
  proposal: ProposalState;
}

export function NullifierExplorer({ proposal }: NullifierExplorerProps) {
  const [testSecret, setTestSecret] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    testedNullifier: string;
    isSpent: boolean;
  } | null>(null);
  const [copiedNullifier, setCopiedNullifier] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testSecret.trim()) return;

    setIsVerifying(true);
    try {
      const derived = await deriveNullifier(testSecret.trim(), proposal.proposalId);
      const isSpent = proposal.nullifiers.includes(derived);
      setVerificationResult({
        testedNullifier: derived,
        isSpent
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopy = (nullifier: string) => {
    navigator.clipboard.writeText(nullifier);
    setCopiedNullifier(nullifier);
    setTimeout(() => setCopiedNullifier(null), 2000);
  };

  const filteredNullifiers = proposal.nullifiers.filter(n =>
    n.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="nullifier-explorer space-y-6">
      {/* Test / Verify Tool */}
      <div className="glass-panel p-5 rounded-2xl border border-cyan-500/20 bg-cyan-950/10">
        <div className="flex items-center gap-2 mb-2">
          <KeyRound className="w-4 h-4 text-cyan-400" />
          <h4 className="text-sm font-semibold text-white">Private Nullifier Status Checker</h4>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Test whether a private secret key has already been used to vote on this proposal. The circuit calculates the one-way nullifier hash client-side without submitting any transaction.
        </p>

        <form onSubmit={handleVerify} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              className="form-input font-mono text-xs flex-1"
              placeholder="Paste 32-byte secret key (64 hex characters)..."
              value={testSecret}
              onChange={(e) => {
                setTestSecret(e.target.value);
                setVerificationResult(null);
              }}
              required
            />
            <button
              type="submit"
              className="btn btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
              disabled={isVerifying || !testSecret.trim()}
            >
              {isVerifying ? (
                <>
                  <div className="spinner-sm" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Check Status</span>
                </>
              )}
            </button>
          </div>
        </form>

        {verificationResult && (
          <div
            className={`mt-4 p-3.5 rounded-xl border flex items-start gap-3 ${
              verificationResult.isSpent
                ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {verificationResult.isSpent ? (
              <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="text-xs space-y-1">
              <div className="font-semibold text-white">
                {verificationResult.isSpent
                  ? 'Nullifier Spent (Already Voted)'
                  : 'Nullifier Unused (Eligible to Vote)'}
              </div>
              <div className="font-mono text-gray-400 break-all text-[11px]">
                Derived Nullifier: {verificationResult.testedNullifier}
              </div>
              <div className="text-gray-300 text-[11px]">
                {verificationResult.isSpent
                  ? 'This key has already registered a ballot. Submitting again will trigger double-vote rejection.'
                  : 'This key has not participated in this ballot yet. You can submit an anonymous vote.'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nullifier Ledger List */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-purple-400" />
            <h4 className="text-sm font-semibold text-white">
              On-Chain Nullifier Set ({proposal.nullifiers.length})
            </h4>
          </div>
          {proposal.nullifiers.length > 3 && (
            <input
              type="text"
              className="form-input text-xs py-1 px-2.5 max-w-[180px]"
              placeholder="Search nullifier hash..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
          )}
        </div>

        {proposal.nullifiers.length === 0 ? (
          <div className="p-8 text-center glass-panel rounded-xl text-gray-400 text-xs">
            <Info className="w-6 h-6 mx-auto mb-2 text-gray-500" />
            <span>No nullifiers registered on-chain yet for this proposal.</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {filteredNullifiers.map((nullifier, idx) => (
              <div
                key={nullifier}
                className="glass-panel p-2.5 rounded-lg flex items-center justify-between font-mono text-xs hover:border-purple-500/30 transition-colors"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-gray-500 text-[10px]">#{idx + 1}</span>
                  <span className="text-purple-300 truncate text-[11px]">{nullifier}</span>
                </div>
                <button
                  className="vault-action-btn flex-shrink-0"
                  title="Copy Nullifier"
                  onClick={() => handleCopy(nullifier)}
                >
                  {copiedNullifier === nullifier ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
