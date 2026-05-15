import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HostedZonesList } from './pages/HostedZonesList'
import { ZoneRecords } from './pages/ZoneRecords'
import { SmartRulesList } from './pages/SmartRulesList'
import { ApiDocs } from './pages/ApiDocs'
import { DnsReference } from './pages/DnsReference'
import {
  EditRecordModal,
  EditSoaModal,
  RecordDetailsModal,
  SmartRuleDetailsModal,
  CreateZoneModal,
  CreateSmartIPRuleModal,
  AddZonesToRuleModal,
  DeleteConfirmationModal,
} from './components/Modals'
import { ModalProvider } from './context/ModalContext'
import { FeedbackProvider } from './context/FeedbackContext'
import { ThemeProvider } from './context/ThemeContext'
import './styles/globals.css'

function AppContent() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HostedZonesList />} />
        <Route path="/zones/:zoneId" element={<ZoneRecords />} />
        <Route path="/rules" element={<SmartRulesList />} />
        <Route path="/docs" element={<ApiDocs />} />
        <Route path="/reference" element={<DnsReference />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <EditRecordModal />
      <EditSoaModal />
      <RecordDetailsModal />
      <SmartRuleDetailsModal />
      <CreateZoneModal />
      <CreateSmartIPRuleModal />
      <AddZonesToRuleModal />
      <DeleteConfirmationModal />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <FeedbackProvider>
          <ModalProvider>
            <AppContent />
          </ModalProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
