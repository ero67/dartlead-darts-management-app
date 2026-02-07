import React, { useState, useEffect } from 'react';
import { Monitor, Target, Save, X, Settings } from 'lucide-react';
import { useLiveMatch } from '../contexts/LiveMatchContext';
import { useLanguage } from '../contexts/LanguageContext';

export function DeviceSettings({ isOpen, onClose }) {
  const { deviceId, deviceName, boardNumber, setDeviceInfo } = useLiveMatch();
  const { t } = useLanguage();
  
  const [localDeviceName, setLocalDeviceName] = useState(deviceName || '');
  const [localBoardNumber, setLocalBoardNumber] = useState(boardNumber || '');
  const [saved, setSaved] = useState(false);

  // Update local state when context changes
  useEffect(() => {
    setLocalDeviceName(deviceName || '');
    setLocalBoardNumber(boardNumber || '');
  }, [deviceName, boardNumber]);

  const handleSave = () => {
    const parsedBoardNumber = localBoardNumber ? parseInt(localBoardNumber, 10) : null;
    setDeviceInfo(
      localDeviceName.trim() || null,
      isNaN(parsedBoardNumber) ? null : parsedBoardNumber
    );
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content device-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Settings size={24} />
            {t('deviceSettings.title', 'Nastavenia zariadenia')}
          </h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="device-info-section">
            <div className="device-id-display">
              <Monitor size={16} />
              <span className="device-id-label">Device ID:</span>
              <code className="device-id-value">{deviceId}</code>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="deviceName">
              <Monitor size={16} />
              {t('deviceSettings.deviceName', 'Názov zariadenia')}
            </label>
            <input
              id="deviceName"
              type="text"
              value={localDeviceName}
              onChange={(e) => setLocalDeviceName(e.target.value)}
              placeholder={t('deviceSettings.deviceNamePlaceholder', 'napr. Tablet pri okne')}
              maxLength={50}
            />
            <small className="form-hint">
              {t('deviceSettings.deviceNameHint', 'Vlastný názov pre ľahšiu identifikáciu')}
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="boardNumber">
              <Target size={16} />
              {t('deviceSettings.boardNumber', 'Číslo terča')}
            </label>
            <input
              id="boardNumber"
              type="number"
              min="1"
              max="99"
              value={localBoardNumber}
              onChange={(e) => setLocalBoardNumber(e.target.value)}
              placeholder={t('deviceSettings.boardNumberPlaceholder', 'napr. 1, 2, 3...')}
            />
            <small className="form-hint">
              {t('deviceSettings.boardNumberHint', 'Číslo terča pri ktorom je toto zariadenie')}
            </small>
          </div>

          <div className="device-preview">
            <div className="preview-label">{t('deviceSettings.preview', 'Náhľad zobrazenia')}:</div>
            <div className="preview-content">
              {localBoardNumber ? (
                <span className="board-badge">
                  <Target size={14} />
                  {t('deviceSettings.board', 'Board')} {localBoardNumber}
                </span>
              ) : (
                <span className="board-badge-empty">—</span>
              )}
              {localDeviceName && (
                <span className="device-name-badge">{localDeviceName}</span>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            <X size={16} />
            {t('common.cancel', 'Zrušiť')}
          </button>
          <button 
            className={`save-btn ${saved ? 'saved' : ''}`} 
            onClick={handleSave}
            disabled={saved}
          >
            <Save size={16} />
            {saved ? t('common.saved', 'Uložené!') : t('common.save', 'Uložiť')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Inline component for showing device badge in match lists
export function DeviceBadge({ boardNumber, deviceName, compact = false }) {
  const { t } = useLanguage();
  
  if (!boardNumber && !deviceName) return null;
  
  return (
    <span className={`device-badge ${compact ? 'compact' : ''}`}>
      {boardNumber && (
        <span className="board-indicator">
          <Target size={compact ? 12 : 14} />
          <span>{t('deviceSettings.board', 'Board')} {boardNumber}</span>
        </span>
      )}
      {deviceName && !compact && (
        <span className="device-name-indicator">{deviceName}</span>
      )}
    </span>
  );
}
