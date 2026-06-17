import { Routes, Route } from 'react-router-dom'
import { MemphisGate } from './components/MemphisGate'
import { Lobby } from './pages/Lobby'
import { Table } from './pages/Table'

export function App() {
  return (
    <MemphisGate appName="Majlis" tagline="On-chain Estimation & Tarneeb — four players, one fair deal.">
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/t/:id" element={<Table />} />
        <Route path="*" element={<Lobby />} />
      </Routes>
    </MemphisGate>
  )
}
