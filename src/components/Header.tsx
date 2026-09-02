import { VoterIdentity, isLaceAvailable } from '../votingApi';
import { Shield, Key, Activity, RefreshCw, Wallet } from 'lucide-react';

interface HeaderProps {
  mode: 'simulator' | 'lace';
  walletAddress: string | null;
  activeIdentity: VoterIdentity | null;
  onOpenKeyVault: () => void;
  onOpenActivityFeed: () => void;
  onConnectWallet: () => void;
  onResetSandbox: () => void;
  onOpenDeploy: () => void;
}

export function Header({
  mode,
  walletAddress,
  activeIdentity,
  onOpenKeyVault,
  onOpenActivityFeed,
  onConnectWallet,
  onResetSandbox,
  onOpenDeploy
}: HeaderProps) {
  return (
    <header className="header-container glass-panel">
      {/* Brand & Title */}
      <div className="flex items-center gap-3.5">
        <div className="brand-logo-container">
          <div className="brand-logo-glow" />
          <div className="brand-logo">
            <Shield className="w-5 h-5 text-white" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="brand-title">Midnight ZK Governance</h1>
            <span className="badge badge-network">Midnight L1</span>
            <span className="badge badge-zk">ZK-SNARK</span>
          </div>
          <p className="brand-tagline">
            Anonymous decentralized balloting powered by Compact Zero-Knowledge circuits
          </p>
        </div>
      </div>

      {/* Actions & Utilities */}
      <div className="header-actions">
        {/* Active Voter Key Vault pill */}
        <button
          className="header-pill-btn vault-pill"
          onClick={onOpenKeyVault}
          title="Open Key Vault to switch identities"
        >
          <div className="pill-avatar">
            {activeIdentity ? activeIdentity.label.slice(0, 2).toUpperCase() : 'SK'}
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-[10px] text-gray-400 font-medium">Active Identity</div>
            <div className="text-xs font-semibold text-white flex items-center gap-1">
              <Key className="w-3 h-3 text-cyan-400" />
              <span>{activeIdentity ? activeIdentity.label : 'Key Vault'}</span>
            </div>
          </div>
        </button>

        {/* Live Activity Stream button */}
        <button
          className="header-pill-btn"
          onClick={onOpenActivityFeed}
          title="Open Activity Stream"
        >
          <Activity className="w-4 h-4 text-purple-400" />
          <span className="hidden md:inline text-xs font-medium">Activity</span>
        </button>

        {/* Network / Wallet status */}
        {mode === 'simulator' ? (
          <div className="badge badge-simulator flex items-center gap-1.5">
            <span className="status-dot-pulse bg-purple-400" />
            <span className="text-xs font-semibold">Simulator Sandbox</span>
          </div>
        ) : (
          <div className="badge badge-lace flex items-center gap-1.5">
            <span className="status-dot-pulse bg-cyan-400" />
            <span className="text-xs font-mono font-semibold">
              Lace ({walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)})
            </span>
          </div>
        )}

        {/* Connect Lace if available and currently in simulator */}
        {mode === 'simulator' && isLaceAvailable() && (
          <button className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" onClick={onConnectWallet}>
            <Wallet className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Connect Lace</span>
          </button>
        )}

        {/* Reset Sandbox */}
        {mode === 'simulator' && (
          <button
            className="btn btn-secondary text-xs py-1.5 px-2.5 text-gray-400 hover:text-white"
            onClick={onResetSandbox}
            title="Reset sandbox state"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        {/* New Proposal CTA */}
        <button className="btn btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5" onClick={onOpenDeploy}>
          <span>+ New Proposal</span>
        </button>
      </div>
    </header>
  );
}
