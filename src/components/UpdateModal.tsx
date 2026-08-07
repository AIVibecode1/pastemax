import React, { useCallback } from 'react';

export interface UpdateCheckResultFromMain {
  isUpdateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  error?: string;
  isLoading?: boolean;
  debugLogs?: string;
}

export interface UpdateDisplayState extends UpdateCheckResultFromMain {
  isLoading: boolean;
}

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateStatus: UpdateDisplayState | null;
}

const UpdateModal = ({ isOpen, onClose, updateStatus }: UpdateModalProps) => {
  const handleDownloadUpdate = useCallback(() => {
    if (updateStatus?.releaseUrl) {
      window.open(updateStatus.releaseUrl, '_blank');
    }
  }, [updateStatus]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="update-modal-overlay">
      <div className="update-modal-content" tabIndex={-1}>
        <div className="update-modal-header">
          <h3>Update Status</h3>
          <button
            className="update-modal-close-button"
            onClick={onClose}
            aria-label="Close update modal"
            title="Close"
          >
            Close
          </button>
        </div>
        <div className="update-modal-body">
          {!updateStatus ? (
            <p className="update-message">Loading update status...</p>
          ) : updateStatus.isLoading ? (
            <p className="update-message">Checking for updates...</p>
          ) : updateStatus.error ? (
            <>
              <p className="update-message update-message-error">Error: {updateStatus.error}</p>
              {/* Retry button removed */}
            </>
          ) : updateStatus.isUpdateAvailable ? (
            <div>
              <p className="update-message update-message-success">
                New version available:{' '}
                <span className="update-version">{updateStatus.latestVersion}</span>
              </p>
              <p className="update-message">
                Current version:{' '}
                <span className="update-version">{updateStatus.currentVersion}</span>
              </p>
              <button
                className="check-updates-button"
                type="button"
                tabIndex={0}
                onClick={handleDownloadUpdate}
              >
                Download Update
              </button>
            </div>
          ) : (
            <>
              <p className="update-message update-message-success">
                You're up to date with version {updateStatus.currentVersion}
              </p>
              {/* Re-check button removed */}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
