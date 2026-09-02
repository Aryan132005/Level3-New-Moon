import { useState } from 'react';
import { VoterIdentity, getSavedIdentities, saveIdentities, toHex } from '../votingApi';
import { Key, Plus, Trash2, Shield, Copy, Check, Sparkles, X, UserCheck } from 'lucide-react';

interface KeyVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIdentityId: string | null;
  onSelectIdentity: (identity: VoterIdentity) => void;
  currentProposalNullifiers?: string[];
  currentProposalId?: string;
}

export function KeyVaultModal({
  isOpen,
  onClose,
  selectedIdentityId,
  onSelectIdentity
}: KeyVaultModalProps) {
  const [identities, setIdentities] = useState<VoterIdentity[]>(() => getSavedIdentities());
  const [newLabel, setNewLabel] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleGenerateRandom = () => {
    const key = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(key);
    } else {
      for (let i = 0; i < 32; i++) key[i] = Math.floor(Math.random() * 256);
    }
    setCustomKey(toHex(key));
  };

  const handleCreateIdentity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;

    let keyHex = customKey.trim();
    if (!keyHex) {
      const key = new Uint8Array(32);
      if (window.crypto) window.crypto.getRandomValues(key);
      keyHex = toHex(key);
    }

    const newId: VoterIdentity = {
      id: 'id_' + Date.now().toString(36),
      label: newLabel.trim(),
      secretKeyHex: keyHex,
      avatarSeed: newLabel.trim(),
      createdAt: Date.now()
    };

    const updated = [newId, ...identities];
    setIdentities(updated);
    saveIdentities(updated);
    setNewLabel('');
    setCustomKey('');
    setIsCreating(false);
    onSelectIdentity(newId);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = identities.filter(i => i.id !== id);
    setIdentities(updated);
    saveIdentities(updated);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <Key className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="modal-title">Cryptographic Key Vault</h2>
              <p className="modal-subtitle">Manage anonymous voter identities & key commitments</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body">
          {/* Security Notice */}
          <div className="vault-notice">
            <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              All private keys remain client-side in secure sandbox memory. They are mathematically isolated and never revealed during Zero-Knowledge ballot generation.
            </span>
          </div>

          {/* Quick Create Action */}
          {!isCreating ? (
            <button
              className="btn btn-secondary w-full flex items-center justify-center gap-2 mb-4"
              onClick={() => {
                setIsCreating(true);
                handleGenerateRandom();
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Create New Anonymous Identity</span>
            </button>
          ) : (
            <form onSubmit={handleCreateIdentity} className="vault-create-form glass-panel mb-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  New Voter Identity
                </span>
                <button
                  type="button"
                  className="text-xs text-gray-400 hover:text-white"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </button>
              </div>

              <div className="form-group mb-2">
                <label className="form-label text-xs">Identity Label / Alias</label>
                <input
                  type="text"
                  className="form-input text-sm"
                  placeholder="e.g. Core Delegate / Voter 0x42"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group mb-3">
                <div className="flex justify-between items-center mb-1">
                  <label className="form-label text-xs">Secret Key (32-byte Hex)</label>
                  <button
                    type="button"
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-mono"
                    onClick={handleGenerateRandom}
                  >
                    Regenerate Key
                  </button>
                </div>
                <input
                  type="text"
                  className="form-input font-mono text-xs"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary w-full text-xs py-2">
                Save & Activate Identity
              </button>
            </form>
          )}

          {/* Identity Cards List */}
          <div className="vault-identities-list">
            {identities.length === 0 ? (
              <div className="empty-state py-6">
                <p className="text-gray-400 text-sm">No identities in vault. Create one to begin voting.</p>
              </div>
            ) : (
              identities.map((identity) => {
                const isSelected = selectedIdentityId === identity.id;
                return (
                  <div
                    key={identity.id}
                    className={`vault-identity-card ${isSelected ? 'active-vault-card' : ''}`}
                    onClick={() => {
                      onSelectIdentity(identity);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="vault-avatar">
                          {identity.label.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-white">{identity.label}</span>
                            {isSelected && (
                              <span className="badge badge-active-id flex items-center gap-1">
                                <UserCheck className="w-3 h-3" /> Active
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-xs text-gray-400 mt-0.5">
                            {identity.secretKeyHex.slice(0, 10)}...{identity.secretKeyHex.slice(-8)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="vault-action-btn"
                          title="Copy Secret Key"
                          onClick={() => handleCopy(identity.id, identity.secretKeyHex)}
                        >
                          {copiedId === identity.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </button>
                        <button
                          className="vault-action-btn text-rose-400 hover:text-rose-300"
                          title="Delete Identity"
                          onClick={(e) => handleDelete(identity.id, e)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary w-full" onClick={onClose}>
            Close Vault
          </button>
        </div>
      </div>
    </div>
  );
}
