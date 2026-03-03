import { useState } from 'react'
import { Header } from './components/Header'
import { JobBoard } from './components/JobBoard'
import { WandBSection } from './components/WandBSection'
import { QuickCommands } from './components/QuickCommands'
import { Preferences } from './components/Preferences'
import './App.css'

function App() {
  const [view, setView] = useState<'main' | 'preferences'>('main')

  return (
    <div className="panel">
      {view === 'main' ? (
        <>
          <Header />
          <main className="panel-body">
            <JobBoard />
            <WandBSection />
            <QuickCommands />
          </main>
          <footer className="panel-footer">
            <button
              className="footer-btn"
              onClick={() => setView('preferences')}
              title="偏好设置"
            >
              ⚙
            </button>
          </footer>
        </>
      ) : (
        <Preferences onClose={() => setView('main')} />
      )}
    </div>
  )
}

export default App
