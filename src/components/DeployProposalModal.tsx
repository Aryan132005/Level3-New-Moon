import { useState } from 'react';
import { toHex } from '../votingApi';
import { PlusCircle, Sparkles, Key, Eye, EyeOff, X, Shield, Layers } from 'lucide-react';

interface DeployProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (
    text: string,
    adminSecret: string,
    category: 'Governance' | 'Protocol' | 'Treasury' | 'Security' | 'Community',
    quorum: number
  ) => Promise<void>;
  isDeploying: boolean;
}

export function DeployProposalModal({
  isOpen,
  onClose,
  onDeploy,
  isDeploying
}: DeployProposalModalProps) {
  const [proposalText, setProposalText] = useState('');
  const [adminSecret, setAdminSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [category, setCategory] = useState<'Governance' | 'Protocol' | 'Treasury' | 'Security' | 'Community'>('Governance');
  const [quorum, setQuorum] = useState<number>(10);

  if (!isOpen) return null;

  const handleGenerateKey = () => {
    const key = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(key);
    } else {
      for (let i = 0; i < 32; i++) key[i] = Math.floor(Math.random() * 256);
    }
    setAdminSecret(toHex(key));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalText.trim() || !adminSecret.trim()) return;
    await onDeploy(proposalText.trim(), adminSecret.trim(), category, quorum);
    setProposalText('');
    setAdminSecret('');
    onClose();
  };

  const categories: Array<'Governance' | 'Protocol' | 'Treasury' | 'Security' | 'Community'> = [
    'Governance',
    'Protocol',
    'Treasury',
    'Security',
    'Community'
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-panel deploy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="deploy-icon-badge">
              <PlusCircle className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="modal-title">Deploy ZK Proposal Contract</h2>
              <p className="modal-subtitle">Initialize a new on-chain Zero-Knowledge ballot circuit</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body space-y-4">
            {/* Category Selector */}
            <div className="form-group">
              <label className="form-label flex items-center gap-1.5 text-xs">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                Governance Category
              </label>
              <div className="category-pill-group">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`category-pill ${category === cat ? 'active' : ''}`}
                    onClick={() => setCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Proposal Question */}
            <div className="form-group">
              <label className="form-label text-xs">Proposal Question / Statement</label>
              <textarea
                className="form-input text-sm"
                rows={3}
                placeholder="e.g., Should we approve CIP-42: Deploy Zero-Knowledge Cross-Chain Bridge to Midnight?"
                value={proposalText}
                onChange={(e) => setProposalText(e.target.value)}
                required
              />
            </div>

            {/* Target Quorum */}
            <div className="form-group">
              <div className="flex justify-between items-center mb-1">
                <label className="form-label text-xs">Quorum Target (Votes required)</label>
                <span className="text-xs font-mono text-cyan-400">{quorum} Votes</span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={quorum}
                onChange={(e) => setQuorum(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            {/* Admin Secret Key */}
            <div className="form-group">
              <div className="flex justify-between items-center mb-1">
                <label className="form-label text-xs flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  Admin Closure Secret Key (32-byte Hex)
                </label>
                <button
                  type="button"
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                  onClick={handleGenerateKey}
                >
                  <Sparkles className="w-3 h-3" />
                  Generate
                </button>
              </div>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  className="form-input font-mono text-xs pr-10"
                  placeholder="Designated secret key used later to freeze this voting circuit..."
                  value={adminSecret}
                  onChange={(e) => setAdminSecret(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="deploy-notice">
              <Shield className="w-4 h-4 text-purple-400 flex-shrink-0" />
              <span>
                The SHA-256 hash of your admin secret is disclosed on-chain as a public commitment (`adminCommitment`). When closing voting, the ZK circuit mathematically proves knowledge of this secret.
              </span>
            </div>
          </div>

          <div className="modal-footer flex items-center gap-3">
            <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1 flex items-center justify-center gap-2"
              disabled={isDeploying || !proposalText.trim() || !adminSecret.trim()}
            >
              {isDeploying ? (
                <>
                  <div className="spinner-sm" />
                  <span>Deploying Circuit...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  <span>Deploy Proposal</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
