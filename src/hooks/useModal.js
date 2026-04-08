import { useContext } from 'react'
import { ModalContext } from '../context/ModalContextValue'

/**
 * Custom hook for using modal context
 */
export function useModal(modalName) {
  const context = useContext(ModalContext)

  if (!context) {
    throw new Error('useModal must be used within ModalProvider')
  }

  const { modals, openModal, closeModal } = context
  const modal = modals[modalName]

  return {
    isOpen: modal?.isOpen || false,
    data: modal?.data || null,
    open: (data) => openModal(modalName, data),
    close: () => closeModal(modalName),
  }
}

export default useModal
