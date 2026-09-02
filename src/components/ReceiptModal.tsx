import { useState } from 'react';
import { VotingReceipt } from '../votingApi';
import { ShieldCheck, Download, Copy, Check, X, FileCheck2, Sparkles } from 'lucide-react';

interface ReceiptModalProps {
  receipt: VotingReceipt | null;
  onClose: () => void;
}

export function ReceiptModal({ receipt, onClose }: ReceiptModalProps) {
  const [copied, setCopied] = useState(false);

  if (!receipt) return null;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(receipt, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `zk_ballot_receipt_${receipt.receiptId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-panel receipt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header border-b-0 pb-0">
          <div className="flex items-center gap-3">
            <div className="receipt-badge-icon">
              <FileCheck2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="modal-title">Zero-Knowledge Ballot Receipt</h2>
              <p className="modal-subtitle">Cryptographically verifiable on-chain voting certificate</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body">
          {/* Certificate Card */}
          <div className="receipt-certificate glass-panel">
            <div className="receipt-watermark">
              <ShieldCheck className="w-32 h-32 text-emerald-500/10" />
            </div>

            <div className="flex justify-between items-center mb-4">
              <span className="text-xs uppercase tracking-wider font-mono text-emerald-400 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Proof Validated
              </span>
              <span className="text-xs font-mono text-gray-400">
                {new Date(receipt.timestamp).toLocaleString()}
              </span>
            </div>

            <h3 className="text-base font-semibold text-white mb-3">
              {receipt.proposalText}
            </h3>

            <div className="receipt-meta-grid">
              <div className="receipt-field">
                <span className="receipt-label">Receipt ID</span>
                <span className="receipt-value font-mono">{receipt.receiptId}</span>
              </div>
              <div className="receipt-field">
                <span className="receipt-label">Your Vote Ballot</span>
                <span className={`receipt-value font-semibold ${receipt.choice === 'YES' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {receipt.choice}
                </span>
              </div>
              <div className="receipt-field col-span-2">
                <span className="receipt-label">Deterministic Nullifier Hash</span>
                <span className="receipt-value font-mono break-all text-xs text-cyan-300">
                  {receipt.nullifierHex}
                </span>
              </div>
              <div className="receipt-field col-span-2">
                <span className="receipt-label">Contract Address</span>
                <span className="receipt-value font-mono break-all text-xs text-gray-300">
                  {receipt.contractAddress}
                </span>
              </div>
              <div className="receipt-field col-span-2">
                <span className="receipt-label">Circuit Proof Hash</span>
                <span className="receipt-value font-mono break-all text-xs text-purple-300">
                  {receipt.circuitProofHash}
                </span>
              </div>
            </div>

            <div className="receipt-footer-note">
              This receipt confirms your vote was mathematically included in the ledger tally without revealing your identity or choice to any observer.
            </div>
          </div>
        </div>

        <div className="modal-footer flex items-center gap-3">
          <button
            className="btn btn-secondary flex-1 flex items-center justify-center gap-2"
            onClick={handleCopyJson}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied JSON' : 'Copy JSON'}</span>
          </button>
          <button
            className="btn btn-primary flex-1 flex items-center justify-center gap-2"
            onClick={handleDownload}
          >
            <Download className="w-4 h-4" />
            <span>Download Certificate</span>
          </button>
        </div>
      </div>
    </div>
  );
}
