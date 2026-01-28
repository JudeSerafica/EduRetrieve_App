import React from 'react';
import { FaSignOutAlt, FaTimes } from 'react-icons/fa';

function LogoutModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div className="logout-modal-overlay" onClick={onClose}>
      <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="logout-modal-header">
          <div className="logout-modal-icon">
            <FaSignOutAlt />
          </div>
          <button className="logout-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        
        <div className="logout-modal-body">
          <h2>Confirm Logout</h2>
          <p>Are you sure you want to log out of the admin panel?</p>
        </div>
        
        <div className="logout-modal-footer">
          <button className="logout-modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="logout-modal-confirm" onClick={onConfirm}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogoutModal;
