import React, { useState, useEffect } from 'react';
import { VotingAPI, ProposalState, isLaceAvailable, connectLaceWallet, toHex } from './votingApi';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export function App() {
  // Mode selection: 'simulator' (default sandbox) or 'lace' (live wallet)
  const [mode, setMode] = useState<'simulator' | 'lace'>('simulator');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  // Proposals list
  const [proposals, setProposals] = useState<ProposalState[]>([]);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  
  // Deployment inputs
  const [newProposalText, setNewProposalText] = useState('');
  const [deployAdminSecret, setDeployAdminSecret] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  
  // Voting inputs
  const [voterSecret, setVoterSecret] = useState('');
  const [isVoting, setIsVoting] = useState(false);
  
  // Close voting inputs
  const [adminSecret, setAdminSecret] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Add toast alert
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Enforce some seed proposals in simulator mode if none exist
  useEffect(() => {
    const loadProposals = async () => {
      try {
        const list = await VotingAPI.getProposals(mode);
        if (mode === 'simulator' && list.length === 0) {
          // Add a default template proposal
          const adminSeed = new Uint8Array(32);
          adminSeed[0] = 99;
          const adminSecretHex = toHex(adminSeed);
          const defaultAddress = await VotingAPI.deployProposal(
            "Should we adopt Midnight as our primary privacy L1 blockchain?",
            adminSecretHex,
            'simulator'
          );
          
          // Cast a default Yes vote to show initial data
          const voterSeed = new Uint8Array(32);
          voterSeed[0] = 55;
          await VotingAPI.castVote(defaultAddress, toHex(voterSeed), true, 'simulator');
          
          const updatedList = await VotingAPI.getProposals(mode);
          setProposals(updatedList);
          setActiveProposalId(defaultAddress);
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
      showToast('success', 'Connected to Lace Wallet!');
    } catch (err: any) {
      showToast('error', `Wallet connection failed: ${err.message}`);
    }
  };

  // Reset Sandbox state
  const handleResetSandbox = () => {
    if (window.confirm("Are you sure you want to clear all sandbox proposals and reset the state?")) {
      localStorage.removeItem('midnight_voting_proposals');
      window.location.reload();
    }
  };

  // Deploy Proposal
  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProposalText.trim()) {
      showToast('error', 'Proposal description cannot be empty.');
      return;
    }
    if (!deployAdminSecret || deployAdminSecret.length < 4) {
      showToast('error', 'Provide a valid hexadecimal admin secret key (e.g. 64 characters).');
      return;
    }

    setIsDeploying(true);
    try {
      const address = await VotingAPI.deployProposal(newProposalText, deployAdminSecret, mode);
      showToast('success', 'Proposal smart contract deployed successfully!');
      
      // Refresh list
      const list = await VotingAPI.getProposals(mode);
      setProposals(list);
      setActiveProposalId(address);
      
      // Reset forms
      setNewProposalText('');
      setDeployAdminSecret('');
    } catch (err: any) {
      showToast('error', `Deployment failed: ${err.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  // Cast Vote
  const handleCastVote = async (choice: boolean) => {
    if (!activeProposalId) return;
    if (!voterSecret) {
      showToast('error', 'Voter private secret key is required.');
      return;
    }

    setIsVoting(true);
    try {
      showToast('info', 'Generating zero-knowledge proof client-side...');
      await VotingAPI.castVote(activeProposalId, voterSecret, choice, mode);
      showToast('success', `Ballot successfully recorded! nullifier registered.`);
      
      // Refresh list
      const list = await VotingAPI.getProposals(mode);
      setProposals(list);
      setVoterSecret('');
    } catch (err: any) {
      showToast('error', `Vote rejected: ${err.message}`);
    } finally {
      setIsVoting(false);
    }
  };

  // Close Voting
  const handleCloseVoting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProposalId) return;
    if (!adminSecret) {
      showToast('error', 'Admin secret key is required to close voting.');
      return;
    }

    setIsClosing(true);
    try {
      showToast('info', 'Submitting close transaction...');
      await VotingAPI.closeVoting(activeProposalId, adminSecret, mode);
      showToast('success', 'Voting period successfully closed.');
      
      // Refresh list
      const list = await VotingAPI.getProposals(mode);
      setProposals(list);
      setAdminSecret('');
    } catch (err: any) {
      showToast('error', `Close failed: ${err.message}`);
    } finally {
      setIsClosing(false);
    }
  };

  // Helper to generate a random 32-byte hexadecimal key
  const generateRandomHexKey = (setter: (val: string) => void) => {
    const key = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(key);
    } else {
      for (let i = 0; i < 32; i++) {
        key[i] = Math.floor(Math.random() * 256);
      }
    }
    setter(toHex(key));
    showToast('info', 'Generated new cryptographic secret key.');
  };

  // Active proposal details
  const activeProposal = proposals.find(p => p.address === activeProposalId);

  // Compute percentages
  const totalVotes = activeProposal ? activeProposal.yesTally + activeProposal.noTally : 0;
  const yesPercent = totalVotes > 0 ? Math.round((activeProposal!.yesTally / totalVotes) * 100) : 0;
  const noPercent = totalVotes > 0 ? Math.round((activeProposal!.noTally / totalVotes) * 100) : 0;

  return (
    <div className="app-container">
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'info' && <div className="spinner" />}
            <div>{toast.message}</div>
          </div>
        ))}
      </div>

      {/* Header Area */}
      <header className="header">
        <div className="logo-container">
          <div className="logo-icon">M</div>
          <div>
            <h1 className="logo-text">Midnight Voting</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Privacy-preserving L1 Zero-Knowledge Voting</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {mode === 'simulator' ? (
            <span className="badge badge-simulator">● Sandbox Simulator</span>
          ) : (
            <span className="badge badge-lace">● Connected to Lace ({walletAddress?.slice(0, 8)}...)</span>
          )}
          
          {mode === 'simulator' && (
            <button className="btn btn-secondary btn-action" onClick={handleResetSandbox}>
              Reset Sandbox
            </button>
          )}
          {mode === 'simulator' && isLaceAvailable() && (
            <button className="btn btn-secondary btn-action" onClick={handleConnectWallet}>
              Connect Lace Wallet
            </button>
          )}
        </div>
      </header>

      {/* Privacy Notice Banner */}
      <div className="info-banner glass-panel">
        <span className="info-banner-icon">🛡️</span>
        <div>
          <strong>Privacy Guarantees under Zero-Knowledge Proofs:</strong> Voters authorize themselves anonymously by utilizing private key materials to compute nullifiers inside a client-side ZK proof. No transaction link can associate your voter identity with your chosen YES/NO ballot. Only the final running tally increments publicly and verifiably.
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid-main">
        {/* Left Side: Active Proposal & Vote casting */}
        <div>
          {/* Active Proposal View */}
          {activeProposal ? (
            <div className="glass-panel panel-card">
              <div className="proposal-header">
                <h2 style={{ color: 'white', marginBottom: '0.5rem' }}>{activeProposal.proposalText}</h2>
                {activeProposal.votingOpen ? (
                  <span className="badge badge-open">Voting Open</span>
                ) : (
                  <span className="badge badge-closed">Voting Closed</span>
                )}
              </div>
              
              <div className="proposal-meta">
                <span>Contract ID: <span className="proposal-address">{activeProposal.address}</span></span>
                <span>Nullifiers Spent: <strong>{activeProposal.nullifiers.length}</strong></span>
              </div>

              {/* Tally results */}
              <div className="tally-container">
                <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '1rem', marginTop: '1.5rem' }}>
                  Public Running Tally (ZK Verifiable)
                </h3>
                
                <div className="tally-row">
                  <span>YES Ballots</span>
                  <strong>{activeProposal.yesTally} ({yesPercent}%)</strong>
                </div>
                <div className="tally-bar-bg">
                  <div className="tally-bar-fill tally-bar-fill-yes" style={{ width: `${yesPercent}%` }}></div>
                </div>

                <div className="tally-row">
                  <span>NO Ballots</span>
                  <strong>{activeProposal.noTally} ({noPercent}%)</strong>
                </div>
                <div className="tally-bar-bg">
                  <div className="tally-bar-fill tally-bar-fill-no" style={{ width: `${noPercent}%` }}></div>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="stats-grid">
                <div className="stat-box">
                  <div className="stat-val">{totalVotes}</div>
                  <div className="stat-label">Total Votes Cast</div>
                </div>
                <div className="stat-box">
                  <div className="stat-val">{activeProposal.nullifiers.length}</div>
                  <div className="stat-label">Registered Nullifiers</div>
                </div>
              </div>

              <hr style={{ border: 'none', borderBottom: '1px solid var(--border-glass)', margin: '2rem 0' }} />

              {/* Vote Casting Panel */}
              {activeProposal.votingOpen ? (
                <div>
                  <h3 className="panel-title">🗳️ Cast Your Anonymous Vote</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    Input your private secret key (as an eligibility commitment) and select choice. A client-side ZK proof will be computed, locking your nullifier and updating the tally.
                  </p>
                  
                  <div className="form-group">
                    <label className="form-label">Voter Cryptographic Secret Key (Hex)</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 32-byte hex string (64 characters)"
                        value={voterSecret}
                        onChange={(e) => setVoterSecret(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-action"
                        onClick={() => generateRandomHexKey(setVoterSecret)}
                        disabled={isVoting}
                      >
                        Generate Random
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
                    <button
                      className="btn btn-vote-yes"
                      onClick={() => handleCastVote(true)}
                      disabled={isVoting || !voterSecret}
                    >
                      {isVoting ? 'Proving YES...' : 'Vote YES'}
                    </button>
                    <button
                      className="btn btn-vote-no"
                      onClick={() => handleCastVote(false)}
                      disabled={isVoting || !voterSecret}
                    >
                      {isVoting ? 'Proving NO...' : 'Vote NO'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">🔒</div>
                  <h4>This voting period has ended</h4>
                  <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                    The ZK circuit ledger state is now frozen. No further nullifiers can be spent and no ballots can be accepted.
                  </p>
                </div>
              )}

              {/* Admin Panel (Closing Proposals) */}
              {activeProposal.votingOpen && (
                <div>
                  <hr style={{ border: 'none', borderBottom: '1px solid var(--border-glass)', margin: '2rem 0' }} />
                  <h3 className="panel-title">🛡️ Admin Control</h3>
                  <form onSubmit={handleCloseVoting}>
                    <div className="form-group">
                      <label className="form-label">Admin Secret Key (Hex)</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Must match the admin commitment designated during proposal deployment"
                        value={adminSecret}
                        onChange={(e) => setAdminSecret(e.target.value)}
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-secondary btn-action"
                      style={{ width: '100%', borderColor: 'rgba(255, 59, 48, 0.4)', color: '#ff7b75' }}
                      disabled={isClosing || !adminSecret}
                    >
                      {isClosing ? 'Closing voting...' : 'Close Voting Period'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel panel-card empty-state">
              <div className="empty-state-icon">📊</div>
              <h3>No Proposal Active</h3>
              <p>Select a proposal from the sidebar or create a new one to view details and cast votes.</p>
            </div>
          )}
        </div>

        {/* Right Side: Sidebar listing and deployment */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Create Proposal Card */}
          <div className="glass-panel panel-card">
            <h3 className="panel-title">➕ Deploy ZK Proposal Contract</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Create a new voting circuit on the Midnight ledger. Designated admin key will control when voting is frozen.
            </p>
            
            <form onSubmit={handleDeploy}>
              <div className="form-group">
                <label className="form-label">Proposal Topic / Question</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="e.g. Do you support launching our ZK voting dApp on mainnet?"
                  value={newProposalText}
                  onChange={(e) => setNewProposalText(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Admin Secret Key (Hex)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Key to authorize closure of this voting period"
                    value={deployAdminSecret}
                    onChange={(e) => setDeployAdminSecret(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-action"
                    onClick={() => generateRandomHexKey(setDeployAdminSecret)}
                    disabled={isDeploying}
                  >
                    Generate
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '0.5rem' }}
                disabled={isDeploying || !newProposalText || !deployAdminSecret}
              >
                {isDeploying ? 'Deploying Circuit...' : 'Deploy Proposal'}
              </button>
            </form>
          </div>

          {/* Proposals List Card */}
          <div className="glass-panel panel-card">
            <h3 className="panel-title">📋 Active ZK Proposals</h3>
            {proposals.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No proposals deployed yet.</p>
            ) : (
              <div className="proposal-list-container">
                {proposals.map((prop) => (
                  <div
                    key={prop.address}
                    className={`proposal-card ${activeProposalId === prop.address ? 'active' : ''}`}
                    onClick={() => setActiveProposalId(prop.address)}
                  >
                    <div className="proposal-header">
                      <div className="proposal-title">{prop.proposalText.slice(0, 50)}...</div>
                      {prop.votingOpen ? (
                        <span className="badge badge-open" style={{ fontSize: '0.65rem' }}>Open</span>
                      ) : (
                        <span className="badge badge-closed" style={{ fontSize: '0.65rem' }}>Closed</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      ID: {prop.address.slice(0, 16)}...
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default App;
