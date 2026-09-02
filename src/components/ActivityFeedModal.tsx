import { useState } from 'react';
import { ActivityEvent, getActivityEvents } from '../votingApi';
import { Activity, PlusCircle, CheckCircle2, Lock, X, RefreshCw } from 'lucide-react';

interface ActivityFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ActivityFeedModal({ isOpen, onClose }: ActivityFeedModalProps) {
  const [events, setEvents] = useState<ActivityEvent[]>(() => getActivityEvents());

  if (!isOpen) return null;

  const handleRefresh = () => {
    setEvents(getActivityEvents());
  };

  const getEventIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'deploy':
        return <PlusCircle className="w-4 h-4 text-cyan-400" />;
      case 'vote':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'close':
        return <Lock className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-panel activity-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="activity-icon-badge">
              <Activity className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="modal-title">EclipseVote Activity Stream</h2>
              <p className="modal-subtitle">Real-time cryptographic ledger events</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              onClick={handleRefresh}
              title="Refresh events"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button className="modal-close-btn" onClick={onClose} aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {events.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              <Activity className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <span>No recorded activity events yet. Deploy a proposal or cast a vote to populate the ledger log.</span>
            </div>
          ) : (
            <div className="activity-timeline space-y-3">
              {events.map((evt) => (
                <div key={evt.id} className="activity-item glass-panel p-3.5 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="activity-type-icon mt-0.5">
                      {getEventIcon(evt.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                          {evt.type === 'deploy' ? 'Contract Deployment' : evt.type === 'vote' ? 'Ballot Cast' : 'Voting Frozen'}
                        </span>
                        <span className="text-[11px] font-mono text-gray-400">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 font-medium truncate mb-1">
                        {evt.proposalText}
                      </p>
                      {evt.details && (
                        <p className="text-[11px] text-gray-400 font-mono">
                          {evt.details}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary w-full" onClick={onClose}>
            Close Stream
          </button>
        </div>
      </div>
    </div>
  );
}
