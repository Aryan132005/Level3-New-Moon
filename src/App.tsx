import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  VotingAPI,
  ProposalState,
  VoterIdentity,
  VotingReceipt,
  getSavedIdentities,
  deriveNullifier,
  isLaceAvailable,
  connectLaceWallet,
  toHex
} from './votingApi';

import { Header } from './components/Header';
import { KeyVaultModal } from './components/KeyVaultModal';
import { ZkVisualizerModal } from './components/ZkVisualizerModal';
import { ReceiptModal } from './components/ReceiptModal';
import { NullifierExplorer } from './components/NullifierExplorer';
import { ActivityFeedModal } from './components/ActivityFeedModal';
import { DeployProposalModal } from './components/DeployProposalModal';

import {
  Shield,
  Vote,
  Hash,
  Search,
  CheckCircle2,
  Lock,
  Unlock,
  Users,
  Code2,
  Layers,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  FileCode,
  KeyRound
} from 'lucide-react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export function App() {
  // Environment mode
  const [mode, setMode] = useState<'simulator' | 'lace'>('simulator');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Proposals & Navigation
  const [proposals, setProposals] = useState<ProposalState[]>([]);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'nullifiers' | 'spec'>('overview');

  // Filters & Search
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Key Vault & Identity
  const [activeIdentity, setActiveIdentity] = useState<VoterIdentity | null>(() => {
    const ids = getSavedIdentities();
    return ids.length > 0 ? ids[0] : null;
  });

  // Modals state
  const [isKeyVaultOpen, setIsKeyVaultOpen] = useState(false);
  const [isActivityFeedOpen, setIsActivityFeedOpen] = useState(false);
  const [isDeployOpen, setIsDeployOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  // ZK Circuit Visualizer state
  const [zkVisualizer, setZkVisualizer] = useState<{
    isOpen: boolean;
    step: number;
    choice: boolean;
    voterSecretMasked: string;
    proposalId: string;
    derivedNullifier?: string;
  }>({
    isOpen: false,
    step: 0,
    choice: true,
    voterSecretMasked: '',
    proposalId: ''
  });

  // Receipt modal state
  const [latestReceipt, setLatestReceipt] = useState<VotingReceipt | null>(null);

  // Admin closure state
  const [adminSecret, setAdminSecret] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  // Voting state
  const [isVoting, setIsVoting] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Seed sample proposals if simulator is empty
  useEffect(() => {
    const loadProposals = async () => {
      try {
        const list = await VotingAPI.getProposals(mode);
        if (mode === 'simulator' && list.length === 0) {
          // Proposal 1: Core Midnight protocol upgrade
          const admin1 = new Uint8Array(32);
          admin1[0] = 11;
          const p1 = await VotingAPI.deployProposal(
            "MIP-104: Upgrade Zero-Knowledge Proof Aggregation circuit for Midnight Layer 1",
            toHex(admin1),
            'simulator',
            'Protocol',
            15
          );

          // Seed a couple of initial votes
          const v1 = new Uint8Array(32); v1[0] = 101;
          const v2 = new Uint8Array(32); v2[0] = 102;
          const v3 = new Uint8Array(32); v3[0] = 103;
          await VotingAPI.castVote(p1, toHex(v1), true, 'simulator');
          await VotingAPI.castVote(p1, toHex(v2), true, 'simulator');
          await VotingAPI.castVote(p1, toHex(v3), false, 'simulator');

          // Proposal 2: Treasury Allocation
          const admin2 = new Uint8Array(32);
          admin2[0] = 22;
          const p2 = await VotingAPI.deployProposal(
            "Allocate 500,000 NIGHT tokens to the ZK Privacy Research & Developer Grant Fund",
            toHex(admin2),
            'simulator',
            'Treasury',
            20
          );
          const v4 = new Uint8Array(32); v4[0] = 104;
          await VotingAPI.castVote(p2, toHex(v4), true, 'simulator');

          // Proposal 3: Security Policy
          const admin3 = new Uint8Array(32);
          admin3[0] = 33;
          await VotingAPI.deployProposal(
            "Enforce mandatory Merkle proof verification for cross-chain bridge validators",
            toHex(admin3),
            'simulator',
            'Security',
            10
          );

          const updatedList = await VotingAPI.getProposals(mode);
          setProposals(updatedList);
          setActiveProposalId(p1);
        } else {
          setProposals(list);
          if (list.length > 0 && !activeProposalId) {
            setActiveProposalId(list[0].address);
          }
        }
      } catch (err: any) {
        showToast('error', `Failed to load proposals: ${err.message}`);
      }
    };
    loadProposals();
  }, [mode]);

  // Connect Lace Wallet
  const handleConnectWallet = async () => {
    try {
      if (!isLaceAvailable()) {
        showToast('error', 'Lace Wallet not detected. Please install the Lace extension.');
        return;
      }
      showToast('info', 'Connecting to Lace Wallet...');
      const connection = await connectLaceWallet();
      setWalletAddress(connection.address);
      setMode('lace');
      showToast('success', 'Connected to Lace Wallet on Midnight Testnet!');
    } catch (err: any) {
      showToast('error', `Wallet connection failed: ${err.message}`);
    }
  };

  // Reset Sandbox state
  const handleResetSandbox = () => {
    if (window.confirm("Reset sandbox state? This will reinitialize default ZK proposals.")) {
      localStorage.removeItem('midnight_voting_proposals');
      localStorage.removeItem('midnight_activity_events');
      window.location.reload();
    }
  };

  // Deploy Proposal
  const handleDeployProposal = async (
    text: string,
    adminSecretHex: string,
    category: 'Governance' | 'Protocol' | 'Treasury' | 'Security' | 'Community',
    quorum: number
  ) => {
    setIsDeploying(true);
    try {
      const address = await VotingAPI.deployProposal(text, adminSecretHex, mode, category, quorum);
      showToast('success', 'ZK Proposal contract deployed successfully!');
      
      const list = await VotingAPI.getProposals(mode);
      setProposals(list);
      setActiveProposalId(address);
    } catch (err: any) {
      showToast('error', `Deployment failed: ${err.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  // Cast Vote with Animated ZK Circuit Visualizer
  const handleCastVote = async (choice: boolean) => {
    if (!activeProposalId || !activeIdentity) {
      showToast('error', 'Please select or create an identity in the Key Vault.');
      setIsKeyVaultOpen(true);
      return;
    }

    const proposal = proposals.find((p) => p.address === activeProposalId);
    if (!proposal) return;

    if (!proposal.votingOpen) {
      showToast('error', 'Voting on this proposal is closed.');
      return;
    }

    setIsVoting(true);
    const maskedSecret = activeIdentity.secretKeyHex.slice(0, 8) + '...' + activeIdentity.secretKeyHex.slice(-6);

    // Launch ZK visualizer simulation modal
    setZkVisualizer({
      isOpen: true,
      step: 1,
      choice,
      voterSecretMasked: maskedSecret,
      proposalId: proposal.proposalId
    });

    try {
      // Step 2: Nullifier Derivation
      await new Promise((r) => setTimeout(r, 600));
      const nullifier = await deriveNullifier(activeIdentity.secretKeyHex, proposal.proposalId);

      setZkVisualizer((prev) => ({
        ...prev,
        step: 2,
        derivedNullifier: nullifier
      }));

      // Check if already voted
      if (proposal.nullifiers.includes(nullifier)) {
        throw new Error('Double voting is not allowed. This nullifier has already voted.');
      }

      // Step 3: ZK Proof Computation
      await new Promise((r) => setTimeout(r, 700));
      setZkVisualizer((prev) => ({ ...prev, step: 3 }));

      // Step 4: Ledger Execution
      await new Promise((r) => setTimeout(r, 600));
      const receipt = await VotingAPI.castVote(activeProposalId, activeIdentity.secretKeyHex, choice, mode);
      
      setZkVisualizer((prev) => ({ ...prev, step: 4 }));

      // Refresh proposals
      const list = await VotingAPI.getProposals(mode);
      setProposals(list);

      // Trigger celebratory confetti
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: choice ? ['#10b981', '#06b6d4', '#ffffff'] : ['#f43f5e', '#f59e0b', '#ffffff']
      });

      setLatestReceipt(receipt);
      showToast('success', `Anonymous ballot successfully recorded on-chain!`);
    } catch (err: any) {
      setZkVisualizer((prev) => ({ ...prev, isOpen: false }));
      showToast('error', `Vote rejected: ${err.message}`);
    } finally {
      setIsVoting(false);
    }
  };

  // Close Voting (Admin)
  const handleCloseVoting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProposalId) return;
    if (!adminSecret.trim()) {
      showToast('error', 'Admin secret key is required.');
      return;
    }

    setIsClosing(true);
    try {
      showToast('info', 'Validating admin commitment and closing circuit...');
      await VotingAPI.closeVoting(activeProposalId, adminSecret.trim(), mode);
      showToast('success', 'Voting period successfully frozen on-chain.');

      const list = await VotingAPI.getProposals(mode);
      setProposals(list);
      setAdminSecret('');
    } catch (err: any) {
      showToast('error', `Failed to close: ${err.message}`);
    } finally {
      setIsClosing(false);
    }
  };

  // Filtered proposals list
  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'open' && p.votingOpen) ||
        (statusFilter === 'closed' && !p.votingOpen);
      const matchesSearch =
        p.proposalText.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesStatus && matchesSearch;
    });
  }, [proposals, categoryFilter, statusFilter, searchQuery]);

  // Active Proposal stats
  const activeProposal = proposals.find((p) => p.address === activeProposalId);
  const totalVotes = activeProposal ? activeProposal.yesTally + activeProposal.noTally : 0;
  const yesPercent = totalVotes > 0 ? Math.round((activeProposal!.yesTally / totalVotes) * 100) : 0;
  const noPercent = totalVotes > 0 ? Math.round((activeProposal!.noTally / totalVotes) * 100) : 0;
  const quorumTarget = activeProposal?.quorumTarget || 10;
  const quorumPercent = Math.min(100, Math.round((totalVotes / quorumTarget) * 100));

  // Global aggregate stats
  const aggregateStats = useMemo(() => {
    const totalProps = proposals.length;
    const totalBallots = proposals.reduce((acc, p) => acc + p.yesTally + p.noTally, 0);
    const activeProps = proposals.filter((p) => p.votingOpen).length;
    const totalNullifiers = proposals.reduce((acc, p) => acc + p.nullifiers.length, 0);
    return { totalProps, totalBallots, activeProps, totalNullifiers };
  }, [proposals]);

  const categories = ['All', 'Governance', 'Protocol', 'Treasury', 'Security', 'Community'];

  return (
    <div className="app-wrapper">
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'info' && <div className="spinner-sm" />}
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
            {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
            <div>{toast.message}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <Header
        mode={mode}
        walletAddress={walletAddress}
        activeIdentity={activeIdentity}
        onOpenKeyVault={() => setIsKeyVaultOpen(true)}
        onOpenActivityFeed={() => setIsActivityFeedOpen(true)}
        onConnectWallet={handleConnectWallet}
        onResetSandbox={handleResetSandbox}
        onOpenDeploy={() => setIsDeployOpen(true)}
      />

      {/* Aggregate Stats Banner */}
      <div className="stats-banner">
        <div className="stat-card glass-panel">
          <div className="stat-icon-wrapper">
            <Vote className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="stat-number">{aggregateStats.totalProps}</div>
            <div className="stat-label-text">ZK Proposals</div>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-icon-wrapper">
            <Users className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="stat-number">{aggregateStats.totalBallots}</div>
            <div className="stat-label-text">Private Ballots Cast</div>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-icon-wrapper">
            <Unlock className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <div className="stat-number">{aggregateStats.activeProps}</div>
            <div className="stat-label-text">Active Ballots Open</div>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-icon-wrapper">
            <Hash className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <div className="stat-number">{aggregateStats.totalNullifiers}</div>
            <div className="stat-label-text">Nullifiers Spent</div>
          </div>
        </div>
      </div>

      {/* Privacy Guarantee Banner */}
      <div className="privacy-hero-banner glass-panel">
        <div className="privacy-hero-icon">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-white">EclipseVote ZK Privacy & Cryptographic Guarantees</h3>
            <span className="badge badge-network">Compact Circuit v0.23</span>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">
            Every ballot is verified using client-side ZK-SNARK proofs. No observer or validator can trace your wallet address to your YES/NO selection. Double-voting is mathematically blocked via deterministic one-way nullifier commitments (<code className="text-cyan-300 font-mono text-[11px]">nullifier = persistentHash(sk, proposalId)</code>).
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="filter-bar">
        <div className="category-filter-group">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`filter-chip ${categoryFilter === cat ? 'active' : ''}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className="search-input-wrapper max-w-xs">
            <Search className="search-icon w-3.5 h-3.5" />
            <input
              type="text"
              className="search-input"
              placeholder="Search proposals or contract..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex rounded-lg border border-white/10 p-0.5 bg-black/20">
            <button
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${statusFilter === 'all' ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>
            <button
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${statusFilter === 'open' ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setStatusFilter('open')}
            >
              Open
            </button>
            <button
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${statusFilter === 'closed' ? 'bg-rose-600/30 text-rose-300 font-semibold' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setStatusFilter('closed')}
            >
              Closed
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Detail View + Sidebar List */}
      <div className="dashboard-grid">
        {/* Left Side: Active Proposal Detailed View with Tabs */}
        <div>
          {activeProposal ? (
            <div className="glass-panel proposal-detail-card">
              {/* Proposal Header */}
              <div className="proposal-detail-header">
                <div className="flex justify-between items-start gap-4 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeProposal.category && (
                      <span className="badge badge-category flex items-center gap-1">
                        <Layers className="w-3 h-3 text-purple-400" />
                        {activeProposal.category}
                      </span>
                    )}
                    {activeProposal.votingOpen ? (
                      <span className="badge badge-open flex items-center gap-1">
                        <Unlock className="w-3 h-3" /> Voting Active
                      </span>
                    ) : (
                      <span className="badge badge-closed flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Voting Closed (Frozen)
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-gray-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                    {activeProposal.address.slice(0, 14)}...
                  </span>
                </div>

                <h2 className="proposal-detail-title">{activeProposal.proposalText}</h2>
              </div>

              {/* Detail Tabs */}
              <div className="proposal-tabs">
                <button
                  className={`proposal-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('overview')}
                >
                  <Vote className="w-4 h-4" />
                  <span>Ballot & Tally</span>
                </button>
                <button
                  className={`proposal-tab-btn ${activeTab === 'nullifiers' ? 'active' : ''}`}
                  onClick={() => setActiveTab('nullifiers')}
                >
                  <Hash className="w-4 h-4" />
                  <span>Nullifier Explorer ({activeProposal.nullifiers.length})</span>
                </button>
                <button
                  className={`proposal-tab-btn ${activeTab === 'spec' ? 'active' : ''}`}
                  onClick={() => setActiveTab('spec')}
                >
                  <Code2 className="w-4 h-4" />
                  <span>ZK Circuit & Ledger Spec</span>
                </button>
              </div>

              {/* Tab 1: Overview & Ballot Casting */}
              {activeTab === 'overview' && (
                <div>
                  {/* Public Tally Card */}
                  <div className="tally-card-container">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-cyan-400" />
                        <h4 className="text-sm font-semibold text-white">Public Running Tally (ZK-Verified)</h4>
                      </div>
                      <span className="text-xs font-mono text-gray-400">Total: {totalVotes} Ballots</span>
                    </div>

                    {/* YES Tally */}
                    <div className="tally-vote-row">
                      <span className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> YES
                      </span>
                      <span className="text-sm font-mono font-bold text-white">
                        {activeProposal.yesTally} ({yesPercent}%)
                      </span>
                    </div>
                    <div className="tally-progress-track">
                      <div
                        className="tally-progress-fill-yes"
                        style={{ width: `${yesPercent}%` }}
                      />
                    </div>

                    {/* NO Tally */}
                    <div className="tally-vote-row">
                      <span className="text-sm font-medium text-rose-400 flex items-center gap-1.5">
                        <Lock className="w-4 h-4" /> NO
                      </span>
                      <span className="text-sm font-mono font-bold text-white">
                        {activeProposal.noTally} ({noPercent}%)
                      </span>
                    </div>
                    <div className="tally-progress-track">
                      <div
                        className="tally-progress-fill-no"
                        style={{ width: `${noPercent}%` }}
                      />
                    </div>

                    {/* Quorum Meter */}
                    <div className="quorum-bar-wrapper">
                      <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="text-gray-400">Quorum Target ({quorumTarget} votes)</span>
                        <span className="font-mono text-purple-300 font-semibold">{quorumPercent}% Reached</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-500 rounded-full"
                          style={{ width: `${quorumPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Anonymous Vote Submission */}
                  {activeProposal.votingOpen ? (
                    <div className="vote-action-box">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-cyan-400" />
                          Cast Your Anonymous Zero-Knowledge Ballot
                        </h3>
                      </div>
                      <p className="text-xs text-gray-400 mb-4">
                        Voting derives a unique nullifier that spends your voting right for this proposal without ever leaking your identity or choice to the blockchain.
                      </p>

                      {/* Active Identity Selector Pill */}
                      <div className="identity-quick-selector">
                        <div className="flex items-center gap-2.5">
                          <div className="vault-avatar">
                            {activeIdentity ? activeIdentity.label.slice(0, 2).toUpperCase() : 'SK'}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-white">
                              {activeIdentity ? activeIdentity.label : 'No Key Selected'}
                            </div>
                            <div className="text-[10px] font-mono text-gray-400">
                              {activeIdentity
                                ? `${activeIdentity.secretKeyHex.slice(0, 10)}...${activeIdentity.secretKeyHex.slice(-6)}`
                                : 'Click switch to generate key'}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 text-cyan-400"
                          onClick={() => setIsKeyVaultOpen(true)}
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>Switch Identity</span>
                        </button>
                      </div>

                      {/* Vote Buttons */}
                      <div className="vote-btn-grid">
                        <button
                          className="btn-vote-yes"
                          onClick={() => handleCastVote(true)}
                          disabled={isVoting || !activeIdentity}
                        >
                          <span className="text-base font-bold">Vote YES</span>
                          <span className="text-[11px] opacity-80">Prove ballot choice = true</span>
                        </button>
                        <button
                          className="btn-vote-no"
                          onClick={() => handleCastVote(false)}
                          disabled={isVoting || !activeIdentity}
                        >
                          <span className="text-base font-bold">Vote NO</span>
                          <span className="text-[11px] opacity-80">Prove ballot choice = false</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="glass-panel p-6 rounded-2xl text-center border-rose-500/20 bg-rose-950/10 mb-6">
                      <Lock className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                      <h4 className="text-sm font-semibold text-white">Voting Period Has Concluded</h4>
                      <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                        The designated admin closed this ballot circuit. On-chain state is frozen and final tallies are immutable.
                      </p>
                    </div>
                  )}

                  {/* Admin Closure Control */}
                  {activeProposal.votingOpen && (
                    <div className="glass-panel p-4 rounded-xl border border-white/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-4 h-4 text-amber-400" />
                        <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                          Admin Authority Action
                        </h4>
                      </div>
                      <form onSubmit={handleCloseVoting} className="flex gap-2">
                        <input
                          type="password"
                          className="form-input text-xs font-mono flex-1"
                          placeholder="Admin Secret Key (required to close)..."
                          value={adminSecret}
                          onChange={(e) => setAdminSecret(e.target.value)}
                        />
                        <button
                          type="submit"
                          className="btn btn-secondary text-xs px-3 text-rose-400 hover:text-rose-300 border-rose-500/30"
                          disabled={isClosing || !adminSecret.trim()}
                        >
                          {isClosing ? 'Closing...' : 'Close Ballot'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Nullifier Explorer */}
              {activeTab === 'nullifiers' && (
                <NullifierExplorer proposal={activeProposal} />
              )}

              {/* Tab 3: Contract & Technical Spec */}
              {activeTab === 'spec' && (
                <div className="space-y-4">
                  <div className="glass-panel p-4 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <FileCode className="w-4 h-4 text-purple-400" />
                      <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                        Public Ledger State
                      </h4>
                    </div>
                    <div className="font-mono text-xs text-gray-300 space-y-1 bg-black/40 p-3 rounded-lg">
                      <div><span className="text-purple-400">proposalId:</span> {activeProposal.proposalId}</div>
                      <div><span className="text-cyan-400">contractAddress:</span> {activeProposal.address}</div>
                      <div><span className="text-amber-400">adminCommitment:</span> {activeProposal.adminCommitment}</div>
                      <div><span className="text-emerald-400">votingOpen:</span> {String(activeProposal.votingOpen)}</div>
                      <div><span className="text-white">nullifiersCount:</span> {activeProposal.nullifiers.length}</div>
                    </div>
                  </div>

                  <div className="glass-panel p-4 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Code2 className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                        Compact Circuit: castVote()
                      </h4>
                    </div>
                    <pre className="font-mono text-[11px] text-gray-300 bg-black/40 p-3 rounded-lg overflow-x-auto leading-relaxed">
{`export circuit castVote(): [] {
    assert(votingOpen, "Voting is closed");

    const sk = voterSecretKey();
    const choice = disclose(voteChoice());

    // Derive deterministic nullifier inside circuit
    const nullifier = disclose(persistentHash<Vector<2, Bytes<32>>>([sk, proposalId]));

    // Prevent double voting
    assert(!nullifierSet.member(nullifier), "Double voting is not allowed");

    // Insert into ledger nullifier set and increment tally
    nullifierSet.insert(nullifier, true);
    if (choice) {
        yesTally.increment(1);
    } else {
        noTally.increment(1);
    }
}`}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel p-12 text-center rounded-2xl text-gray-400">
              <Vote className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <h3 className="text-base font-semibold text-white mb-1">No Proposal Selected</h3>
              <p className="text-xs text-gray-400 mb-4">
                Choose a proposal from the list on the right or deploy a new Zero-Knowledge ballot circuit.
              </p>
              <button className="btn btn-primary text-xs" onClick={() => setIsDeployOpen(true)}>
                + Deploy New Proposal
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Sidebar Proposals List */}
        <div>
          <div className="glass-panel p-5 rounded-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Governance Proposals ({filteredProposals.length})</span>
              </h3>
              <button
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                onClick={() => setIsDeployOpen(true)}
              >
                + New
              </button>
            </div>

            {filteredProposals.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-xs">
                No proposals match your current filters.
              </div>
            ) : (
              <div className="sidebar-proposal-list">
                {filteredProposals.map((prop) => {
                  const isActive = activeProposalId === prop.address;
                  const votesCount = prop.yesTally + prop.noTally;
                  return (
                    <div
                      key={prop.address}
                      className={`proposal-item-card ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveProposalId(prop.address)}
                    >
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        {prop.category && (
                          <span className="badge badge-category">{prop.category}</span>
                        )}
                        {prop.votingOpen ? (
                          <span className="badge badge-open text-[10px]">Open</span>
                        ) : (
                          <span className="badge badge-closed text-[10px]">Closed</span>
                        )}
                      </div>

                      <h4 className="proposal-item-title line-clamp-2">
                        {prop.proposalText}
                      </h4>

                      <div className="flex justify-between items-center text-[11px] text-gray-400 pt-1 border-t border-white/5 mt-2">
                        <span className="font-mono">{prop.address.slice(0, 10)}...</span>
                        <span className="font-semibold text-gray-300">{votesCount} votes</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <KeyVaultModal
        isOpen={isKeyVaultOpen}
        onClose={() => setIsKeyVaultOpen(false)}
        selectedIdentityId={activeIdentity ? activeIdentity.id : null}
        onSelectIdentity={(id) => {
          setActiveIdentity(id);
          showToast('info', `Switched to identity: ${id.label}`);
        }}
      />

      <ZkVisualizerModal
        isOpen={zkVisualizer.isOpen}
        step={zkVisualizer.step}
        voterSecretMasked={zkVisualizer.voterSecretMasked}
        choice={zkVisualizer.choice}
        proposalId={zkVisualizer.proposalId}
        derivedNullifier={zkVisualizer.derivedNullifier}
        onDone={() => setZkVisualizer((prev) => ({ ...prev, isOpen: false }))}
      />

      <ReceiptModal
        receipt={latestReceipt}
        onClose={() => setLatestReceipt(null)}
      />

      <ActivityFeedModal
        isOpen={isActivityFeedOpen}
        onClose={() => setIsActivityFeedOpen(false)}
      />

      <DeployProposalModal
        isOpen={isDeployOpen}
        onClose={() => setIsDeployOpen(false)}
        onDeploy={handleDeployProposal}
        isDeploying={isDeploying}
      />
    </div>
  );
}

export default App;
