import { useState, useCallback } from 'react'
import { ModalContext } from './ModalContextValue'

/**
 * Modal Context Provider
 * Manages global modal state for all modals in the app
 */
export function ModalProvider({ children }) {
  const [modals, setModals] = useState({
    recordDetails: { isOpen: false, data: null },
    ruleDetails: { isOpen: false, data: null },
    editRecord: { isOpen: false, data: null },
    createZone: { isOpen: false, data: null },
    createRule: { isOpen: false, data: null },
    addZones: { isOpen: false, data: null },
    deleteConfirm: { isOpen: false, data: null },
  })

  const openModal = useCallback((modalName, data = null) => {
    setModals((prev) => ({
      ...prev,
      [modalName]: { isOpen: true, data },
    }))
  }, [])

  const closeModal = useCallback((modalName) => {
    setModals((prev) => ({
      ...prev,
      [modalName]: { isOpen: false, data: null },
    }))
  }, [])

  const closeAllModals = useCallback(() => {
    setModals((prev) =>
      Object.keys(prev).reduce((acc, key) => {
        acc[key] = { isOpen: false, data: null }
        return acc
      }, {})
    )
  }, [])

  const value = {
    modals,
    openModal,
    closeModal,
    closeAllModals,
  }

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>
}
